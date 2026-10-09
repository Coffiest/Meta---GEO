import { describe, expect, it } from "vitest";
import { judgeRaisedPot } from "../src/review/raisedPot.js";

describe("3bet / 4bet ポットの簡易戦略(スライドゼミ4)", () => {
  it("IP の 3ベッター: A ハイでセカンドペアはチェックが正解、打てば悪手", () => {
    const base = { spot: "ip3bettor" as const, hole: ["8s", "8c"], flop: ["Ah", "8d", "3c"], spr: 3 };
    expect(judgeRaisedPot({ ...base, hole: ["Ks", "9c"], flop: ["Ah", "9d", "3c"], action: { kind: "check", sizePct: 0 } })!.grade).toBe("best");
    expect(judgeRaisedPot({ ...base, hole: ["Ks", "9c"], flop: ["Ah", "9d", "3c"], action: { kind: "bet", sizePct: 0.25 } })!.grade).toBe("mistake");
  });

  it("OOP の 3ベッター(深い): ローボードの TT は 75% 以上で打つ", () => {
    const j = judgeRaisedPot({ spot: "oop3bettor", hole: ["Ts", "Tc"], flop: ["6h", "5d", "4c"], spr: 4, action: { kind: "bet", sizePct: 0.8 } })!;
    expect(j.correct).toBe("bigBet");
    expect(j.grade).toBe("best");
  });

  it("OOP の 3ベッター(浅い): ローボードのワンペアはジャム", () => {
    const j = judgeRaisedPot({ spot: "oop3bettor", hole: ["Ks", "6c"], flop: ["6h", "5d", "4c"], spr: 1.5, action: { kind: "allIn", sizePct: 0 } })!;
    expect(j.grade).toBe("best");
  });

  it("4bet ポットの OOP コーラー: K ハイはレンジチェック", () => {
    const j = judgeRaisedPot({ spot: "oop4betCaller", hole: ["Qs", "Qc"], flop: ["Kh", "8d", "3c"], spr: 1, action: { kind: "bet", sizePct: 0.2 } })!;
    expect(j.grade).toBe("mistake");
  });
});
