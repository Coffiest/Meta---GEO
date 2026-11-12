import { describe, expect, it } from "vitest";
import { applyAction, dealHand, gradeDecision, handIndex, handName, rngAction, type TrainerNode } from "../src/lib/trainer";

describe("特訓", () => {
  it("手の表の位置", () => {
    expect(handName(handIndex("Ah", "As"))).toBe("AA");
    expect(handName(handIndex("Kh", "Ah"))).toBe("AKs");
    expect(handName(handIndex("2c", "Ad"))).toBe("A2o");
    expect(handIndex("Ah", "Kh")).toBe(1);
    expect(handIndex("Ah", "Kd")).toBe(13);
  });

  it("全員フォールドでBBの勝ち、オープンにBBがコールで終わる", () => {
    let h = dealHand(100, "BB", () => 0.3);
    for (let i = 0; i < 7; i++) h = applyAction(h, "F");
    expect(h.done).toBe(true);
    h = dealHand(100, "BB", () => 0.3);
    h = applyAction(h, "R2.1");
    for (let i = 0; i < 6; i++) h = applyAction(h, "F");
    expect(h.toAct).toBe(7);
    expect(h.pa).toBe("R2.1-F-F-F-F-F-F");
    h = applyAction(h, "C");
    expect(h.done).toBe(true);
  });

  it("3ベットにはオープナーへ手番が戻る", () => {
    let h = dealHand(100, "UTG", () => 0.3);
    h = applyAction(h, "R2.1");
    h = applyAction(h, "R7");
    for (let i = 0; i < 6; i++) h = applyAction(h, "F");
    expect(h.toAct).toBe(0);
  });

  it("採点と乱数", () => {
    const s = Array(169).fill(0);
    const node: TrainerNode = {
      actor: "UTG",
      a: [
        { c: "F", s: s.map(() => 0.3), e: s.map(() => 0) },
        { c: "R2.1", s: s.map(() => 0.7), e: s.map(() => 0.5) },
      ],
    };
    expect(gradeDecision(node, 0, "R2.1").grade).toBe("best");
    expect(gradeDecision(node, 0, "F").grade).toBe("correct");
    expect(rngAction(node, 0, 95)).toBe("R2.1");
    expect(rngAction(node, 0, 10)).toBe("F");
  });
});
