import { describe, expect, it } from "vitest";
import { judgeGtow } from "../src/gtowPreflop.js";

describe("GTO Wizard の解(70bb)で頻度の格付け", () => {
  it("vs3bet_BTN_vs_SB の AKs は 4bet(レイズ)が 100% → レイズは定石手、フォールドは大悪手", () => {
    const base = { scene: "vs3bet_BTN_vs_SB", handClass: "AKs", effStackBb: 70, chosenBucket: "raise5+" };
    expect(judgeGtow({ ...base, chosenKind: "raise" })!.classification).toBe("book");
    expect(judgeGtow({ ...base, chosenKind: "fold" })!.classification).toBe("blunder");
  });

  it("50bb 未満やデータの無い場面は使わない", () => {
    expect(judgeGtow({ scene: "vs3bet_BTN_vs_SB", handClass: "AKs", effStackBb: 30, chosenKind: "raise", chosenBucket: "raise2-5" })).toBeNull();
    expect(judgeGtow({ scene: "vsOpen_BB_vs_SB", handClass: "AKs", effStackBb: 70, chosenKind: "raise", chosenBucket: "raise2-5" })).toBeNull();
  });
});
