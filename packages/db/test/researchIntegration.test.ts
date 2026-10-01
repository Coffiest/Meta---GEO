import { afterAll, describe, expect, it } from "vitest";
import { HandEngine } from "@meta-geo/engine";
import { prisma } from "../src/client.js";
import { recordHand, type ActionTiming } from "../src/recordHand.js";
import { rebuildDecisionFactsForHand } from "../src/decisionFacts.js";
import {
  RESEARCH_DIMENSIONS,
  RESEARCH_METRICS,
  researchCrosstab,
  researchSampleCount,
  type ResearchDimension,
  type ResearchMetric,
} from "../src/researchQuery.js";

/**
 * 研究データの通し(実 Postgres): ハンド記録 → DecisionFact 生成 → 全軸 × 全指標の集計 SQL が通ること。
 * 軸・指標の SQL は文字列で組んでいるので、型チェックでは誤りを拾えない。ここで全組み合わせを実行して確かめる。
 */
describe("research decision facts (integration, real Postgres)", () => {
  const userIds: string[] = [];
  let tournamentId = "";

  afterAll(async () => {
    if (tournamentId) {
      await prisma.decisionFact.deleteMany({ where: { tournamentId } });
      await prisma.geoDecision.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.handAction.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.handSeat.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.handPot.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.hand.deleteMany({ where: { tournamentId } });
      await prisma.tournamentEntry.deleteMany({ where: { tournamentId } });
      await prisma.tournament.delete({ where: { id: tournamentId } });
    }
    for (const id of userIds) await prisma.user.delete({ where: { id } });
    await prisma.$disconnect();
  });

  it("記録したハンドから行を作り、全軸 × 全指標で集計できる", async () => {
    const users = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        prisma.user.create({ data: { displayName: `ResearchTest-${i}`, isBot: i >= 4 } }),
      ),
    );
    userIds.push(...users.map((u) => u.id));
    const tournament = await prisma.tournament.create({
      data: { seatCount: 6, startingStack: 20_000, status: "running", gameType: "sng" },
    });
    tournamentId = tournament.id;
    await prisma.tournamentEntry.createMany({
      data: users.map((u, i) => ({ tournamentId, userId: u.id, seatIndex: i })),
    });

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
    hand.applyAction(4, { kind: "fold" });
    hand.applyAction(5, { kind: "fold" });
    hand.applyAction(0, { kind: "fold" });
    hand.applyAction(1, { kind: "fold" });
    hand.applyAction(2, { kind: "call" });
    hand.applyAction(2, { kind: "check" });
    hand.applyAction(3, { kind: "bet", toAmount: 300 });
    hand.applyAction(2, { kind: "fold" });

    const t0 = new Date("2026-10-01T00:00:00Z");
    const timings = new Map<number, ActionTiming>();
    for (let seq = 1; seq <= 20; seq++) {
      timings.set(seq, {
        turnStartedAt: new Date(t0.getTime() + seq * 10_000),
        actedAt: new Date(t0.getTime() + seq * 10_000 + 3_000),
        thinkMs: 3_000,
        timedOut: false,
        timeBankUsed: false,
      });
    }

    const handId = await recordHand({
      tournamentId,
      handNumber: 1,
      buttonFixedPos: 0,
      levelSmallBlind: 100,
      levelBigBlind: 200,
      levelAnte: 0,
      seats: users.map((u, i) => ({ seatIndex: i, userId: u.id, startingStack: 20_000, isSmallBlind: i === 1, isBigBlind: i === 2 })),
      hand,
      research: {
        startedAt: t0,
        endedAt: new Date(t0.getTime() + 120_000),
        playersRemaining: 6,
        entryCount: 6,
        payouts: [650, 350],
        fieldStacks: Array.from({ length: 6 }, () => 20_000),
        timings,
      },
    });

    // recordHand が自動で作る。作り直しても同じ行数(冪等)。
    const written = await prisma.decisionFact.count({ where: { handId } });
    expect(written).toBeGreaterThan(0);
    expect(await rebuildDecisionFactsForHand(handId)).toBe(written);

    const persisted = await prisma.handAction.findFirstOrThrow({ where: { handId, kind: "raise" } });
    expect(persisted.thinkMs).toBe(3_000);

    const raise = await prisma.decisionFact.findFirstOrThrow({ where: { handId, kind: "raise" } });
    expect(raise).toMatchObject({ position: "UTG", thinkBucket: "2-5s", bubbleStage: "early", itmPlaces: 2 });
    expect(raise.itmProb).toBeCloseTo(2 / 6, 3);

    // 全軸 × 全指標の SQL が通る。集計は人間の行だけ(自動の席のフォールドは数えない)。
    for (const dimension of Object.keys(RESEARCH_DIMENSIONS) as ResearchDimension[]) {
      for (const metric of Object.keys(RESEARCH_METRICS) as ResearchMetric[]) {
        const r = await researchCrosstab({ dimension, metric, scope: "me", userId: users[3]!.id, filters: { days: 3650 } });
        expect(r.overall.n, `${dimension} × ${metric}`).toBeGreaterThan(0);
      }
    }
    const humans = await prisma.decisionFact.count({ where: { handId, isBot: false } });
    const all = await researchCrosstab({
      dimension: "street",
      metric: "foldRate",
      scope: "all",
      userId: users[0]!.id,
      filters: { street: "preflop", gameType: "sng", position: "UTG", facingBet: true },
    });
    expect(all.overall.n).toBe(1);
    expect((await researchSampleCount("all", users[0]!.id)).decisions).toBeGreaterThanOrEqual(humans);
  });
});
