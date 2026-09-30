import { describe, expect, it } from "vitest";
import { REVIEW_KNOWLEDGE } from "../src/data/reviewKnowledge";
import { factsForDecision, matchKnowledge } from "../src/lib/reviewKnowledge";
import type { ReviewedDecision } from "../src/lib/reviewApi";

/**
 * 実データに近い局面を流して、解説が「出るべきところに出て、出るべきでないところに出ない」ことを見る。
 * 個々の条件の単体テストは reviewKnowledge.test.ts 側。ここは知識全体の当たり方の確認。
 */

const d = (over: Partial<ReviewedDecision>): ReviewedDecision => ({
  sequenceNumber: 1,
  street: "flop",
  analyzable: true,
  outOfScopeReason: null,
  heroPos: "BTN",
  seatIndex: 0,
  effStackBb: 100,
  potBb: 6,
  facingSizeBb: null,
  actionTaken: { kind: "bet", bucket: "bet33", toAmount: 200 },
  gtoActions: [{ bucket: "bet33", frequency: 0.7, evBb: 1 }],
  evLossBb: 0,
  classification: "best",
  actionName: "ベット",
  geo: null,
  ...over,
});

const ctx = (board: string[], hole: string[], actions: { seatIndex: number; street: string; kind: string }[]) => ({
  board,
  heroHoleCards: hole,
  actions,
  buttonFixedPos: 0,
  seatCount: 6,
});

const SRP = [
  { seatIndex: 3, street: "preflop", kind: "raise" },
  { seatIndex: 2, street: "preflop", kind: "call" },
];
const THREE_BET = [
  { seatIndex: 3, street: "preflop", kind: "raise" },
  { seatIndex: 5, street: "preflop", kind: "raise" },
  { seatIndex: 3, street: "preflop", kind: "call" },
];

function idsFor(decision: ReviewedDecision, context: ReturnType<typeof ctx>, limit = 10) {
  return matchKnowledge(decision, REVIEW_KNOWLEDGE, factsForDecision(decision.street, context), limit).map((e) => e.id);
}

describe("知識全体の当たり方", () => {
  it("知識はすべて一意なIDを持つ", () => {
    const ids = REVIEW_KNOWLEDGE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("見出し・短文・本文がどれも空でない", () => {
    for (const e of REVIEW_KNOWLEDGE) {
      expect(e.title.length, e.id).toBeGreaterThan(0);
      expect(e.summary.length, e.id).toBeGreaterThan(0);
      expect(e.body.length, e.id).toBeGreaterThan(0);
    }
  });

  it("短文はカードに常時出るので、長すぎないこと", () => {
    // 2文まで・120字程度を目安にする。これを超えると一覧性が落ちる。
    for (const e of REVIEW_KNOWLEDGE) {
      expect(e.summary.length, `${e.id} の短文が長すぎる`).toBeLessThanOrEqual(120);
    }
  });

  it("A53r は A-L-L ではなく A-M-L(帯が L=2〜4 なので 5 はミドル)", () => {
    const ids = idsFor(d({}), ctx(["As", "5h", "3d"], ["Kh", "Qc"], SRP), 50);
    expect(ids).not.toContain("cb-a-l-l");
  });

  it("A-M-L でミドルにヒットしていれば、その節が当たる", () => {
    // この節の条件は「ミドルヒット」。ハイカードのままでは当たらないのが正しい。
    const withHit = idsFor(d({}), ctx(["As", "5h", "3d"], ["5c", "8d"], SRP), 50);
    expect(withHit).toContain("cb-a-m-l");
    const noHit = idsFor(d({}), ctx(["As", "5h", "3d"], ["Kh", "Qc"], SRP), 50);
    expect(noHit).not.toContain("cb-a-m-l");
  });

  it("A43r でCBした → A-L-Lボードの節が当たる", () => {
    const ids = idsFor(d({}), ctx(["As", "4h", "3d"], ["Kh", "Qc"], SRP));
    expect(ids).toContain("cb-a-l-l");
  });

  it("3betPotのローボードOOP → 3betPot向けの節が当たり、SRP向けは当たらない", () => {
    const ids = idsFor(d({ heroPos: "BB" }), ctx(["8s", "5h", "3d"], ["Ah", "Kc"], THREE_BET));
    expect(ids).toContain("3bet-oop-low");
    expect(ids).not.toContain("block-bet-srp");
  });

  it("BvBのモノトーンフロップ → BvB向けの節が当たる", () => {
    const bvb = [
      { seatIndex: 3, street: "preflop", kind: "fold" },
      { seatIndex: 4, street: "preflop", kind: "fold" },
      { seatIndex: 5, street: "preflop", kind: "fold" },
      { seatIndex: 0, street: "preflop", kind: "fold" },
      { seatIndex: 1, street: "preflop", kind: "raise" },
      { seatIndex: 2, street: "preflop", kind: "call" },
    ];
    const ids = idsFor(d({ heroPos: "SB" }), ctx(["As", "8s", "2s"], ["Kh", "Qc"], bvb));
    expect(ids.some((i) => i.startsWith("bvb-") || i.startsWith("bmcb-bvb"))).toBe(true);
  });

  it("プリフロップの決定には、ボードを条件にした節は1つも当たらない", () => {
    const ids = idsFor(d({ street: "preflop" }), ctx(["As", "8s", "2s"], ["Kh", "Qc"], SRP), 50);
    const boardBound = REVIEW_KNOWLEDGE.filter(
      (e) => e.when.boardShape || e.when.boardSuit || e.when.boardDraws || e.when.boardHighBand
    ).map((e) => e.id);
    for (const id of ids) expect(boardBound).not.toContain(id);
  });

  it("1つの決定に出るのは1件だけ", () => {
    const context = ctx(["As", "5h", "3d"], ["Kh", "Qc"], SRP);
    const all = idsFor(d({}), context, 50);
    expect(all.length).toBeGreaterThan(1); // 上限が効いていることを確かめる前提
    const capped = matchKnowledge(d({}), REVIEW_KNOWLEDGE, factsForDecision("flop", context));
    expect(capped).toHaveLength(1);
  });
});
