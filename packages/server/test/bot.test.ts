import { describe, expect, it } from "vitest";
import { decideBotAction } from "../src/bot.js";
import type { Card } from "@meta-geo/engine";

function c(spec: string): Card {
  const rankChar = spec.slice(0, -1);
  const suitChar = spec.slice(-1);
  const rank = ({ A: 14, K: 13, Q: 12, J: 11, T: 10 } as Record<string, number>)[rankChar] ?? Number(rankChar);
  const suit = ({ s: "spades", h: "hearts", d: "diamonds", c: "clubs" } as const)[suitChar as "s" | "h" | "d" | "c"];
  return { rank: rank as Card["rank"], suit };
}

describe("decideBotAction", () => {
  it("folds a weak preflop hand facing a large bet", () => {
    const action = decideBotAction({
      street: "preflop",
      holeCards: [c("7c"), c("2d")],
      board: [],
      currentBetToMatch: 2000,
      streetContribution: 0,
      minRaiseToAmount: 4000,
      potBefore: 2000,
      stack: 20_000,
      canRaise: true,
      random: () => 0.99,
    });
    expect(action.kind).toBe("fold");
  });

  it("checks a weak hand when nothing to call", () => {
    const action = decideBotAction({
      street: "flop",
      holeCards: [c("7c"), c("2d")],
      board: [c("Kd"), c("9h"), c("4s")],
      currentBetToMatch: 0,
      streetContribution: 0,
      minRaiseToAmount: 200,
      potBefore: 600,
      stack: 20_000,
      canRaise: true,
      random: () => 0.99, // 乱数を高くしてベット分岐を避ける
    });
    expect(action.kind).toBe("check");
  });

  it("never raises when canRaise is false, even with a premium hand", () => {
    const action = decideBotAction({
      street: "preflop",
      holeCards: [c("As"), c("Ah")],
      board: [],
      currentBetToMatch: 400,
      streetContribution: 100,
      minRaiseToAmount: 800,
      potBefore: 600,
      stack: 20_000,
      canRaise: false,
      random: () => 0, // 乱数を低くしてレイズ分岐を狙うが canRaise=false で阻止されるはず
    });
    expect(["call", "allIn"]).toContain(action.kind);
  });

  it("goes all-in when the call amount exceeds the remaining stack", () => {
    const action = decideBotAction({
      street: "river",
      holeCards: [c("As"), c("Ah")],
      board: [c("Ad"), c("Ac"), c("Kd"), c("Qd"), c("2c")], // quad aces: comfortably strong enough not to fold
      currentBetToMatch: 5000,
      streetContribution: 0,
      minRaiseToAmount: 10_000,
      potBefore: 3000,
      stack: 2000, // スタックがコール額(5000)より少ない
      canRaise: false,
      random: () => 0.5,
    });
    expect(action.kind).toBe("allIn");
  });

  it("opens to 2BB (never limps) with a premium hand in an unraised preflop pot", () => {
    const action = decideBotAction({
      street: "preflop",
      holeCards: [c("As"), c("Ah")],
      board: [],
      currentBetToMatch: 100, // BBのみ(未オープン)
      streetContribution: 50, // SBの席
      minRaiseToAmount: 200,
      potBefore: 150,
      stack: 20_000,
      canRaise: true,
      bigBlind: 100,
      random: () => 0.5,
    });
    expect(action.kind).toBe("raise");
    if (action.kind === "raise") expect(action.toAmount).toBe(200); // 2BB
  });

  it("folds (does not limp) a weak hand in an unraised preflop pot when facing the BB", () => {
    const action = decideBotAction({
      street: "preflop",
      holeCards: [c("7c"), c("2d")],
      board: [],
      currentBetToMatch: 100,
      streetContribution: 50,
      minRaiseToAmount: 200,
      potBefore: 150,
      stack: 20_000,
      canRaise: true,
      bigBlind: 100,
      random: () => 0.5,
    });
    expect(action.kind).toBe("fold");
  });

  it("checks (not raise) a weak hand as the BB in an unraised pot", () => {
    const action = decideBotAction({
      street: "preflop",
      holeCards: [c("7c"), c("2d")],
      board: [],
      currentBetToMatch: 100,
      streetContribution: 100, // BBの席(既にBB分を投入済み)
      minRaiseToAmount: 200,
      potBefore: 250,
      stack: 20_000,
      canRaise: true,
      bigBlind: 100,
      random: () => 0.5,
    });
    expect(action.kind).toBe("check");
  });

  it("shoves instead of a tiny 2BB open when pot-committed (short stack push/fold)", () => {
    const action = decideBotAction({
      street: "preflop",
      holeCards: [c("As"), c("Ah")],
      board: [],
      currentBetToMatch: 100,
      streetContribution: 50,
      minRaiseToAmount: 200,
      potBefore: 150,
      stack: 250, // 2BBオープン後に残りわずか=コミット
      canRaise: true,
      bigBlind: 100,
      random: () => 0.5,
    });
    expect(action.kind).toBe("allIn");
  });

  it("bets a premium made hand with a low random roll", () => {
    const action = decideBotAction({
      street: "river",
      holeCards: [c("As"), c("Ah")],
      board: [c("Ad"), c("Ac"), c("Kd"), c("Qd"), c("2c")], // quads
      currentBetToMatch: 0,
      streetContribution: 0,
      minRaiseToAmount: 200,
      potBefore: 1000,
      stack: 20_000,
      canRaise: true,
      random: () => 0,
    });
    expect(action.kind).toBe("bet");
  });
});
