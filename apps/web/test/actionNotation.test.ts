import { describe, expect, it } from "vitest";
import {
  actionLabel,
  actionNotation,
  decisionInfo,
  positionOfSeat,
  type NotationAction,
} from "../src/lib/actionNotation";

/**
 * 1手の短い表記(`UTG bet 33%` / `BB x/r` など)のテスト。
 * 卓は6席・ボタン0。席 0=BTN 1=SB 2=BB 3=UTG 4=HJ 5=CO。BB=100。
 */
let seq = 0;
function act(seatIndex: number, street: string, kind: string, toAmount: number | null = null, potBefore = 0): NotationAction {
  seq += 1;
  return { sequenceNumber: seq, seatIndex, street, kind, toAmount, potBefore };
}

function preflop(): NotationAction[] {
  seq = 0;
  return [
    act(1, "preflop", "postBlind", 50),
    act(2, "preflop", "postBlind", 100),
    act(3, "preflop", "raise", 250, 150), // UTG 2.5bb
    act(4, "preflop", "fold"),
    act(5, "preflop", "fold"),
    act(0, "preflop", "fold"),
    act(1, "preflop", "fold"),
    act(2, "preflop", "call", 250, 400),
  ];
}

const BB = 100;
const table = { buttonFixedPos: 0, bigBlind: BB };

describe("ポジション", () => {
  it("ボタンからのずれで決まる", () => {
    expect([0, 1, 2, 3, 4, 5].map((s) => positionOfSeat(s, 0))).toEqual(["BTN", "SB", "BB", "UTG", "HJ", "CO"]);
    expect(positionOfSeat(0, 3)).toBe("UTG");
  });
});

describe("表記", () => {
  it("プリフロップのレイズは到達額を bb で", () => {
    const a = preflop();
    expect(actionLabel(a, 3, table)).toBe("UTG Raise 2.5bb");
    expect(actionLabel(a, 8, table)).toBe("BB call");
    expect(actionLabel(a, 4, table)).toBe("HJ fold");
  });

  it("ポストフロップのベットはポット比", () => {
    const a = [...preflop(), act(2, "flop", "check", null, 550), act(3, "flop", "bet", 180, 550)];
    expect(actionLabel(a, a.at(-1)!.sequenceNumber, table)).toBe("UTG bet 33%");
  });

  it("チェックの後のコール/レイズ/フォールドは x/c・x/r・x/f", () => {
    const base = [...preflop(), act(2, "flop", "check", null, 550), act(3, "flop", "bet", 180, 550)];
    const xc = [...base, act(2, "flop", "call", 180, 730)];
    expect(actionLabel(xc, xc.at(-1)!.sequenceNumber, table)).toBe("BB x/c");
    const xf = [...base, act(2, "flop", "fold", null, 730)];
    expect(actionLabel(xf, xf.at(-1)!.sequenceNumber, table)).toBe("BB x/f");
    const xr = [...base, act(2, "flop", "raise", 540, 730)];
    expect(actionLabel(xr, xr.at(-1)!.sequenceNumber, table)).toBe("BB x/r 3x");
  });

  it("前のストリートのチェックは x/ に数えない", () => {
    const a = [
      ...preflop(),
      act(2, "flop", "check", null, 550),
      act(3, "flop", "check", null, 550),
      act(2, "turn", "bet", 300, 550),
      act(3, "turn", "call", 300, 850),
    ];
    expect(actionNotation(a, a.at(-1)!.sequenceNumber, BB)).toBe("call");
    expect(actionNotation(a, a.at(-2)!.sequenceNumber, BB)).toBe("bet 55%");
  });

  it("レイズの倍率は、いま立っている額に対して", () => {
    const a = [...preflop(), act(2, "flop", "bet", 200, 550), act(3, "flop", "raise", 700, 750)];
    expect(actionNotation(a, a.at(-1)!.sequenceNumber, BB)).toBe("Raise 3.5x");
  });

  it("オールインは ALL IN", () => {
    const a = [...preflop(), act(2, "flop", "check", null, 550), act(3, "flop", "allIn", 2000, 550)];
    expect(actionNotation(a, a.at(-1)!.sequenceNumber, BB)).toBe("ALL IN");
    const xr = [...a, act(2, "flop", "allIn", 4000, 2550)];
    expect(actionNotation(xr, xr.at(-1)!.sequenceNumber, BB)).toBe("x/r ALL IN");
  });

  it("チェックそのものは check", () => {
    const a = [...preflop(), act(2, "flop", "check", null, 550)];
    expect(actionLabel(a, a.at(-1)!.sequenceNumber, table)).toBe("BB check");
  });
});

describe("情報の行", () => {
  it("ストリートは英語、スタックは ES(エフェクティブスタック)で書く", () => {
    expect(decisionInfo("preflop", 40, 1.5)).toBe("Preflop · ES 40BB · Pot 1.5BB");
    expect(decisionInfo("river", 12.4, 30)).toBe("River · ES 12BB · Pot 30.0BB");
  });
});
