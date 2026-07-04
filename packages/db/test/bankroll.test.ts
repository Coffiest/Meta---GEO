import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import {
  completeOnboarding,
  computePayoutStructure,
  getLeaderboard,
  getNetProfit,
  getOrCreateUserByAuthId,
  getPlayerStats,
  recordBuyIn,
  recordPayout,
} from "../src/bankroll.js";

describe("computePayoutStructure (pure function)", () => {
  it("pays the whole pool to nobody when the field is 1 or smaller", () => {
    expect(computePayoutStructure(1, 1000)).toEqual([]);
    expect(computePayoutStructure(0, 1000)).toEqual([]);
  });

  it("pays 1st the most and the total equals the prize pool exactly (SnG-sized field)", () => {
    const payouts = computePayoutStructure(6, 1000);
    expect(payouts).toHaveLength(2);
    expect(payouts[0]!.amount).toBeGreaterThan(payouts[1]!.amount);
    expect(payouts.reduce((sum, p) => sum + p.amount, 0)).toBe(6 * 1000);
  });

  it("pays roughly 15% of the field for a larger (MTT-sized) field, totalling the prize pool exactly", () => {
    const payouts = computePayoutStructure(40, 500);
    expect(payouts).toHaveLength(6); // round(40*0.15) = 6
    expect(payouts.reduce((sum, p) => sum + p.amount, 0)).toBe(40 * 500);
    for (let i = 1; i < payouts.length; i++) {
      expect(payouts[i]!.amount).toBeLessThanOrEqual(payouts[i - 1]!.amount);
    }
  });

  it("pays at least 2 places for a 12-player MTT field", () => {
    const payouts = computePayoutStructure(12, 2000);
    expect(payouts.length).toBeGreaterThanOrEqual(2);
    expect(payouts.reduce((sum, p) => sum + p.amount, 0)).toBe(12 * 2000);
  });
});

describe("bankroll ledger (integration, real Postgres)", () => {
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await prisma.bankrollTransaction.deleteMany({ where: { userId } });
      await prisma.tournamentEntry.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    for (const tournamentId of createdTournamentIds) {
      await prisma.tournament.delete({ where: { id: tournamentId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("creates a not-yet-onboarded user on first login and reuses it afterwards", async () => {
    const authId = `auth-test-${Date.now()}`;
    const first = await getOrCreateUserByAuthId({ authId, email: null, displayName: "BankrollTester" });
    createdUserIds.push(first.id);
    expect(first.isNew).toBe(true);
    expect(first.onboarded).toBe(false);
    expect(await getNetProfit(first.id)).toBe(0); // 疑似通貨ボーナスは存在しない(±方式)

    await completeOnboarding({ userId: first.id, displayName: "改名太郎", avatarKey: "fox" });
    const second = await getOrCreateUserByAuthId({ authId, email: null, displayName: "ignored" });
    expect(second.id).toBe(first.id);
    expect(second.isNew).toBe(false);
    expect(second.onboarded).toBe(true);
    expect(second.displayName).toBe("改名太郎");
    expect(second.avatarKey).toBe("fox");
  });

  it("tracks buy-ins/payouts as a ± ledger and getPlayerStats reflects both correctly", async () => {
    const authId = `auth-test-${Date.now()}-2`;
    const user = await getOrCreateUserByAuthId({ authId, email: null, displayName: "StatsTester" });
    createdUserIds.push(user.id);

    const tournament = await prisma.tournament.create({
      data: { seatCount: 6, startingStack: 20000, buyIn: 500, gameType: "sng", status: "finished" },
    });
    createdTournamentIds.push(tournament.id);
    await prisma.tournamentEntry.create({
      data: { tournamentId: tournament.id, userId: user.id, seatIndex: 0, finishPosition: 1, payout: 1000 },
    });

    await recordBuyIn({ userId: user.id, tournamentId: tournament.id, amount: 500 });
    await recordPayout({ userId: user.id, tournamentId: tournament.id, amount: 1000 });

    expect(await getNetProfit(user.id)).toBe(500); // -500 + 1000

    const stats = await getPlayerStats(user.id);
    expect(stats.tournamentsPlayed).toBe(1);
    expect(stats.itmCount).toBe(1);
    expect(stats.itmRate).toBe(1);
    expect(stats.totalBuyIns).toBe(500);
    expect(stats.totalPayouts).toBe(1000);
    expect(stats.profit).toBe(500);
    expect(stats.roi).toBe(1); // 500/500

    const leaderboard = await getLeaderboard();
    const row = leaderboard.find((r) => r.userId === user.id);
    expect(row).toBeDefined();
    expect(row!.profit).toBe(500);
    expect(row!.tournamentsPlayed).toBe(1);
  });

  it("allows a buy-in even when the running profit would go negative (± model has no balance gate)", async () => {
    const authId = `auth-test-${Date.now()}-3`;
    const user = await getOrCreateUserByAuthId({ authId, email: null, displayName: "MinusTester" });
    createdUserIds.push(user.id);

    const tournament = await prisma.tournament.create({
      data: { seatCount: 6, startingStack: 20000, buyIn: 99999, gameType: "sng", status: "running" },
    });
    createdTournamentIds.push(tournament.id);

    await recordBuyIn({ userId: user.id, tournamentId: tournament.id, amount: 99999 });
    expect(await getNetProfit(user.id)).toBe(-99999);
  });
});
