import { describe, expect, it } from "vitest";
import { bmcbBoardOf, judgeBmcb } from "../src/review/bmcb.js";

describe("BMCB簡易戦略(スライド)", () => {
  it("ボードの系統", () => {
    expect(bmcbBoardOf(["Ah", "Kd", "7c"])).toBe("high");
    expect(bmcbBoardOf(["7h", "4d", "2c"])).toBe("connect");
    expect(bmcbBoardOf(["Th", "9d", "7c"])).toBe("connect");
    expect(bmcbBoardOf(["9h", "6h", "2h"])).toBe("monotone");
    expect(bmcbBoardOf(["Kh", "6h", "2h"])).toBe("monotoneAK");
    expect(bmcbBoardOf(["8h", "8d", "3c"])).toBe("paired");
    expect(bmcbBoardOf(["Ah", "Kd", "Kc"])).toBe("pairedBroadway");
  });

  it("ハイボード: TPTK は大きく打てば最善、チェックは緩手", () => {
    expect(judgeBmcb({ hole: ["As", "Kc"], flop: ["Kh", "8d", "3c"], kind: "bet", sizePct: 0.8 })!.grade).toBe("best");
    expect(judgeBmcb({ hole: ["As", "Kc"], flop: ["Kh", "8d", "3c"], kind: "check", sizePct: 0 })!.grade).toBe("inaccuracy");
  });

  it("ハイボード: セカンドペアは打たずにチェックが正解", () => {
    expect(judgeBmcb({ hole: ["8s", "9c"], flop: ["Kh", "8d", "3c"], kind: "check", sizePct: 0 })!.grade).toBe("best");
    expect(judgeBmcb({ hole: ["8s", "9c"], flop: ["Kh", "8d", "3c"], kind: "bet", sizePct: 0.33 })!.grade).toBe("mistake");
  });

  it("ペアボード: ハンドに関係なく 33%、AKK はレンジチェック", () => {
    expect(judgeBmcb({ hole: ["Qs", "Jc"], flop: ["8h", "8d", "3c"], kind: "bet", sizePct: 0.33 })!.grade).toBe("best");
    expect(judgeBmcb({ hole: ["Qs", "Jc"], flop: ["Ah", "Kd", "Kc"], kind: "bet", sizePct: 0.33 })!.grade).toBe("mistake");
  });
});
