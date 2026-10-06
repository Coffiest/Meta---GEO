import { describe, expect, it } from "vitest";
import {
  POWER_NUMBER_TABLE,
  gradePowerNumber,
  judgePowerNumber,
  pnBand,
  pnCellOf,
  powerNumberOf,
} from "../src/review/powerNumber.js";

describe("パワーナンバー", () => {
  it("表は 13×13。右上がスーテッド、左下がオフスート、対角がペア", () => {
    expect(POWER_NUMBER_TABLE).toHaveLength(13);
    for (const row of POWER_NUMBER_TABLE) expect(row).toHaveLength(13);
    expect(pnCellOf("AKs")).toEqual([0, 1]);
    expect(pnCellOf("AKo")).toEqual([1, 0]);
    expect(pnCellOf("KAo")).toEqual([1, 0]);
    expect(pnCellOf("77")).toEqual([7, 7]);
    expect(pnCellOf("A")).toBeNull();
  });

  it("出典の表どおりの値", () => {
    expect(powerNumberOf("AA")).toBe(Infinity);
    expect(powerNumberOf("A9s")).toBe(50);
    expect(powerNumberOf("KJs")).toBe(75);
    expect(powerNumberOf("KQo")).toBe(48);
    expect(powerNumberOf("K2s")).toBe(9);
    expect(powerNumberOf("A2o")).toBe(15);
    expect(powerNumberOf("22")).toBe(28);
    expect(powerNumberOf("T9o")).toBe(11);
    expect(powerNumberOf("92s")).toBeNull();
    expect(powerNumberOf("72o")).toBeNull();
    expect(powerNumberOf("J2o")).toBe(3);
  });

  it("色の帯: ∞・34以上=赤 / 16〜33=青 / 10〜15=黄 / それ以下と–=白", () => {
    expect(pnBand(Infinity)).toBe("red");
    expect(pnBand(36)).toBe("red");
    expect(pnBand(33)).toBe("blue");
    expect(pnBand(16)).toBe("blue");
    expect(pnBand(15)).toBe("yellow");
    expect(pnBand(10)).toBe("yellow");
    expect(pnBand(9)).toBe("white");
    expect(pnBand(null)).toBe("white");
  });

  it("有効M = M × 後ろの人数。表の数字より小さければオールイン", () => {
    // 10bb、ポット 2.5bb(SB+BB+アンティ) → M=4。BTN(後ろ2人)→ 有効M 8。
    const k2s = judgePowerNumber({ handClass: "K2s", stackBb: 10, potBb: 2.5, playersBehind: 2, action: "allIn" })!;
    expect(k2s.m).toBe(4);
    expect(k2s.effectiveM).toBe(8);
    expect(k2s.correct).toBe("push"); // 9 > 8
    expect(gradePowerNumber(k2s, "allIn")).toBe("best");
    const q5s = judgePowerNumber({ handClass: "Q5s", stackBb: 10, potBb: 2.5, playersBehind: 2, action: "allIn" })!;
    expect(q5s.correct).toBe("fold"); // 8 は 8 未満ではない
    expect(gradePowerNumber(q5s, "allIn")).toBe("inaccuracy");
  });

  it("–のマスは有効M 3 未満のときだけオールイン", () => {
    const deep = judgePowerNumber({ handClass: "72o", stackBb: 6, potBb: 2.5, playersBehind: 2, action: "fold" })!;
    expect(deep.correct).toBe("fold");
    const tiny = judgePowerNumber({ handClass: "72o", stackBb: 3, potBb: 2.5, playersBehind: 1, action: "allIn" })!;
    expect(tiny.correct).toBe("push");
  });

  it("プッシュすべき手を降りると重く、離れているほど重い", () => {
    const aa = judgePowerNumber({ handClass: "AA", stackBb: 15, potBb: 2.5, playersBehind: 5, action: "fold" })!;
    expect(gradePowerNumber(aa, "fold")).toBe("blunder");
    const a2o = judgePowerNumber({ handClass: "A2o", stackBb: 5, potBb: 2.5, playersBehind: 1, action: "fold" })!;
    expect(a2o.correct).toBe("push"); // 有効M 2 < 15
    expect(gradePowerNumber(a2o, "fold")).toBe("blunder");
    const limp = judgePowerNumber({ handClass: "A2o", stackBb: 5, potBb: 2.5, playersBehind: 1, action: "call" })!;
    expect(gradePowerNumber(limp, "call")).toBe("inaccuracy");
  });
});
