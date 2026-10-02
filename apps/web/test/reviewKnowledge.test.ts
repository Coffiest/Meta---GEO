import { describe, expect, it } from "vitest";
import type { ReviewedDecision } from "../src/lib/reviewApi";
import {
  EMPTY_FACTS,
  MAX_NOTES_PER_DECISION,
  boardUpTo,
  factsForDecision,
  gtoTopBucket,
  matchKnowledge,
  type KnowledgeEntry,
} from "../src/lib/reviewKnowledge";

/**
 * 棋譜解析に添える知識の、引き当ての単体テスト。
 *
 * ここが狂うと「関係ない知識が出る」「書いた知識が一生出ない」のどちらかになるが、
 * どちらも画面を見ただけでは気づきにくい(出ていないことに気づけない)。
 * 次の4点を固定する:
 *  - 条件を書かなかった項目は「問わない」として扱われること
 *  - 範囲条件の境界(min は含む / max は含まない)
 *  - 具体的な知識が一般論より先に来ること
 *  - 1決定あたりの件数が上限で切られること
 */

function decision(over: Partial<ReviewedDecision> = {}): ReviewedDecision {
  return {
    sequenceNumber: 1,
    street: "preflop",
    analyzable: true,
    outOfScopeReason: null,
    heroPos: "BTN",
    seatIndex: 0,
    effStackBb: 40,
    potBb: 1.5,
    facingSizeBb: null,
    actionTaken: { kind: "raise", bucket: "raise2.5x", toAmount: 500 },
    gtoActions: [
      { bucket: "raise2.5x", frequency: 0.7, evBb: 1.2 },
      { bucket: "fold", frequency: 0.3, evBb: 0 },
    ],
    evLossBb: 0,
    classification: "best",
    actionName: "レイズ 2.5bb",
    geo: null,
    strategy: null,
    ...over,
  };
}

function entry(id: string, when: KnowledgeEntry["when"]): KnowledgeEntry {
  return { id, title: id, summary: `${id} の短文`, body: `${id} の本文`, when };
}

describe("gtoTopBucket", () => {
  it("頻度が最も高い手を返す", () => {
    expect(gtoTopBucket(decision())).toBe("raise2.5x");
  });

  it("頻度0の手は候補にしない", () => {
    const d = decision({
      gtoActions: [
        { bucket: "raise2.5x", frequency: 0, evBb: 5 },
        { bucket: "fold", frequency: 1, evBb: 0 },
      ],
    });
    expect(gtoTopBucket(d)).toBe("fold");
  });

  it("基準が無ければ null", () => {
    expect(gtoTopBucket(decision({ gtoActions: null }))).toBeNull();
    expect(gtoTopBucket(decision({ gtoActions: [] }))).toBeNull();
  });
});

describe("matchKnowledge", () => {
  it("条件を1つも書いていない知識は、あらゆる決定に当てはまる", () => {
    const general = entry("general", {});
    expect(matchKnowledge(decision(), [general])).toEqual([general]);
    expect(matchKnowledge(decision({ street: "river", heroPos: "SB" }), [general])).toEqual([general]);
  });

  it("書いた条件だけを判定する(他の項目は問わない)", () => {
    const e = entry("btn", { heroPos: ["BTN"] });
    expect(matchKnowledge(decision({ street: "turn", effStackBb: 3 }), [e])).toEqual([e]);
    expect(matchKnowledge(decision({ heroPos: "SB" }), [e])).toEqual([]);
  });

  it("範囲条件は min を含み max を含まない", () => {
    const e = entry("short", { effStackBb: { max: 20 } });
    expect(matchKnowledge(decision({ effStackBb: 19.9 }), [e])).toHaveLength(1);
    expect(matchKnowledge(decision({ effStackBb: 20 }), [e])).toHaveLength(0);
    expect(matchKnowledge(decision({ effStackBb: 20.1 }), [e])).toHaveLength(0);

    const deep = entry("deep", { effStackBb: { min: 20 } });
    expect(matchKnowledge(decision({ effStackBb: 19.9 }), [deep])).toHaveLength(0);
    expect(matchKnowledge(decision({ effStackBb: 20 }), [deep])).toHaveLength(1);
  });

  it("帯を隙間なく敷き詰められる(max と min が同じ値でも重複しない)", () => {
    const shallow = entry("shallow", { effStackBb: { max: 20 } });
    const deep = entry("deep", { effStackBb: { min: 20 } });
    for (const bb of [0, 19.99, 20, 20.01, 200]) {
      expect(matchKnowledge(decision({ effStackBb: bb }), [shallow, deep])).toHaveLength(1);
    }
  });

  it("条件が書かれているのに値が無い決定には当てはまらない", () => {
    // 「オーバーベットに直面したら」という知識を、誰もベットしていない局面に出さない。
    const e = entry("facing", { facingSizeBb: { min: 5 } });
    expect(matchKnowledge(decision({ facingSizeBb: null }), [e])).toHaveLength(0);
    expect(matchKnowledge(decision({ facingSizeBb: 6 }), [e])).toHaveLength(1);
  });

  it("格付けで絞れる", () => {
    const e = entry("onlyBlunder", { classification: ["blunder"] });
    expect(matchKnowledge(decision({ classification: "blunder" }), [e])).toHaveLength(1);
    expect(matchKnowledge(decision({ classification: "best" }), [e])).toHaveLength(0);
    expect(matchKnowledge(decision({ classification: null }), [e])).toHaveLength(0);
  });

  it("GTOの最頻手で絞れる", () => {
    const e = entry("gtoFolds", { gtoTopBucket: ["fold"] });
    expect(matchKnowledge(decision(), [e])).toHaveLength(0);
    const d = decision({
      gtoActions: [
        { bucket: "fold", frequency: 0.9, evBb: 0 },
        { bucket: "raise2.5x", frequency: 0.1, evBb: -0.5 },
      ],
    });
    expect(matchKnowledge(d, [e])).toHaveLength(1);
  });

  it("条件の数が多い知識が先に来る", () => {
    const general = entry("general", {});
    const specific = entry("specific", { street: ["preflop"], heroPos: ["BTN"], effStackBb: { max: 50 } });
    const middle = entry("middle", { heroPos: ["BTN"] });
    const got = matchKnowledge(decision(), [general, middle, specific], EMPTY_FACTS, 10);
    expect(got.map((e) => e.id)).toEqual(["specific", "middle", "general"]);
  });

  it("条件の数が同じなら定義順を保つ", () => {
    const a = entry("a", { heroPos: ["BTN"] });
    const b = entry("b", { street: ["preflop"] });
    expect(matchKnowledge(decision(), [a, b], EMPTY_FACTS, 10).map((e) => e.id)).toEqual(["a", "b"]);
    expect(matchKnowledge(decision(), [b, a], EMPTY_FACTS, 10).map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("既定では1決定あたりの件数が上限で切られる(常時表示なので1件)", () => {
    const many = ["a", "b", "c", "d"].map((id) => entry(id, {}));
    expect(MAX_NOTES_PER_DECISION).toBe(1);
    expect(matchKnowledge(decision(), many)).toHaveLength(MAX_NOTES_PER_DECISION);
  });

  it("知識が空なら何も返さない", () => {
    expect(matchKnowledge(decision(), [])).toEqual([]);
  });

  it("戦略判定に当たる知識は、条件の数に関係なく先頭に来る", () => {
    const board = entry("boardHeavy", { street: ["river"], heroPos: ["BTN"], effStackBb: { max: 100 }, classification: ["best"] });
    const verdict = entry("verdict", { strategyTag: ["marginalBet"] });
    const d = decision({
      street: "river",
      strategy: { role: "otherBet", tag: "marginalBet", reason: "marginalWeakHand", grade: "blunder", boardChange: null },
    });
    expect(matchKnowledge(d, [board, verdict], EMPTY_FACTS, 10).map((e) => e.id)).toEqual(["verdict", "boardHeavy"]);
  });

  it("priority は条件の数に足して比べる(役割の説明を一般論より上に置くための調整)", () => {
    const generic = entry("generic", { street: ["river"], heroPos: ["BTN"] });
    const role: KnowledgeEntry = { ...entry("role", { role: ["probe"] }), priority: 1.5 };
    const d = decision({
      street: "river",
      strategy: { role: "probe", tag: null, reason: null, grade: null, boardChange: null },
    });
    // 条件数は generic=2 / role=1。priority を足して role=2.5 になり、先に来る。
    expect(matchKnowledge(d, [generic, role], EMPTY_FACTS, 10).map((e) => e.id)).toEqual(["role", "generic"]);
  });

  it("役割・判定・盤面変化の条件は、strategy が無い決定(ベット以外)には当たらない", () => {
    const e = entry("needsRole", { role: ["cbet"] });
    expect(matchKnowledge(decision({ strategy: null }), [e])).toHaveLength(0);
    const cbet = decision({
      strategy: { role: "cbet", tag: null, reason: null, grade: null, boardChange: null },
    });
    expect(matchKnowledge(cbet, [e])).toHaveLength(1);
  });

  it("役割が違えば当たらない", () => {
    const e = entry("probeOnly", { role: ["probe"] });
    const donk = decision({
      strategy: { role: "donk", tag: null, reason: null, grade: null, boardChange: null },
    });
    expect(matchKnowledge(donk, [e])).toHaveLength(0);
  });
});

describe("boardUpTo", () => {
  const board = ["As", "7h", "2d", "Kc", "3s"];

  it("その決定の時点で開いていた枚数だけ切り出す", () => {
    expect(boardUpTo("preflop", board)).toEqual([]);
    expect(boardUpTo("flop", board)).toEqual(["As", "7h", "2d"]);
    expect(boardUpTo("turn", board)).toEqual(["As", "7h", "2d", "Kc"]);
    expect(boardUpTo("river", board)).toEqual(board);
  });

  it("知らないストリート名なら丸ごと返す(切り落として情報を失わない)", () => {
    expect(boardUpTo("showdown", board)).toEqual(board);
  });
});

describe("ボード・手・ポットを条件にした引き当て", () => {
  const ctx = {
    board: ["As", "7h", "2d", "Kc", "3s"],
    heroHoleCards: ["Ah", "Qd"],
    actions: [
      { seatIndex: 3, street: "preflop", kind: "raise" },
      { seatIndex: 2, street: "preflop", kind: "call" },
    ],
    buttonFixedPos: 0,
    seatCount: 6,
  };

  it("フロップの決定は、リバーまでのボードでは判定されない", () => {
    // フロップ A72 は H-M-L。ここにリバーの K が入ると別の形になってしまう。
    const flopOnly = entry("flopShape", { boardShape: ["H-M-L"] });
    const withRiver = entry("riverShape", { boardShape: ["H-H-M-L-L"] });
    const facts = factsForDecision("flop", ctx);
    expect(matchKnowledge(decision({ street: "flop" }), [flopOnly, withRiver], facts).map((e) => e.id)).toEqual([
      "flopShape",
    ]);
  });

  it("ボードが無い決定には、ボードの条件を書いた知識は当たらない", () => {
    const e = entry("needsBoard", { boardSuit: ["rainbow"] });
    const facts = factsForDecision("preflop", ctx);
    expect(matchKnowledge(decision({ street: "preflop" }), [e], facts)).toHaveLength(0);
  });

  it("自分の手の当たり方で絞れる", () => {
    const facts = factsForDecision("flop", ctx); // AQ on A72 → トップペア/グッドキッカー
    expect(matchKnowledge(decision(), [entry("tp", { made: ["topPair"] })], facts)).toHaveLength(1);
    expect(matchKnowledge(decision(), [entry("set", { made: ["trips"] })], facts)).toHaveLength(0);
    expect(matchKnowledge(decision(), [entry("gk", { kicker: ["good"] })], facts)).toHaveLength(1);
  });

  it("anyDraw は挙げたうちどれか1つでも成立していれば当たる", () => {
    const wet = {
      ...ctx,
      board: ["9s", "8s", "2d", "Kc", "3h"],
      heroHoleCards: ["Js", "Ts"], // フラドロ + オープンエンド
    };
    const facts = factsForDecision("flop", wet);
    expect(matchKnowledge(decision(), [entry("d1", { anyDraw: ["flushDraw"] })], facts)).toHaveLength(1);
    expect(matchKnowledge(decision(), [entry("d2", { anyDraw: ["gutshot", "flushDraw"] })], facts)).toHaveLength(1);
    expect(matchKnowledge(decision(), [entry("d3", { anyDraw: ["nutFlushDraw"] })], facts)).toHaveLength(0);
  });

  it("ポットの形で絞れる", () => {
    const facts = factsForDecision("flop", ctx); // レイズ1回 → SRP
    expect(matchKnowledge(decision(), [entry("srp", { potType: ["srp"] })], facts)).toHaveLength(1);
    expect(matchKnowledge(decision(), [entry("3bet", { potType: ["threeBet"] })], facts)).toHaveLength(0);
  });

  it("手札が見えない決定には、手の条件を書いた知識は当たらない", () => {
    const blind = { ...ctx, heroHoleCards: [] };
    const facts = factsForDecision("flop", blind);
    expect(matchKnowledge(decision(), [entry("needsHand", { made: ["topPair"] })], facts)).toHaveLength(0);
    // ボードだけの条件なら当たる。
    expect(matchKnowledge(decision(), [entry("boardOnly", { boardSuit: ["rainbow"] })], facts)).toHaveLength(1);
  });
});
