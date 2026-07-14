import { describe, expect, it } from "vitest";
import { extractHeroDecisions, type ExtractHand } from "../src/reviewExtract.js";

// buttonFixedPos=0 -> seat0=BTN, seat1=SB, seat2=BB, seat3=UTG, seat4=HJ, seat5=CO
const seats = (holeBySeat: Record<number, string[]> = {}) =>
  Array.from({ length: 6 }, (_, i) => ({
    seatIndex: i,
    userId: `u${i}`,
    startingStack: 10_000,
    holeCards: holeBySeat[i] ?? ["Ah", "Kh"],
  }));

function buildHUHand(): ExtractHand {
  return {
    buttonFixedPos: 0,
    levelBigBlind: 100,
    board: ["Qs", "7d", "2c", "9h", "3s"],
    seats: seats(),
    actions: [
      { sequenceNumber: 1, seatIndex: 1, street: "preflop", kind: "postBlind", toAmount: 50, potBefore: 0 },
      { sequenceNumber: 2, seatIndex: 2, street: "preflop", kind: "postBlind", toAmount: 100, potBefore: 50 },
      { sequenceNumber: 3, seatIndex: 3, street: "preflop", kind: "fold", toAmount: null, potBefore: 150 },
      { sequenceNumber: 4, seatIndex: 4, street: "preflop", kind: "fold", toAmount: null, potBefore: 150 },
      { sequenceNumber: 5, seatIndex: 5, street: "preflop", kind: "fold", toAmount: null, potBefore: 150 },
      { sequenceNumber: 6, seatIndex: 0, street: "preflop", kind: "raise", toAmount: 250, potBefore: 150 }, // hero BTN
      { sequenceNumber: 7, seatIndex: 1, street: "preflop", kind: "fold", toAmount: null, potBefore: 400 },
      { sequenceNumber: 8, seatIndex: 2, street: "preflop", kind: "call", toAmount: 250, potBefore: 400 },
      { sequenceNumber: 9, seatIndex: 2, street: "flop", kind: "check", toAmount: null, potBefore: 550 },
      { sequenceNumber: 10, seatIndex: 0, street: "flop", kind: "bet", toAmount: 275, potBefore: 550 }, // hero flop
    ],
  };
}

describe("extractHeroDecisions", () => {
  it("heroの意思決定だけを時系列で返す", () => {
    const d = extractHeroDecisions(buildHUHand(), "u0");
    expect(d).toHaveLength(2);
  });

  it("プリフロップのレイズをポジション・バケット付きで抽出", () => {
    const [pre] = extractHeroDecisions(buildHUHand(), "u0");
    expect(pre?.street).toBe("preflop");
    expect(pre?.heroPos).toBe("BTN");
    expect(pre?.actionTaken.bucket).toBe("raise2.5-3");
    expect(pre?.effStackBb).toBeCloseTo(100);
    expect(pre?.potBb).toBeCloseTo(1.5);
    expect(pre?.facingSizeBb).toBeCloseTo(1);
    expect(pre?.analyzable).toBe(true);
  });

  it("HUフロップのベットを analyzable=true・IP・サイズバケット付きで抽出", () => {
    const d = extractHeroDecisions(buildHUHand(), "u0");
    const flop = d[1];
    expect(flop?.street).toBe("flop");
    expect(flop?.liveCount).toBe(2);
    expect(flop?.analyzable).toBe(true);
    expect(flop?.relPos).toBe("IP");
    expect(flop?.actionTaken.bucket).toBe("bet40-60"); // 275/550 = 50%
    expect(flop?.boardSoFar).toEqual(["Qs", "7d", "2c"]);
  });

  it("フロップを3人以上で見たら多人数のため対象外", () => {
    const hand = buildHUHand();
    // seat4(HJ)もコールして3ウェイにする。
    hand.actions = [
      { sequenceNumber: 1, seatIndex: 1, street: "preflop", kind: "postBlind", toAmount: 50, potBefore: 0 },
      { sequenceNumber: 2, seatIndex: 2, street: "preflop", kind: "postBlind", toAmount: 100, potBefore: 50 },
      { sequenceNumber: 3, seatIndex: 3, street: "preflop", kind: "fold", toAmount: null, potBefore: 150 },
      { sequenceNumber: 4, seatIndex: 4, street: "preflop", kind: "call", toAmount: 100, potBefore: 150 },
      { sequenceNumber: 5, seatIndex: 5, street: "preflop", kind: "fold", toAmount: null, potBefore: 250 },
      { sequenceNumber: 6, seatIndex: 0, street: "preflop", kind: "call", toAmount: 100, potBefore: 250 }, // hero BTN call
      { sequenceNumber: 7, seatIndex: 1, street: "preflop", kind: "fold", toAmount: null, potBefore: 350 },
      { sequenceNumber: 8, seatIndex: 2, street: "preflop", kind: "check", toAmount: null, potBefore: 350 },
      { sequenceNumber: 9, seatIndex: 2, street: "flop", kind: "check", toAmount: null, potBefore: 350 },
      { sequenceNumber: 10, seatIndex: 4, street: "flop", kind: "check", toAmount: null, potBefore: 350 },
      { sequenceNumber: 11, seatIndex: 0, street: "flop", kind: "bet", toAmount: 175, potBefore: 350 }, // hero, 3-way
    ];
    const d = extractHeroDecisions(hand, "u0");
    const flop = d.find((x) => x.street === "flop");
    expect(flop?.analyzable).toBe(false);
    expect(flop?.outOfScopeReason).toBe("multiway");
    expect(flop?.liveCount).toBe(3);
  });
});
