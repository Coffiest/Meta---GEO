import { afterAll, describe, expect, it } from "vitest";
import { HandEngine, type PlayerAction } from "@meta-geo/engine";
import { prisma } from "../src/client.js";
import { recordHand } from "../src/recordHand.js";
import {
  SNG_PAYOUTS,
  completeOnboarding,
  computeMttPrizeStructure,
  computePayoutStructure,
  getLeaderboard,
  getNetProfit,
  getOrCreateUserByAuthId,
  getPlayerStats,
  recordBuyIn,
  recordPayout,
} from "../src/bankroll.js";

describe("computePayoutStructure (SNG fixed prizes + MTT delegation)", () => {
  it("pays nobody when the field is 1 or smaller", () => {
    expect(computePayoutStructure(1, 1000)).toEqual([]);
    expect(computePayoutStructure(0, 1000)).toEqual([]);
  });

  it("SNG (<=6 players, $1000 buy-in) always pays the fixed $4,000/$2,000 prizes", () => {
    const payouts = computePayoutStructure(6, 1000);
    expect(payouts).toEqual(SNG_PAYOUTS);
    expect(payouts[0]!.amount).toBe(4000);
    expect(payouts[1]!.amount).toBe(2000);
  });
});

describe("computeMttPrizeStructure (WSOP-style: 93% return rate, top ~15% paid)", () => {
  it("pays roughly 15% of the field, totalling exactly 93% of the prize pool", () => {
    const { places, prizePool } = computeMttPrizeStructure(40, 500);
    expect(places).toHaveLength(6); // round(40*0.15) = 6
    expect(prizePool).toBe(Math.round((40 * 500 * 0.93) / 10) * 10);
    expect(places.reduce((sum, p) => sum + p.amount, 0)).toBe(prizePool);
    for (let i = 1; i < places.length; i++) {
      expect(places[i]!.amount).toBeLessThanOrEqual(places[i - 1]!.amount);
    }
  });

  it("pays at least 2 places for a 12-player MTT field, totalling exactly the (93%) prize pool", () => {
    const { places, prizePool } = computeMttPrizeStructure(12, 2000);
    expect(places.length).toBeGreaterThanOrEqual(2);
    expect(prizePool).toBeLessThan(12 * 2000);
    expect(places.reduce((sum, p) => sum + p.amount, 0)).toBe(prizePool);
  });

  it("nobody finishes below the minimum cash (~1.5x buy-in)", () => {
    const { places } = computeMttPrizeStructure(60, 2000);
    const minCash = Math.round((2000 * 1.5) / 10) * 10;
    for (const p of places) expect(p.amount).toBeGreaterThanOrEqual(minCash);
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
    expect(stats.roi).toBe(2); // 得た金額1000 / かけた金額500 = 200%還元
    expect(stats.vpipOpportunities).toBe(0); // このテストはハンドを記録していないので機会0

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

describe("getPlayerStats VPIP/PFR/3Bet (integration, real Postgres)", () => {
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];

  afterAll(async () => {
    for (const tournamentId of createdTournamentIds) {
      await prisma.handPot.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.handAction.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.handSeat.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.hand.deleteMany({ where: { tournamentId } });
      await prisma.tournament.delete({ where: { id: tournamentId } });
    }
    for (const userId of createdUserIds) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it("aggregates VPIP/PFR/3Bet from preflop action logs, excluding BB's free check in an unraised pot", async () => {
    const [u, a, b] = await Promise.all(
      ["Target", "OppA", "OppB"].map((name) =>
        prisma.user.create({ data: { displayName: `PreflopStatsTest-${name}`, isBot: true } }),
      ),
    );
    createdUserIds.push(u.id, a.id, b.id);

    const tournament = await prisma.tournament.create({
      data: { seatCount: 3, startingStack: 20_000, status: "running" },
    });
    createdTournamentIds.push(tournament.id);

    // 3人テーブル(seat0=BTN, seat1=SB, seat2=BB)でハンドを1つ再生し、DBへ記録するヘルパー。
    // 指定したプリフロップアクションを適用した後は、残りをフォールドで畳んで完了させる
    // (postflopの挙動はVPIP/PFR/3Betの集計に影響しないため無視してよい)。
    async function playHand(
      handNumber: number,
      seatUsers: readonly { id: string }[],
      actions: readonly (readonly [number, PlayerAction])[],
    ): Promise<void> {
      const hand = new HandEngine({
        seats: seatUsers.map((user, i) => ({ seatIndex: i, playerId: user.id, stack: 20_000 })),
        seatCount: 3,
        buttonFixedPos: 0,
        smallBlindSeat: 1,
        bigBlindSeat: 2,
        smallBlind: 100,
        bigBlind: 200,
        bbAnte: 200,
      });
      for (const [seatIndex, action] of actions) hand.applyAction(seatIndex, action);
      while (!hand.isHandComplete()) {
        const seatIndex = hand.getActingSeatIndex();
        if (seatIndex === null) break;
        hand.applyAction(seatIndex, { kind: "fold" });
      }
      await recordHand({
        tournamentId: tournament.id,
        handNumber,
        buttonFixedPos: 0,
        levelSmallBlind: 100,
        levelBigBlind: 200,
        levelAnte: 200,
        seats: seatUsers.map((user, i) => ({
          seatIndex: i,
          userId: user.id,
          startingStack: 20_000,
          isSmallBlind: i === 1,
          isBigBlind: i === 2,
        })),
        hand,
      });
    }

    // Hand1: U(seat0=BTN)がオープンレイズ → VPIP・PFRの機会/回数それぞれ+1
    await playHand(1, [u, a, b], [[0, { kind: "raise", toAmount: 600 }]]);

    // Hand2: U(seat2=BB)が1回だけのレイズに対してリレイズ(3ベット) → VPIP・PFR・3Betすべて+1
    await playHand(2, [a, b, u], [
      [0, { kind: "raise", toAmount: 600 }],
      [1, { kind: "fold" }],
      [2, { kind: "raise", toAmount: 1800 }],
    ]);

    // Hand3: U(seat2=BB)がアンレイズドポットでチェック → VPIP・PFRの機会/回数どちらにも含まれない
    await playHand(3, [a, b, u], [
      [0, { kind: "call" }],
      [1, { kind: "call" }],
      [2, { kind: "check" }],
    ]);

    const stats = await getPlayerStats(u.id);
    expect(stats.vpipOpportunities).toBe(2); // Hand1・Hand2のみ(Hand3はBBフリーチェックで除外)
    expect(stats.vpipCount).toBe(2);
    expect(stats.pfrOpportunities).toBe(2);
    expect(stats.pfrCount).toBe(2);
    expect(stats.threeBetOpportunities).toBe(1); // Hand2のみ(1回だけレイズに直面)
    expect(stats.threeBetCount).toBe(1);
  });
});
