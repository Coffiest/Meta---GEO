import { afterAll, describe, expect, it } from "vitest";
import { HandEngine } from "@meta-geo/engine";
import { prisma } from "../src/client.js";
import { recordHand } from "../src/recordHand.js";
import { clearRawHandsCache, getPreflopNode, type LineStep } from "../src/geoTree.js";

/**
 * 卓の人数が混ざったときの挙動を固定する。
 *
 * ラインはポジション名の並びだけで表すが、人数が違うとアクション順そのものが変わる。
 * 6人卓は UTG→HJ→CO→BTN→SB→BB、5人卓は UTG→CO→BTN→SB→BB、4人卓は UTG→BTN→SB→BB。
 * そのため "UTG:fold" という同じラインが、6人卓のHJ・5人卓のCO・4人卓のBTNを1つのノードへ
 * 合流させる。人数で絞れば混ざらない、という前提が崩れていないことをここで担保する。
 *
 * 既存の一致テスト(geoDecision.test.ts)は6人卓しかseedしないため、この失敗を踏めなかった。
 * 実際、集計テーブル経路がノードのポジション名を GROUP BY の先頭行から採っていたせいで、
 * 本番では旧経路が UTG を返すノードで新経路が BTN(SB) を返していた。
 */

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

describe("GEO tree with mixed table sizes (integration, real Postgres)", () => {
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

  it("keeps positions consistent per table size, and agrees between both paths", async () => {
    const users = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        prisma.user.create({ data: { displayName: `GeoMixTest-${i}`, isBot: false } }),
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

    /**
     * 指定の席だけが着席している卓で1ハンド打つ。UTG(最初に行動する席)がオープンし、
     * 残りは全員フォールドする。
     */
    async function playHand(seatIndexes: number[], handNumber: number): Promise<void> {
      // BTN=0, SB=1, BB=2 を固定し、着席者だけを渡す。BBの次に座っている人が最初に行動する。
      const seated = seatIndexes.slice().sort((a, b) => a - b);
      const hand = new HandEngine({
        seats: seated.map((i) => ({ seatIndex: i, playerId: users[i]!.id, stack: 20_000 })),
        seatCount: 6,
        buttonFixedPos: 0,
        smallBlindSeat: seated.includes(1) ? 1 : null,
        bigBlindSeat: 2,
        smallBlind: 100,
        bigBlind: 200,
        bbAnte: 0,
      });
      // 手番の順にアクションを積む。誰が最初かは席の並びで決まるので、エンジンに聞く。
      for (let guard = 0; guard < 20; guard += 1) {
        const toAct = hand.getActingSeatIndex();
        if (toAct === null || hand.getStreet() !== "preflop") break;
        // 最初の1人だけオープンレイズし、以降は降りる。
        if (guard === 0) hand.applyAction(toAct, { kind: "raise", toAmount: 440 });
        else hand.applyAction(toAct, { kind: "fold" });
      }

      await recordHand({
        tournamentId: tournament.id,
        handNumber,
        buttonFixedPos: 0,
        levelSmallBlind: 100,
        levelBigBlind: 200,
        levelAnte: 0,
        seats: seated.map((i) => ({
          seatIndex: i,
          userId: users[i]!.id,
          startingStack: 20_000,
          isSmallBlind: i === 1,
          isBigBlind: i === 2,
        })),
        hand,
      });
    }

    // 6人卓を2ハンド、4人卓を3ハンド。同じ "UTG:fold" ラインで別のポジションが続く形にする。
    await playHand([0, 1, 2, 3, 4, 5], 1);
    await playHand([0, 1, 2, 3, 4, 5], 2);
    await playHand([0, 1, 2, 3], 3);
    await playHand([0, 1, 2, 3], 4);
    await playHand([0, 1, 2, 3], 5);

    const line: LineStep[] = [{ position: "UTG", bucket: "raise2-5" }];
    const cases: { playerCount: number; line: LineStep[] }[] = [
      { playerCount: 6, line: [] },
      { playerCount: 6, line },
      { playerCount: 4, line: [] },
      { playerCount: 4, line },
    ];

    for (const c of cases) {
      const params = { stackBucket: "30+" as const, bubbleStage: "normal" as const, ...c };
      const legacy = await withDecisionTable(false, async () => {
        clearRawHandsCache();
        return getPreflopNode(params);
      });
      const next = await withDecisionTable(true, () => getPreflopNode(params));
      const label = `playerCount=${c.playerCount} line=${JSON.stringify(c.line)}`;
      // 両経路が同じポジション名・同じサンプル数を返すこと。
      expect(next.node.position, `${label} position`).toBe(legacy.node.position);
      expect(next.node.sampleSize, `${label} sampleSize`).toBe(legacy.node.sampleSize);
    }

    // 素通り比較になっていないこと: 人数ごとに実際のデータがあり、かつ
    // 同じラインでも人数によって「次に動くポジション」が違うことを直接確かめる。
    const at = async (playerCount: number, l: LineStep[]) =>
      withDecisionTable(true, () =>
        getPreflopNode({ stackBucket: "30+", bubbleStage: "normal", playerCount, line: l }),
      );

    const root6 = await at(6, []);
    const root4 = await at(4, []);
    expect(root6.node.position).toBe("UTG");
    expect(root4.node.position).toBe("UTG");
    expect(root6.node.sampleSize).toBeGreaterThanOrEqual(2);
    expect(root4.node.sampleSize).toBeGreaterThanOrEqual(3);

    // ここが本丸。同じ "UTG:raise2-5" の次は、6人卓ならHJ、4人卓ならBTN。
    // 人数で絞らないとこの2つが1つのノードに混ざる。
    const next6 = await at(6, line);
    const next4 = await at(4, line);
    expect(next6.node.position, "6人卓のUTGの次はHJ").toBe("HJ");
    expect(next4.node.position, "4人卓のUTGの次はBTN").toBe("BTN");
    expect(next4.node.sampleSize, "4人卓(通常)のBTNは3ハンドぶん").toBe(3);

    // --- 人数を揃えてもアクション順が1通りとは限らない(デッドボタン方式) ---
    //
    // 席1(SB)を空けた4人卓を作る。SBがデッドになり、席3=UTG・席4=CO・席0=BTN・席2=BB と
    // 命名されるので、アクション順は UTG→CO→BTN→BB になる。通常の4人卓(UTG→BTN→SB→BB)と
    // 同じ "UTG:raise2-5" ラインなのに、次に動くポジションが CO と BTN で食い違う。
    await playHand([0, 2, 3, 4], 6);
    await playHand([0, 2, 3, 4], 7);

    const deadSbRoot = await at(4, []);
    expect(deadSbRoot.node.position, "どちらの並びでも最初はUTG").toBe("UTG");
    expect(deadSbRoot.node.sampleSize, "通常3 + SBデッド2 = 5ハンド").toBe(5);

    // 次のノードは2つの並びが競合する。多い方(通常の並びのBTN=3件)に揃え、
    // 少ない方(SBデッドのCO=2件)を混ぜないこと。混ぜると別スポットの頻度が合算されてしまう。
    const contested = await at(4, line);
    expect(contested.node.position, "多数派の並びに揃える").toBe("BTN");
    expect(contested.node.sampleSize, "COの2件を混ぜず、BTNの3件だけ数える").toBe(3);

    // 旧経路も同じ結論になること(両経路が食い違うと画面が不安定になる)。
    const contestedLegacy = await withDecisionTable(false, async () => {
      clearRawHandsCache();
      return getPreflopNode({ stackBucket: "30+", bubbleStage: "normal", playerCount: 4, line });
    });
    expect(contestedLegacy.node.position).toBe(contested.node.position);
    expect(contestedLegacy.node.sampleSize).toBe(contested.node.sampleSize);
  }, 120_000);
});
