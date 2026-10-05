import { describe, expect, it } from "vitest";
import { reviewPositions } from "../src/review/reviewPositions";
import { normalizeCallLikeAggression } from "../src/review/normalizeActions";
import { gradeGeometric, judgeBarrel } from "../src/review/barrelPlan";

const post = (seatIndex: number) => ({ seatIndex, street: "preflop", kind: "postBlind" });

describe("reviewPositions", () => {
  it("6人: 表示も表の言葉も BTN/SB/BB/UTG/HJ/CO", () => {
    const p = reviewPositions({ seatIndexes: [0, 1, 2, 3, 4, 5], buttonFixedPos: 0, seatCount: 6, actions: [post(1), post(2)] });
    expect([0, 1, 2, 3, 4, 5].map((s) => p.display.get(s))).toEqual(["BTN", "SB", "BB", "UTG", "HJ", "CO"]);
    expect([0, 1, 2, 3, 4, 5].map((s) => p.strategy.get(s))).toEqual(["BTN", "SB", "BB", "UTG", "HJ", "CO"]);
  });

  it("5人(BB の次が空席): 表示は UTG、GTO の表は後ろに3人いるので HJ", () => {
    const p = reviewPositions({ seatIndexes: [0, 1, 2, 4, 5], buttonFixedPos: 0, seatCount: 6, actions: [post(1), post(2)] });
    expect(p.display.get(4)).toBe("UTG");
    expect(p.strategy.get(4)).toBe("HJ");
    expect(p.display.get(5)).toBe("CO");
    expect(p.strategy.get(5)).toBe("CO");
  });

  it("ブラインドの前が空席でも、BB を UTG と呼ばない", () => {
    const p = reviewPositions({ seatIndexes: [0, 1, 2, 4, 5], buttonFixedPos: 1, seatCount: 6, actions: [post(2), post(4)] });
    expect(p.display.get(4)).toBe("BB");
    expect(p.strategy.get(4)).toBe("BB");
    expect(p.display.get(5)).toBe("UTG");
  });

  it("ヘッズアップ: ボタンは表示 BTN(SB)、表の言葉は SB", () => {
    const p = reviewPositions({ seatIndexes: [0, 3], buttonFixedPos: 0, seatCount: 6, actions: [post(0), post(3)] });
    expect(p.display.get(0)).toBe("BTN(SB)");
    expect(p.strategy.get(0)).toBe("SB");
    expect(p.strategy.get(3)).toBe("BB");
  });
});

describe("normalizeCallLikeAggression", () => {
  const a = (seatIndex: number, kind: string, toAmount: number | null, street = "flop") => ({ seatIndex, street, kind, toAmount });
  it("相手のベット以下のオールイン/レイズはコール、上回ればそのまま", () => {
    const out = normalizeCallLikeAggression([a(1, "bet", 300), a(2, "raise", 200), a(3, "allIn", 300), a(4, "allIn", 900)]);
    expect(out.map((x) => x.kind)).toEqual(["bet", "call", "call", "allIn"]);
  });
  it("ストリートが変わると数え直す", () => {
    const out = normalizeCallLikeAggression([a(1, "bet", 300, "flop"), a(2, "bet", 100, "turn")]);
    expect(out[1]!.kind).toBe("bet");
  });
});

describe("ラグのバレルはジオメトリックサイズ", () => {
  it("比で評価する(±25% は最善)", () => {
    expect(gradeGeometric(0.6, 0.6).grade).toBe("best");
    expect(gradeGeometric(0.33, 0.6).grade).toBe("good");
    expect(gradeGeometric(0.25, 0.6).grade).toBe("inaccuracy");
    expect(gradeGeometric(0.15, 0.6).grade).toBe("mistake");
  });
  it("SPR が分かれば、180% でなくてもジオメトリックサイズで打てば最善", () => {
    // K♥8♦3♥ → ラグ 6♠。キッカーの強いトップペア(KJ)。
    const board = ["Kh", "8d", "3h", "6s"];
    const spr = 1.5; // 2ストリートのジオメトリック = (sqrt(4) - 1) / 2 = 50%
    const v = judgeBarrel("turn", ["Kd", "Jc"], board, { kind: "bet", size: "small", fraction: 0.5 }, spr)!;
    expect(v.geometricPct).toBe(50);
    expect(v.grade).toBe("best");
  });
});
