import { describe, expect, it } from "vitest";
import {
  actionLabel,
  actionNotation,
  decisionInfo,
  positionLabelsOf,
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
  it("6人なら BTN / SB / BB / UTG / HJ / CO", () => {
    const labels = positionLabelsOf(preflop(), 0);
    expect([0, 1, 2, 3, 4, 5].map((s) => labels.get(s))).toEqual(["BTN", "SB", "BB", "UTG", "HJ", "CO"]);
  });

  it("空席がある(5人)ときも、卓の表示と同じく実際のブラインドから数える(UTG が HJ と出ていた不具合)", () => {
    seq = 0;
    // 席3が空席。ボタン0・SB1・BB2、最初に動くのは席4 → UTG(5人なので UTG と CO)。
    const a = [
      act(1, "preflop", "postBlind", 50),
      act(2, "preflop", "postBlind", 100),
      act(4, "preflop", "raise", 200, 150),
      act(5, "preflop", "fold"),
      act(0, "preflop", "fold"),
      act(1, "preflop", "fold"),
      act(2, "preflop", "fold"),
    ];
    expect(actionLabel(a, 3, table)).toBe("UTG Raise 2bb");
    expect(actionLabel(a, 4, table)).toBe("CO fold");
  });

  it("ブラインドの前に空席があっても、BB を UTG と呼ばない", () => {
    seq = 0;
    // ボタン1・SB2・席3が空席・BB4。最初に動くのは席5。
    const a = [
      act(2, "preflop", "postBlind", 50),
      act(4, "preflop", "postBlind", 100),
      act(5, "preflop", "raise", 250, 150),
      act(0, "preflop", "fold"),
      act(1, "preflop", "fold"),
      act(2, "preflop", "fold"),
      act(4, "preflop", "call", 250, 400),
    ];
    const t = { buttonFixedPos: 1, bigBlind: BB };
    expect(actionLabel(a, 3, t)).toBe("UTG Raise 2.5bb");
    expect(actionLabel(a, 7, t)).toBe("BB call");
  });
});

describe("オールインへのコール", () => {
  it("相手のベット以下の額のオールイン/レイズはコールと書く", () => {
    const base = [...preflop(), act(2, "flop", "bet", 300, 550)];
    const a = [...base, act(3, "flop", "raise", 200, 850)]; // 残り2bbで「ALL IN」ボタン → 中身はコール
    expect(actionLabel(a, a.at(-1)!.sequenceNumber, table)).toBe("UTG call");
    const b = [...base, act(3, "flop", "allIn", 300, 850)];
    expect(actionLabel(b, b.at(-1)!.sequenceNumber, table)).toBe("UTG call");
    const c = [...base, act(3, "flop", "allIn", 900, 850)];
    expect(actionLabel(c, c.at(-1)!.sequenceNumber, table)).toBe("UTG ALL IN");
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
