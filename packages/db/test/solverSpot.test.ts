import { describe, expect, it } from "vitest";
import { canonicalizeBoard, spotKeyOf } from "../src/solverSpot.js";

describe("canonicalizeBoard", () => {
  it("プリフロップ(0枚)は空文字", () => {
    expect(canonicalizeBoard([])).toBe("");
  });

  it("スート順列違いの同型フロップは同じキーになる", () => {
    // AhKs7h と AsKh7s は「A と 7 が同スート、K が別スート」で構造同型。
    expect(canonicalizeBoard(["Ah", "Ks", "7h"])).toBe(canonicalizeBoard(["As", "Kh", "7s"]));
  });

  it("入力順違いの同一フロップは同じキーになる(ランク降順ソート)", () => {
    expect(canonicalizeBoard(["Kh", "Ah", "7s"])).toBe(canonicalizeBoard(["Ah", "Kh", "7s"]));
  });

  it("フラッシュ構造が違うフロップは別キーになる", () => {
    // モノトーン(全同スート) vs レインボー。
    expect(canonicalizeBoard(["Ah", "Kh", "7h"])).not.toBe(canonicalizeBoard(["Ah", "Ks", "7c"]));
  });

  it("ペア構造を保持する", () => {
    expect(canonicalizeBoard(["Ah", "As", "7c"])).toBe("AaAb7c");
  });

  it("10 は T に正規化される", () => {
    expect(canonicalizeBoard(["10h", "9h", "2s"])).toBe("Ta9a2b");
  });

  it("ターン/リバーは末尾に付与され、フロップと整合したスート写像になる", () => {
    // フロップ Ah Kh 7s -> Aa Ka 7b, ターン 2h -> 2a
    expect(canonicalizeBoard(["Ah", "Kh", "7s", "2h"])).toBe("AaKa7b2a");
  });
});

describe("spotKeyOf", () => {
  const base = {
    street: "flop",
    effStackBucket: "30+",
    heroPos: "IP",
    boardCanon: "AaKb7c",
    actionLine: "oop_check",
    betTree: "b33-75_allin",
  };

  it("同じコンポーネントは同じキー、決定的", () => {
    expect(spotKeyOf(base)).toBe(spotKeyOf({ ...base }));
  });

  it("どれか1つ違えばキーが変わる", () => {
    expect(spotKeyOf(base)).not.toBe(spotKeyOf({ ...base, heroPos: "OOP" }));
    expect(spotKeyOf(base)).not.toBe(spotKeyOf({ ...base, boardCanon: "AaKb7d" }));
  });
});
