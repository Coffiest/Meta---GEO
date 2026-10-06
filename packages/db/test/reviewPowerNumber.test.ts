import { describe, expect, it } from "vitest";
import { applyNotionGrades, attachPowerNumbers } from "../src/reviewStrategy.js";
import type { ExtractHand } from "../src/reviewExtract.js";
import type { ReviewedDecision } from "../src/review.js";

/**
 * 15bb 以下・誰も参加していない局面のオープンは、パワーナンバーで格付けする(DB不要)。
 * 6人卓、BB アンティ。ボタン=席0、SB=席1、BB=席2。CO=席5 が最初に入る(後ろは BTN・SB・BB の3人)。
 */
function hand(coHole: string[], coStackBb: number, coAction: { kind: string; toAmount: number | null }): { hand: ExtractHand; seq: number } {
  let seq = 0;
  const a = (seatIndex: number, kind: string, toAmount: number | null, potBefore: number) => ({
    sequenceNumber: ++seq,
    seatIndex,
    street: "preflop",
    kind,
    toAmount,
    potBefore,
  });
  const actions = [
    a(2, "postAnte", 100, 0),
    a(1, "postBlind", 50, 100),
    a(2, "postBlind", 100, 150),
    a(3, "fold", null, 250),
    a(4, "fold", null, 250),
  ];
  const decisionSeq = seq + 1;
  actions.push(a(5, coAction.kind, coAction.toAmount, 250));
  const seats = [0, 1, 2, 3, 4, 5].map((i) => ({
    seatIndex: i,
    userId: `u${i}`,
    startingStack: i === 5 ? coStackBb * 100 : 3000,
    holeCards: i === 5 ? coHole : ["2c", "3d"],
  }));
  return { hand: { buttonFixedPos: 0, levelBigBlind: 100, board: [], seats, actions }, seq: decisionSeq };
}

function decision(seq: number, bucket: string, kind: string): ReviewedDecision {
  return {
    sequenceNumber: seq,
    street: "preflop",
    analyzable: true,
    outOfScopeReason: null,
    heroPos: "CO",
    seatIndex: 5,
    effStackBb: 10,
    potBb: 2.5,
    facingSizeBb: 1,
    actionTaken: { kind, bucket, toAmount: null },
    gtoActions: null,
    evLossBb: 0,
    classification: "good",
    actionName: "",
    geo: null,
    strategy: null,
    article: null,
  };
}

describe("パワーナンバーの判定", () => {
  it("有効M = (10bb ÷ 2.5bb) × 後ろ3人 = 12。K9o(12)は 12 未満ではないのでフォールドが正解", () => {
    const { hand: h, seq } = hand(["Kc", "9d"], 10, { kind: "fold", toAmount: null });
    const d = decision(seq, "fold", "fold");
    attachPowerNumbers(h, [d]);
    expect(d.powerNumber).toMatchObject({ handClass: "K9o", pn: 12, playersBehind: 3, correct: "fold", followed: true });
    expect(d.powerNumber!.effectiveM).toBeCloseTo(12, 6);
    applyNotionGrades([d]);
    expect(d.classification).toBe("best");
  });

  it("A8o(24)を降りるのはミス。GTO の格付けより優先する", () => {
    const { hand: h, seq } = hand(["Ac", "8d"], 10, { kind: "fold", toAmount: null });
    const d = decision(seq, "fold", "fold");
    attachPowerNumbers(h, [d]);
    expect(d.powerNumber).toMatchObject({ pn: 24, correct: "push", followed: false });
    applyNotionGrades([d]);
    expect(d.classification).toBe("mistake"); // 有効M 12 は 24 の半分ちょうど(半分未満なら blunder)
  });

  it("∞ は 'inf'、–は '-' で運ぶ", () => {
    const aa = hand(["Ac", "Ad"], 12, { kind: "allIn", toAmount: 1200 });
    const d1 = decision(aa.seq, "allIn", "allIn");
    attachPowerNumbers(aa.hand, [d1]);
    expect(d1.powerNumber).toMatchObject({ pn: "inf", correct: "push", grade: "best" });
    const trash = hand(["7c", "2d"], 12, { kind: "fold", toAmount: null });
    const d2 = decision(trash.seq, "fold", "fold");
    attachPowerNumbers(trash.hand, [d2]);
    expect(d2.powerNumber).toMatchObject({ pn: "-", correct: "fold", grade: "best" });
  });

  it("15bb を超えるスタックや、前に参加者がいる局面は対象外", () => {
    const deep = hand(["Ac", "8d"], 25, { kind: "fold", toAmount: null });
    const d = decision(deep.seq, "fold", "fold");
    attachPowerNumbers(deep.hand, [d]);
    expect(d.powerNumber).toBeNull();

    const limped = hand(["Ac", "8d"], 10, { kind: "fold", toAmount: null });
    limped.hand.actions[3] = { ...limped.hand.actions[3]!, kind: "call", toAmount: 100 };
    const d2 = decision(limped.seq, "fold", "fold");
    attachPowerNumbers(limped.hand, [d2]);
    expect(d2.powerNumber).toBeNull();
  });
});
