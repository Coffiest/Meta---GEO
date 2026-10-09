import { describe, expect, it } from "vitest";
import { handCategory, handLabel } from "../src/lib/handCategory";
import { fillTemplate } from "../src/lib/articleRules";
import { preflopComment } from "../src/lib/preflopComment";
import type { ReviewedDecision } from "../src/lib/reviewApi";

describe("手札の分類(用語集の言い方)", () => {
  const cat = (a: string, b: string) => handCategory([a, b]);
  it("ハイ+ローのオフスート / ギャッパー / スーテッドエース", () => {
    expect(handLabel(["Kd", "4s"])).toBe("K4o");
    expect(cat("Kd", "4s")).toBe("ハイ+ローのオフスート");
    expect(cat("9s", "6s")).toBe("ロースーテッドのツーギャッパー");
    expect(cat("9s", "5s")).toBe("スリーギャッパー以上のロースーテッド");
    expect(cat("8h", "7h")).toBe("ロースーテッドのコネクター");
    expect(cat("Ah", "5h")).toBe("スーテッドエース(ホイール)");
    expect(cat("Ah", "Kd")).toBe("オフスートブロードウェイ");
    expect(cat("Qs", "Qd")).toBe("ハイポケットペア");
    expect(cat("4s", "4d")).toBe("スモールポケットペア");
    expect(cat("Jh", "9h")).toBe("スーテッドワンギャッパー");
  });
});

describe("置き換え語", () => {
  it("値のある語は置き換え、無い語は — にする", () => {
    expect(fillTemplate("{pos}の{hand}は勝率{potOdds}%", { pos: "BB", hand: "AKo" })).toBe("BBのAKoは勝率—%");
  });
});

describe("プリフロップの一般論", () => {
  const d = (over: Partial<ReviewedDecision>): ReviewedDecision =>
    ({
      sequenceNumber: 1,
      street: "preflop",
      analyzable: true,
      outOfScopeReason: null,
      heroPos: "UTG",
      seatIndex: 3,
      effStackBb: 36,
      potBb: 1.5,
      facingSizeBb: 0,
      actionTaken: { kind: "raise", bucket: "raise2-5", toAmount: 400 },
      gtoActions: [
        { bucket: "fold", frequency: 1, evBb: 0 },
        { bucket: "raise2-5", frequency: 0, evBb: -0.3 },
      ],
      evLossBb: 0.3,
      classification: "blunder",
      actionName: "",
      geo: null,
      strategy: null,
      ...over,
    }) as ReviewedDecision;

  it("オープンレンジ外の手をオープンしたら、オープンしないと言う(手札の分類は言わない)", () => {
    const n = preflopComment(d({ facingSizeBb: 1 }), { pos: "UTG", hand: "K4o" })!;
    expect(n.summary).toContain("UTGのK4oはオープンしないよ");
    expect(n.summary).not.toContain("(");
  });

  it("レイズに直面して降りるハンドは、コールもレイズもしないと言う", () => {
    const n = preflopComment(d({ heroPos: "HJ", facingSizeBb: 2.5 }), { pos: "HJ", hand: "94o" })!;
    expect(n.summary).toContain("コールも3betもせずにフォールド");
    expect(n.summary).not.toContain("コンティニュー");
  });

  it("3bet の場面はサイズを言わず「3betが推奨」と言う", () => {
    const n = preflopComment(
      d({
        heroPos: "CO",
        facingSizeBb: 2.5,
        actionTaken: { kind: "call", bucket: "call", toAmount: 250 },
        gtoActions: [
          { bucket: "raise5+", frequency: 0.82, evBb: 1 },
          { bucket: "call", frequency: 0.18, evBb: 0.5 },
        ],
      }),
      { pos: "CO", hand: "AQs" }
    )!;
    expect(n.summary).toContain("GTOでは3betが推奨されているよ");
    expect(n.summary).not.toContain("大きめ");
  });

  it("コールが多い 3bet の場面は「3betを打たずにコール」", () => {
    const n = preflopComment(
      d({
        heroPos: "BB",
        facingSizeBb: 1.5,
        actionTaken: { kind: "call", bucket: "call", toAmount: 250 },
        gtoActions: [
          { bucket: "call", frequency: 0.7, evBb: 1 },
          { bucket: "raise2-5", frequency: 0.3, evBb: 0.9 },
        ],
      }),
      { pos: "BB", hand: "KJs" }
    )!;
    expect(n.summary).toContain("3betを打たずにコールが推奨されているよ");
  });

  it("GTO どおりなら褒める", () => {
    const n = preflopComment(d({ actionTaken: { kind: "fold", bucket: "fold", toAmount: null } }), { pos: "UTG" })!;
    expect(n.summary).toContain("定石どおり");
  });
});
