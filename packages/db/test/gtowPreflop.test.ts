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
    expect(judgeGtow({ ...base, effStackBb: 15 })!.stack).toBe(12);
    expect(judgeGtow({ ...base, effStackBb: 9 })).toBeNull();
    expect(judgeGtow({ ...base, effStackBb: 100 })!.stack).toBe(100);
    expect(judgeGtow({ ...base, scene: "vsOpen_BB_vs_SB", effStackBb: 30 })!.stack).toBe(30);
  });

  it("小さいスタックのデータが無い場面・データの無い場面は使わない", () => {
    expect(judgeGtow({ scene: "vs3bet_BTN_vs_SB", handClass: "AKs", effStackBb: 30, chosenKind: "raise", chosenBucket: "raise2-5" })).toBeNull();
    // 70bb に無い場面は 100bb の解で代用する。
    expect(judgeGtow({ scene: "vsOpen_BB_vs_SB", handClass: "AKs", effStackBb: 70, chosenKind: "raise", chosenBucket: "raise2-5" })!.stack).toBe(100);
    expect(judgeGtow({ scene: "vs3bet_BTN_vs_SB", handClass: "AKs", effStackBb: 55, chosenKind: "raise", chosenBucket: "raise2-5" })!.stack).toBe(70);
  });
});

describe("Database タブの GTO(GTO Wizard の解)", () => {
  it("手順から場面と手番の人を作る(アプリの UTG はデータの LJ)", async () => {
    const { gtowSceneOfLine } = await import("../src/gtowPreflop.js");
    expect(gtowSceneOfLine([])).toEqual({ scene: "RFI_LJ", hero: "UTG" });
    expect(gtowSceneOfLine([{ position: "UTG", bucket: "fold" }, { position: "HJ", bucket: "raise2-5" }])).toEqual({ scene: "vsOpen_CO_vs_HJ", hero: "CO" });
    expect(
      gtowSceneOfLine([
        { position: "UTG", bucket: "raise2-5" },
        { position: "HJ", bucket: "raise5+" },
      ]),
    ).toEqual({ scene: "vs3bet_LJ_vs_HJ", hero: "UTG" });
    expect(gtowSceneOfLine([{ position: "UTG", bucket: "raise2-5" }, { position: "HJ", bucket: "call" }])).toBeNull();
  });

  it("100bb の UTG のオープン表を作る(AA はレイズ、72o はフォールド)", async () => {
    const { buildGtowDbNode } = await import("../src/gtowPreflop.js");
    const n = buildGtowDbNode(100, [])!;
    expect(n.position).toBe("UTG");
    const cell = (l: string) => n.matrix.cells.flat().find((c) => c.label === l)!;
    expect(cell("AA").byBucket["raise2-5"]).toBeGreaterThan(0.9);
    expect(cell("72o").byBucket["fold"]).toBeGreaterThan(0.9);
    expect(buildGtowDbNode(15, [])).toBeNull();
  });
});
