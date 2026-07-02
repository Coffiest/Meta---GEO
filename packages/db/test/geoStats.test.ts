import { afterAll, describe, expect, it } from "vitest";
import { HandEngine, STARTING_STACK } from "@meta-geo/engine";
import { prisma } from "../src/client.js";
import { recordHand } from "../src/recordHand.js";
import { getGeoSummaryStats, getPositionalRfiStats } from "../src/geoStats.js";

describe("geoStats (integration, real Postgres)", () => {
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];

  afterAll(async () => {
    for (const tournamentId of createdTournamentIds) {
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

  it("counts an UTG open-raise as an RFI opportunity + raise for the UTG position", async () => {
    const users = await Promise.all(
      Array.from({ length: 6 }, (_, i) => prisma.user.create({ data: { displayName: `GeoStatsTest-${i}`, isBot: true } })),
    );
    createdUserIds.push(...users.map((u) => u.id));

    const tournament = await prisma.tournament.create({
      data: { seatCount: 6, startingStack: STARTING_STACK, status: "running" },
    });
    createdTournamentIds.push(tournament.id);
    await prisma.tournamentEntry.createMany({
      data: users.map((u, i) => ({ tournamentId: tournament.id, userId: u.id, seatIndex: i })),
    });

    // buttonFixedPos=0 -> offsets: seat0=BTN, seat1=SB, seat2=BB, seat3=UTG, seat4=HJ, seat5=CO
    const hand = new HandEngine({
      seats: users.map((u, i) => ({ seatIndex: i, playerId: u.id, stack: 20_000 })),
      seatCount: 6,
      buttonFixedPos: 0,
      smallBlindSeat: 1,
      bigBlindSeat: 2,
      smallBlind: 100,
      bigBlind: 200,
      bbAnte: 200,
    });

    // UTG(seat3) opens to 600 -> everyone else folds.
    hand.applyAction(3, { kind: "raise", toAmount: 600 });
    hand.applyAction(4, { kind: "fold" });
    hand.applyAction(5, { kind: "fold" });
    hand.applyAction(0, { kind: "fold" });
    hand.applyAction(1, { kind: "fold" });
    hand.applyAction(2, { kind: "fold" });
    expect(hand.isHandComplete()).toBe(true);

    // DBには他のテスト/セッションのハンドも既に存在しうるため、絶対値ではなく
    // このハンドを記録する前後の差分で検証する。
    const before = await getPositionalRfiStats(6);
    const beforeUtg = before.find((s) => s.position === "UTG")!;
    const beforeHj = before.find((s) => s.position === "HJ")!;
    const summaryBefore = await getGeoSummaryStats();

    await recordHand({
      tournamentId: tournament.id,
      handNumber: 1,
      buttonFixedPos: 0,
      levelSmallBlind: 100,
      levelBigBlind: 200,
      levelAnte: 200,
      seats: users.map((u, i) => ({
        seatIndex: i,
        userId: u.id,
        startingStack: 20_000,
        isSmallBlind: i === 1,
        isBigBlind: i === 2,
      })),
      hand,
    });

    const after = await getPositionalRfiStats(6);
    const afterUtg = after.find((s) => s.position === "UTG")!;
    expect(afterUtg.opportunities - beforeUtg.opportunities).toBe(1);
    expect(afterUtg.raises - beforeUtg.raises).toBe(1);
    expect(afterUtg.limps - beforeUtg.limps).toBe(0);
    expect(afterUtg.folds - beforeUtg.folds).toBe(0);

    // HJ/CO/BTN/SB folded *facing a raise*, not as an RFI opportunity, so they should not be counted.
    const afterHj = after.find((s) => s.position === "HJ")!;
    expect(afterHj.opportunities - beforeHj.opportunities).toBe(0);

    const summaryAfter = await getGeoSummaryStats();
    expect(summaryAfter.totalHands - summaryBefore.totalHands).toBe(1);
    expect(summaryAfter.showdownRate).toBeGreaterThanOrEqual(0);
    expect(summaryAfter.showdownRate).toBeLessThanOrEqual(1);
  });
});
