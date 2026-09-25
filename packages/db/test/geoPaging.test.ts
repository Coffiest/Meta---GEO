import { afterAll, describe, expect, it } from "vitest";
import { HandEngine } from "@meta-geo/engine";
import { prisma } from "../src/client.js";
import { recordHand } from "../src/recordHand.js";
import { clearRawHandsCache, getPreflopNode } from "../src/geoTree.js";

/**
 * リプレイ経路のハンド走査がページ境界を正しく跨げることを検証する。
 *
 * 以前は該当ハンドを一度に全件メモリへ載せていたため、本番(512MBのVM)では履歴が1万件を
 * 超えた時点で読み込み中にOOMでプロセスごと落ちていた。インメモリで卓を持っているサーバー
 * なので、GEOを開くだけで対戦中の卓が消えるという壊れ方をしていた。
 *
 * 対策としてカーソルページング(HAND_PAGE_SIZE件ずつ読んで捨てる)へ変えたが、
 * ページングは「境界でハンドを取りこぼす/二重に数える」という形で静かに壊れうる。
 * 既存のGEOテストは数件しかseedしないので1ページに収まってしまい、この失敗を踏めない。
 * ここでは意図的に1ページを超える件数をseedし、集計件数が seed した件数と厳密に
 * 一致することを確かめる。
 */

/** geoTree.ts の HAND_PAGE_SIZE(300)より確実に多く、かつテストが重くなりすぎない件数。 */
const HAND_COUNT = 350;

describe("GEO replay paging (integration, real Postgres)", () => {
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

  it("counts every hand exactly once across page boundaries", async () => {
    // 他のテストが残したデータと混ざらないよう、seed前の集計値を基準にして差分で検証する。
    const params = { stackBucket: "30+" as const, bubbleStage: "normal" as const, line: [] };
    clearRawHandsCache();
    const before = await getPreflopNode(params);

    const users = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        prisma.user.create({ data: { displayName: `GeoPagingTest-${i}`, isBot: false } }),
      ),
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

    // 全ハンド同型: UTG(seat 3)が2.2bbオープンし、他は全員フォールド。
    // ルートノードの意思決定は必ず「UTGのraise2-5」1件になるので、
    // 集計件数がそのまま「走査できたハンド数」になる。
    for (let n = 1; n <= HAND_COUNT; n += 1) {
      const hand = new HandEngine({
        seats: users.map((u, i) => ({ seatIndex: i, playerId: u.id, stack: 20_000 })),
        seatCount: 6,
        buttonFixedPos: 0,
        smallBlindSeat: 1,
        bigBlindSeat: 2,
        smallBlind: 100,
        bigBlind: 200,
        bbAnte: 0,
      });
      hand.applyAction(3, { kind: "raise", toAmount: 440 });
      for (const seatIndex of [4, 5, 0, 1, 2]) hand.applyAction(seatIndex, { kind: "fold" });

      await recordHand({
        tournamentId: tournament.id,
        handNumber: n,
        buttonFixedPos: 0,
        levelSmallBlind: 100,
        levelBigBlind: 200,
        levelAnte: 0,
        seats,
        hand,
      });
    }

    clearRawHandsCache();
    const after = await getPreflopNode(params);

    // 1ページ(300件)を確実に超えていること。超えていなければこのテストは境界を踏めていない。
    expect(HAND_COUNT).toBeGreaterThan(300);

    // 取りこぼしも二重計上も無く、seedした件数ちょうどだけ増える。
    expect(after.node.sampleSize - before.node.sampleSize).toBe(HAND_COUNT);
    expect(after.matrix.totalSamples - before.matrix.totalSamples).toBe(HAND_COUNT);
    expect(after.node.position).toBe("UTG");

    // UTGの次(seat 4)のノードでも同じだけ増えること(2段目のライン一致でも件数が保たれる)。
    const nextParams = {
      stackBucket: "30+" as const,
      bubbleStage: "normal" as const,
      line: [{ position: "UTG", bucket: "raise2-5" }],
    };
    clearRawHandsCache();
    const nextNode = await getPreflopNode(nextParams);
    expect(nextNode.node.sampleSize).toBeGreaterThanOrEqual(HAND_COUNT);
  }, 180_000);
});
