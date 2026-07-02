import { afterAll, describe, expect, it } from "vitest";
import { HandEngine, STARTING_STACK } from "@meta-geo/engine";
import { prisma } from "../src/client.js";
import { recordHand } from "../src/recordHand.js";

describe("recordHand (integration, real Postgres)", () => {
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];

  afterAll(async () => {
    // テストで作ったデータを掃除する
    for (const tournamentId of createdTournamentIds) {
      await prisma.handPot.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.handAction.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.handSeat.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.hand.deleteMany({ where: { tournamentId } });
      await prisma.tournamentEntry.deleteMany({ where: { tournamentId } });
      await prisma.tournament.delete({ where: { id: tournamentId } });
    }
    for (const userId of createdUserIds) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it("persists a full hand (seats, actions, pots) and reads it back", async () => {
    const users = await Promise.all(
      ["P0", "P1", "P2"].map((name) =>
        prisma.user.create({ data: { displayName: `RecordHandTest-${name}`, isBot: true } }),
      ),
    );
    createdUserIds.push(...users.map((u) => u.id));

    const tournament = await prisma.tournament.create({
      data: { seatCount: 3, startingStack: STARTING_STACK, status: "running" },
    });
    createdTournamentIds.push(tournament.id);

    await prisma.tournamentEntry.createMany({
      data: users.map((u, i) => ({ tournamentId: tournament.id, userId: u.id, seatIndex: i })),
    });

    const hand = new HandEngine({
      seats: users.map((u, i) => ({ seatIndex: i, playerId: u.id, stack: 20_000 })),
      seatCount: 3,
      buttonFixedPos: 0,
      smallBlindSeat: 1,
      bigBlindSeat: 2,
      smallBlind: 100,
      bigBlind: 200,
      bbAnte: 200,
    });

    // UTG(seat0)とSB(seat1)がフォールドし、BB(seat2)が不戦勝
    hand.applyAction(0, { kind: "fold" });
    hand.applyAction(1, { kind: "fold" });
    expect(hand.isHandComplete()).toBe(true);

    const handId = await recordHand({
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

    const stored = await prisma.hand.findUniqueOrThrow({
      where: { id: handId },
      include: { seats: true, actions: { orderBy: { sequenceNumber: "asc" } }, pots: true },
    });

    expect(stored.tournamentId).toBe(tournament.id);
    expect(stored.wonByFold).toBe(true);
    expect(stored.seats).toHaveLength(3);

    // 全員のホールカードが(フォールドした人も含めて)記録されている
    for (const seat of stored.seats) {
      expect(seat.holeCards).toHaveLength(2);
    }

    const bbSeat = stored.seats.find((s) => s.seatIndex === 2)!;
    expect(bbSeat.isBigBlind).toBe(true);
    // BB自身の拠出(ブラインド+アンテ)は全額返り、SBが払った100だけを正味で獲得する
    expect(bbSeat.resultStackDelta).toBe(100);

    const foldActions = stored.actions.filter((a) => a.kind === "fold");
    expect(foldActions).toHaveLength(2);
    expect(foldActions[0]!.street).toBe("preflop");

    expect(stored.pots).toHaveLength(1);
    expect(stored.pots[0]!.winnerUserIds).toEqual([users[2]!.id]);
  });
});
