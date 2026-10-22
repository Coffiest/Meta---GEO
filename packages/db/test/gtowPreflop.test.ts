import { describe, expect, it } from "vitest";
import { judgeGtow } from "../src/gtowPreflop.js";

describe("GTO Wizard の解(70bb)で頻度の格付け", () => {
  it("vs3bet_BTN_vs_SB の AKs は 4bet(レイズ)が 100% → レイズは定石手、フォールドは大悪手", () => {
    const base = { scene: "vs3bet_BTN_vs_SB", handClass: "AKs", effStackBb: 70, chosenBucket: "raise5+" };
    expect(judgeGtow({ ...base, chosenKind: "raise" })!.classification).toBe("book");
    expect(judgeGtow({ ...base, chosenKind: "fold" })!.classification).toBe("blunder");
  });

  it("BB のディフェンスはスタックの段階のデータを使う", () => {
    const base = { scene: "vsOpen_BB_vs_HJ", handClass: "A7s", chosenKind: "call", chosenBucket: "call" };
    expect(judgeGtow({ ...base, effStackBb: 52 })!.stack).toBe(50);
    expect(judgeGtow({ ...base, effStackBb: 41 })!.stack).toBe(40);
    expect(judgeGtow({ ...base, effStackBb: 20 })!.stack).toBe(20);
    expect(judgeGtow({ ...base, effStackBb: 80 })!.stack).toBe(70);
    expect(judgeGtow({ ...base, effStackBb: 15 })).toBeNull();
    expect(judgeGtow({ ...base, scene: "vsOpen_BB_vs_SB", effStackBb: 30 })!.stack).toBe(30);
  });

  it("小さいスタックのデータが無い場面・データの無い場面は使わない", () => {
    expect(judgeGtow({ scene: "vs3bet_BTN_vs_SB", handClass: "AKs", effStackBb: 30, chosenKind: "raise", chosenBucket: "raise2-5" })).toBeNull();
    expect(judgeGtow({ scene: "vsOpen_BB_vs_SB", handClass: "AKs", effStackBb: 70, chosenKind: "raise", chosenBucket: "raise2-5" })).toBeNull();
    expect(judgeGtow({ scene: "vs3bet_BTN_vs_SB", handClass: "AKs", effStackBb: 55, chosenKind: "raise", chosenBucket: "raise2-5" })!.stack).toBe(70);
  });
});
