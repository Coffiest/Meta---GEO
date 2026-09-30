import { describe, expect, it } from "vitest";
import { applyNotionGrades, attachStrategies } from "../src/reviewStrategy.js";
import { summarizeReviewedDecisions } from "../src/review.js";
import type { ExtractHand } from "../src/reviewExtract.js";
import type { ReviewedDecision } from "../src/review.js";

/**
 * 戦略判定を決定に載せる層のテスト(DB不要)。
 *
 * 見ること:
 *  - 判定が正しい決定に結び付くこと
 *  - 上書きは「分類が付いている決定」だけで、EV損は残ること
 *  - 何度呼んでも同じ結果(分類は複数の経路で書き換わるため)
 *  - 席の持ち主が誰でも同じ結果になること(種別による分岐が無い)
 */

const BOARD = ["As", "7h", "2d", "Kc", "3s"];

let seq = 0;
function act(seatIndex: number, street: string, kind: string, toAmount: number | null = null, potBefore = 100) {
  seq += 1;
  return { sequenceNumber: seq, seatIndex, street, kind, toAmount, potBefore };
}

/** BTN(席0)がレイズ、BB(席2)がコール。リバーで BTN が 60(ポット100の60%)をベット。 */
function riverBetHand(btnHole: string[], bbHole: string[]): { hand: ExtractHand; betSeq: number } {
  seq = 0;
  const actions = [
    act(1, "preflop", "postBlind", 50, 0),
    act(2, "preflop", "postBlind", 100, 50),
    act(3, "preflop", "fold"),
    act(4, "preflop", "fold"),
    act(5, "preflop", "fold"),
    act(0, "preflop", "raise", 250),
    act(1, "preflop", "fold"),
    act(2, "preflop", "call", 250),
    act(2, "flop", "check"),
    act(0, "flop", "check"),
    act(2, "turn", "check"),
    act(0, "turn", "check"),
    act(2, "river", "check"),
  ];
  const bet = act(0, "river", "bet", 60, 100);
  actions.push(bet);
  const hand: ExtractHand = {
    buttonFixedPos: 0,
    levelBigBlind: 100,
    board: BOARD,
    seats: [
      { seatIndex: 0, userId: "u-btn", startingStack: 5000, holeCards: btnHole },
      { seatIndex: 2, userId: "u-bb", startingStack: 5000, holeCards: bbHole },
    ],
    actions,
  };
  return { hand, betSeq: bet.sequenceNumber };
}

function decision(over: Partial<ReviewedDecision>): ReviewedDecision {
  return {
    sequenceNumber: 1,
    street: "river",
    analyzable: true,
    outOfScopeReason: null,
    heroPos: "BTN",
    seatIndex: 0,
    effStackBb: 40,
    potBb: 1,
    facingSizeBb: 0,
    actionTaken: { kind: "bet", bucket: "bet50", toAmount: 60 },
    gtoActions: null,
    evLossBb: 0.05,
    classification: "excellent",
    actionName: "ベット",
    geo: null,
    strategy: null,
    ...over,
  };
}

describe("attachStrategies", () => {
  it("ボトムペアでリバーを60%ベットすれば、マージナルとして判定が載る", () => {
    const { hand, betSeq } = riverBetHand(["2h", "9c"], ["Qh", "Jd"]);
    const d = decision({ sequenceNumber: betSeq, seatIndex: 0 });
    attachStrategies(hand, [d]);
    expect(d.strategy?.tag).toBe("marginalBet");
    expect(d.strategy?.grade).toBe("blunder");
  });

  it("ベット/レイズではない決定には判定が載らない(null)", () => {
    const { hand } = riverBetHand(["2h", "9c"], ["Qh", "Jd"]);
    const check = decision({ sequenceNumber: 1, seatIndex: 2, actionTaken: { kind: "check", bucket: "checkOrCall", toAmount: null } });
    attachStrategies(hand, [check]);
    expect(check.strategy).toBeNull();
  });

  it("ホールカードが見えない席は、手の判定を諦めて上書きしない", () => {
    const { hand, betSeq } = riverBetHand([], ["Qh", "Jd"]);
    const d = decision({ sequenceNumber: betSeq, seatIndex: 0 });
    attachStrategies(hand, [d]);
    expect(d.strategy?.grade).toBeNull();
  });

  it("席の持ち主が誰でも、同じ手・同じ局面なら同じ判定になる", () => {
    // userId だけ入れ替えても結果は変わらない(判定は席と手札と履歴だけを見る)。
    const a = riverBetHand(["2h", "9c"], ["Qh", "Jd"]);
    const b = riverBetHand(["2h", "9c"], ["Qh", "Jd"]);
    b.hand.seats = b.hand.seats.map((s) => ({ ...s, userId: `other-${s.userId}` }));
    const da = decision({ sequenceNumber: a.betSeq, seatIndex: 0 });
    const db = decision({ sequenceNumber: b.betSeq, seatIndex: 0 });
    attachStrategies(a.hand, [da]);
    attachStrategies(b.hand, [db]);
    expect(db.strategy).toEqual(da.strategy);
  });
});

/**
 * BTN が CB → BB コール → ターンは BB チェック・BTN チェックバック(ダブルバレルを打たなかった)。
 * ボードは K♥8♦3♥ → 6♠(ラグ)。
 */
function turnCheckBackHand(btnHole: string[]): { hand: ExtractHand; checkSeq: number } {
  seq = 0;
  const actions = [
    act(1, "preflop", "postBlind", 50, 0),
    act(2, "preflop", "postBlind", 100, 50),
    act(3, "preflop", "fold"),
    act(4, "preflop", "fold"),
    act(5, "preflop", "fold"),
    act(0, "preflop", "raise", 250),
    act(1, "preflop", "fold"),
    act(2, "preflop", "call", 250),
    act(2, "flop", "check"),
    act(0, "flop", "bet", 180, 550),
    act(2, "flop", "call", 180),
    act(2, "turn", "check"),
  ];
  const check = act(0, "turn", "check", null, 910);
  actions.push(check);
  const hand: ExtractHand = {
    buttonFixedPos: 0,
    levelBigBlind: 100,
    board: ["Kh", "8d", "3h", "6s", "2c"],
    seats: [
      { seatIndex: 0, userId: "u-btn", startingStack: 5000, holeCards: btnHole },
      { seatIndex: 2, userId: "u-bb", startingStack: 5000, holeCards: ["Qd", "Jd"] },
    ],
    actions,
  };
  return { hand, checkSeq: check.sequenceNumber };
}

describe("ダブルバレルを打たなかったチェック", () => {
  const checkDecision = (checkSeq: number) =>
    decision({ sequenceNumber: checkSeq, street: "turn", seatIndex: 0, actionTaken: { kind: "check", bucket: "checkOrCall", toAmount: null } });

  it("バリュー(セット)をチェックすると悪手、場合分けも載る", () => {
    const { hand, checkSeq } = turnCheckBackHand(["8c", "8s"]);
    const d = checkDecision(checkSeq);
    attachStrategies(hand, [d]);
    applyNotionGrades([d]);
    expect(d.strategy).toMatchObject({ role: null, tag: "doubleBarrel", reason: "dbRag" });
    expect(d.strategy?.barrel).toMatchObject({ action: "check", situation: "checkValue", handKey: "set" });
    expect(d.classification).toBe("mistake");
  });

  it("打たない手(ショーダウンバリュー)をチェックすれば最善", () => {
    const { hand, checkSeq } = turnCheckBackHand(["Kd", "5c"]);
    const d = checkDecision(checkSeq);
    attachStrategies(hand, [d]);
    applyNotionGrades([d]);
    expect(d.strategy?.barrel?.situation).toBe("checkShowdownOk");
    expect(d.classification).toBe("best");
  });
});

describe("applyNotionGrades", () => {
  it("分類が付いている決定は、格付けだけ上書きされ、EV損は残る", () => {
    const { hand, betSeq } = riverBetHand(["2h", "9c"], ["Qh", "Jd"]);
    const d = decision({ sequenceNumber: betSeq, seatIndex: 0, classification: "best", evLossBb: 0 });
    attachStrategies(hand, [d]);
    applyNotionGrades([d]);
    expect(d.classification).toBe("blunder");
    expect(d.evLossBb).toBe(0);
  });

  it("GTOの分類が無い決定(マルチウェイ等)にも、Notion の評価は付く(EV損は null のまま)", () => {
    const { hand, betSeq } = riverBetHand(["2h", "9c"], ["Qh", "Jd"]);
    const d = decision({ sequenceNumber: betSeq, seatIndex: 0, classification: null, evLossBb: null });
    attachStrategies(hand, [d]);
    applyNotionGrades([d]);
    expect(d.classification).toBe("blunder");
    expect(d.evLossBb).toBeNull();
  });

  it("何度呼んでも結果は同じ", () => {
    const { hand, betSeq } = riverBetHand(["2h", "9c"], ["Qh", "Jd"]);
    const d = decision({ sequenceNumber: betSeq, seatIndex: 0, classification: "good" });
    attachStrategies(hand, [d]);
    applyNotionGrades([d]);
    applyNotionGrades([d]);
    expect(d.classification).toBe("blunder");
  });

  it("シンバリューは絶妙手に上書きされる", () => {
    // BTN が A♥Q♦ でトップペア・グッドキッカー、リバーを60%(IPの許容内)で打つ。
    const { hand, betSeq } = riverBetHand(["Ah", "Qd"], ["8h", "9d"]);
    const d = decision({ sequenceNumber: betSeq, seatIndex: 0, classification: "good" });
    attachStrategies(hand, [d]);
    applyNotionGrades([d]);
    expect(d.strategy?.tag).toBe("thinValue");
    expect(d.classification).toBe("artistic");
  });

  it("判定が無い決定の格付けには触らない", () => {
    const d = decision({ classification: "inaccuracy", strategy: null });
    applyNotionGrades([d]);
    expect(d.classification).toBe("inaccuracy");
  });
});

describe("集計", () => {
  it("件数はバッジの付いた全決定、GTO精度はEV損が分かる決定だけで数える", () => {
    const withEv = decision({ sequenceNumber: 1, classification: "best", evLossBb: 0 });
    const notionOnly = decision({ sequenceNumber: 2, classification: "blunder", evLossBb: null });
    const s = summarizeReviewedDecisions([withEv, notionOnly]);
    expect(s.mistakeCount).toBe(1); // EV損の無い大悪手も数える
    expect(s.gtoAccuracy).toBe(100); // 平均はEV損0の1件だけ
  });
});
