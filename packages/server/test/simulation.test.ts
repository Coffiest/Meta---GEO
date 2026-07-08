import { describe, expect, it } from "vitest";
import { Tournament, STARTING_STACK, type Card, type HandEngine } from "@meta-geo/engine";
import { decideBotAction } from "../src/bot.js";

/** シード付き擬似乱数(決定論的なテスト実行用) */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function playHandWithBots(hand: HandEngine, rand: () => number): void {
  let guard = 0;
  while (!hand.isHandComplete()) {
    guard++;
    if (guard > 500) throw new Error("Hand did not complete within a reasonable number of actions");
    const seatIndex = hand.getActingSeatIndex();
    if (seatIndex === null) throw new Error("No acting seat but hand is not complete");

    const state = hand.getPublicState();
    const seat = state.seats.find((s) => s.seatIndex === seatIndex)!;

    const action = decideBotAction({
      street: state.street,
      holeCards: getHoleCardsUnsafe(hand, seatIndex),
      board: state.board,
      currentBetToMatch: state.currentBetToMatch,
      streetContribution: seat.streetContribution,
      minRaiseToAmount: hand.getMinRaiseToAmount(),
      potBefore: state.potTotal,
      stack: seat.stack,
      canRaise: !seat.hasActedThisStreet,
      random: rand,
    });

    try {
      hand.applyAction(seatIndex, action);
    } catch {
      hand.applyAction(seatIndex, { kind: "fold" });
    }
  }
}

function getHoleCardsUnsafe(hand: HandEngine, seatIndex: number): readonly [Card, Card] {
  const cards = hand.getSeatHoleCards(seatIndex);
  if (cards.length !== 2) throw new Error("expected exactly 2 hole cards");
  return cards as unknown as readonly [Card, Card];
}

describe("full tournament simulation with rule-based bots", () => {
  it("runs a 6-max SnG to completion without illegal actions and conserves chips", () => {
    const rand = mulberry32(42);
    const tournament = new Tournament({
      seatCount: 6,
      players: Array.from({ length: 6 }, (_, i) => ({
        playerId: `bot-${i}`,
        displayName: `Bot ${i}`,
        seatIndex: i,
      })),
    });

    const totalStartingChips = 6 * STARTING_STACK;
    let handsPlayed = 0;
    const maxHands = 1000;
    // 本番はウォールクロックで5分ごとにブラインドが上がるが、シミュレーションでは
    // 「1レベル=十数ハンド経過」とみなして進行を早める。
    const handsPerLevel = 15;

    while (!tournament.isTournamentOver() && handsPlayed < maxHands) {
      handsPlayed++;
      if (handsPlayed % handsPerLevel === 0) tournament.advanceToNextLevel();

      const hand = tournament.startNextHand();
      playHandWithBots(hand, rand);
      tournament.settleFinishedHand();

      const totalChips = tournament.getSeats().reduce((sum, s) => sum + s.stack, 0);
      expect(totalChips).toBe(totalStartingChips);
    }

    expect(tournament.isTournamentOver()).toBe(true);
    expect(tournament.getWinnerPlayerId()).not.toBeNull();

    const winner = tournament.getSeats().find((s) => s.playerId === tournament.getWinnerPlayerId());
    expect(winner?.stack).toBe(totalStartingChips);
  });
});
