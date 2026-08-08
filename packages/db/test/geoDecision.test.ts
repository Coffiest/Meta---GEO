import { afterAll, describe, expect, it } from "vitest";
import { HandEngine } from "@meta-geo/engine";
import { prisma } from "../src/client.js";
import { recordHand } from "../src/recordHand.js";
import {
  clearRawHandsCache,
  getPreflopNode,
  getPostflopNode,
  rebuildGeoDecisionsForHand,
  type BubbleStage,
  type LineStep,
  type StackBucket,
} from "../src/geoTree.js";

/**
 * 集計テーブル(GeoDecision)経由の集計が、旧経路(全履歴リプレイ)と完全に一致することを検証する。
 *
 * 段階2の要はここ。応答は速くなっても値が変わってしまっては意味がないので、同じデータに対して
 * 両経路を走らせ、options / matrix / position / sampleSize が一致することを直接突き合わせる。
 */

/** フラグを一時的に切り替えて関数を実行する。 */
async function withDecisionTable<T>(enabled: boolean, fn: () => Promise<T>): Promise<T> {
  const prev = process.env["GEO_USE_DECISION_TABLE"];
  if (enabled) process.env["GEO_USE_DECISION_TABLE"] = "1";
  else delete process.env["GEO_USE_DECISION_TABLE"];
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env["GEO_USE_DECISION_TABLE"];
    else process.env["GEO_USE_DECISION_TABLE"] = prev;
  }
}

/** 比較しやすいように options を bucket 名でソートして正規化する(順序は集計順に依存するため)。 */
function normalize(result: Awaited<ReturnType<typeof getPreflopNode>>) {
  return {
    position: result.node.position,
    sampleSize: result.node.sampleSize,
    options: [...result.node.options].sort((a, b) => a.bucket.localeCompare(b.bucket)),
    totalSamples: result.matrix.totalSamples,
    // 件数のあるセルだけを比較対象にする(空セルは169個あり差分が読みにくいため)。
    cells: result.matrix.cells
      .flat()
      .filter((c) => c.count > 0)
      .map((c) => ({ label: c.label, count: c.count, byBucket: c.byBucket }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

describe("GeoDecision aggregation parity (integration, real Postgres)", () => {
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];

  afterAll(async () => {
    for (const tournamentId of createdTournamentIds) {
      await prisma.geoDecision.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.handAction.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.handSeat.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.handPot.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.hand.deleteMany({ where: { tournamentId } });
      await prisma.tournamentEntry.deleteMany({ where: { tournamentId } });
      await prisma.tournament.delete({ where: { id: tournamentId } });
    }
    for (const userId of createdUserIds) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it("returns identical results to the legacy replay path (preflop and postflop)", async () => {
    const users = await Promise.all(
      Array.from({ length: 6 }, (_, i) => prisma.user.create({ data: { displayName: `GeoDecTest-${i}`, isBot: false } })),
    );
    createdUserIds.push(...users.map((u) => u.id));

    const tournament = await prisma.tournament.create({
      data: { seatCount: 6, startingStack: 20_000, status: "running", gameType: "sng" },
    });
    createdTournamentIds.push(tournament.id);
    await prisma.tournamentEntry.createMany({
      data: users.map((u, i) => ({ tournamentId: tournament.id, userId: u.id, seatIndex: i })),
    });

    const seats = users.map((u, i) => ({
      seatIndex: i,
      userId: u.id,
      startingStack: 20_000,
      isSmallBlind: i === 1,
      isBigBlind: i === 2,
    }));

    // ハンド1: UTGオープン → BBコール → フロップでBBチェック・UTGベット → BBコール → ターンで両者チェック。
    // プリフロップとポストフロップの両方に実プレイヤーの意思決定が並ぶ形にする。
    const h1 = new HandEngine({
      seats: users.map((u, i) => ({ seatIndex: i, playerId: u.id, stack: 20_000 })),
      seatCount: 6,
      buttonFixedPos: 0,
      smallBlindSeat: 1,
      bigBlindSeat: 2,
      smallBlind: 100,
      bigBlind: 200,
      bbAnte: 0,
    });
    h1.applyAction(3, { kind: "raise", toAmount: 440 });
    h1.applyAction(4, { kind: "fold" });
    h1.applyAction(5, { kind: "fold" });
    h1.applyAction(0, { kind: "fold" });
    h1.applyAction(1, { kind: "fold" });
    h1.applyAction(2, { kind: "call" });
    // フロップ以降
    h1.applyAction(2, { kind: "check" });
    h1.applyAction(3, { kind: "bet", toAmount: 300 });
    h1.applyAction(2, { kind: "call" });
    h1.applyAction(2, { kind: "check" });
    h1.applyAction(3, { kind: "check" });
    h1.applyAction(2, { kind: "check" });
    h1.applyAction(3, { kind: "check" });

    const handId = await recordHand({
      tournamentId: tournament.id,
      handNumber: 1,
      buttonFixedPos: 0,
      levelSmallBlind: 100,
      levelBigBlind: 200,
      levelAnte: 0,
      seats,
      hand: h1,
    });

    // 集計テーブルを作る(本番ではハンド記録時に自動で作られる)。
    const written = await rebuildGeoDecisionsForHand(handId);
    expect(written).toBeGreaterThan(0);

    // 冪等性: もう一度作り直しても行数は変わらない。
    const rewritten = await rebuildGeoDecisionsForHand(handId);
    expect(rewritten).toBe(written);
    expect(await prisma.geoDecision.count({ where: { handId } })).toBe(written);

    const persisted = await prisma.hand.findUniqueOrThrow({ where: { id: handId }, select: { board: true } });
    const flop = persisted.board.slice(0, 3);

    const preflopCases: { stackBucket: StackBucket; bubbleStage: BubbleStage; line: LineStep[] }[] = [
      { stackBucket: "30+", bubbleStage: "normal", line: [] },
      { stackBucket: "30+", bubbleStage: "normal", line: [{ position: "UTG", bucket: "raise2-5" }] },
      // サンプルが1件も無いケース(ポジション名のフォールバックが効くこと)。
      { stackBucket: "0-5", bubbleStage: "normal", line: [] },
      // 存在しないライン。
      { stackBucket: "30+", bubbleStage: "normal", line: [{ position: "UTG", bucket: "allIn" }] },
    ];

    for (const params of preflopCases) {
      const legacy = await withDecisionTable(false, async () => {
        clearRawHandsCache();
        return getPreflopNode(params);
      });
      const next = await withDecisionTable(true, () => getPreflopNode(params));
      expect(normalize(next), `preflop line=${JSON.stringify(params.line)} bucket=${params.stackBucket}`).toEqual(
        normalize(legacy),
      );
    }

    // 両経路とも空を返しているだけの「素通り」比較になっていないことを確かめる。
    const rootNext = await withDecisionTable(true, () => getPreflopNode(preflopCases[0]!));
    expect(rootNext.node.position).toBe("UTG");
    expect(rootNext.node.sampleSize).toBeGreaterThan(0);
    expect(rootNext.matrix.cells.flat().some((c) => c.count > 0)).toBe(true);
    // サンプルが無いスタック帯でも、ポジション名だけは旧経路と同じく出る。
    const emptyNext = await withDecisionTable(true, () => getPreflopNode(preflopCases[2]!));
    expect(emptyNext.node.sampleSize).toBe(0);
    expect(emptyNext.node.position).toBe("UTG");

    const preflopLine: LineStep[] = [
      { position: "UTG", bucket: "raise2-5" },
      { position: "HJ", bucket: "fold" },
      { position: "CO", bucket: "fold" },
      { position: "BTN", bucket: "fold" },
      { position: "SB", bucket: "fold" },
      { position: "BB", bucket: "call" },
    ];

    const postflopCases: { postflopLine: LineStep[] }[] = [
      { postflopLine: [] },
      { postflopLine: [{ position: "BB", bucket: "checkOrCall" }] },
    ];

    for (const { postflopLine } of postflopCases) {
      const params = {
        stackBucket: "30+" as StackBucket,
        bubbleStage: "normal" as BubbleStage,
        preflopLine,
        board: flop,
        street: "flop" as const,
        postflopLine,
      };
      const legacy = await withDecisionTable(false, async () => {
        clearRawHandsCache();
        return getPostflopNode(params);
      });
      const next = await withDecisionTable(true, () => getPostflopNode(params));
      expect(normalize(next), `postflop line=${JSON.stringify(postflopLine)}`).toEqual(normalize(legacy));
      // ポストフロップ側も空同士の比較になっていないことを確かめる。
      expect(next.node.sampleSize, `postflop line=${JSON.stringify(postflopLine)} has samples`).toBeGreaterThan(0);
    }
  });
});
