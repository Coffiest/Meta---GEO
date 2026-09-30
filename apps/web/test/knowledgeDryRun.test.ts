import { describe, expect, it } from "vitest";
import type { BetRole } from "@meta-geo/engine/src/review/betRole.js";
import type { StrategyReason, StrategyTag } from "@meta-geo/engine/src/review/strategyVerdict.js";
import { REVIEW_KNOWLEDGE } from "../src/data/reviewKnowledge";
import { POSTFLOP_BUCKETS, PREFLOP_BUCKETS } from "../src/lib/geoApi";
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
  actionTaken: { kind: "bet", bucket: "bet20-40", toAmount: 200 },
  gtoActions: [{ bucket: "bet20-40", frequency: 0.7, evBb: 1 }],
  evLossBb: 0,
  classification: "best",
  actionName: "ベット",
  geo: null,
  strategy: null,
  ...over,
});

const strat = (over: Partial<NonNullable<ReviewedDecision["strategy"]>>): NonNullable<ReviewedDecision["strategy"]> => ({
  role: "otherBet",
  tag: null,
  reason: null,
  grade: null,
  boardChange: null,
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

  it("条件に書いたバケット名は、実際に使われる語彙だけ(存在しない名前で一生当たらない事故の防止)", () => {
    const valid = new Set<string>([...PREFLOP_BUCKETS, ...POSTFLOP_BUCKETS]);
    for (const e of REVIEW_KNOWLEDGE) {
      for (const b of e.when.actionBucket ?? []) expect(valid.has(b), `${e.id}: ${b}`).toBe(true);
    }
  });

  it("実際のバケット名(bet20-40)で打った CB に、サイズ条件つきの節が当たる", () => {
    const ids = idsFor(d({}), ctx(["As", "8h", "2d"], ["Kh", "Qc"], SRP), 50);
    expect(ids).toContain("cb-size-basic");
  });

  it("1つの決定に出るのは1件だけ", () => {
    const context = ctx(["As", "5h", "3d"], ["Kh", "Qc"], SRP);
    const all = idsFor(d({}), context, 50);
    expect(all.length).toBeGreaterThan(1); // 上限が効いていることを確かめる前提
    const capped = matchKnowledge(d({}), REVIEW_KNOWLEDGE, factsForDecision("flop", context));
    expect(capped).toHaveLength(1);
  });
});

/**
 * 戦略判定と役割の解説。
 *
 * 判定でバッジを上書きした手には、その理由を説明する解説が**必ず**出る必要がある
 * (バッジは大悪手なのに、解説は別の一般論、という食い違いを防ぐ)。
 * `satisfies Record<…, true>` で、型に理由や役割が増えたらこのテストが型エラーで知らせる。
 */
describe("戦略判定・役割の解説", () => {
  const ALL_REASONS = {
    thinValueTarget: true,
    marginalWeakHand: true,
    marginalSizeTooBig: true,
    marginalFlushBoard: true,
    flushDrawMiss: true,
    riverBlockStrong: true,
    donkFlushCompleted: true,
    donkTurnRepeat: true,
    donkStraightMove: true,
    donkLowBoard: true,
    donkNoReason: true,
    overpairJamLowSpr: true,
    cb3bet: true,
    cbAmlMiddleHit: true,
    cbLowFreqHand: true,
    cbAceHighBroadway: true,
    cbAceLowLow: true,
    cbPairedBoard: true,
    cbLowBoard: true,
    cbDryHigh: true,
    cbMonotone: true,
    cbDrawHeavy: true,
    delayedCbSize: true,
    barrelPolarized: true,
    barrelMarginal: true,
    checkRaiseTooBig: true,
    checkRaiseDryBroadway: true,
    checkRaiseDraw: true,
    probeStraight: true,
    probeRag: true,
    probeOvercard: true,
    probeAce: true,
    probeFlush: true,
    probeRepeat: true,
    probeCheckHand: true,
  } satisfies Record<StrategyReason, true>;

  const ALL_ROLES = {
    checkRaise: true,
    probe: true,
    donk: true,
    delayedCbet: true,
    cbet: true,
    turnBarrel: true,
    riverBarrel: true,
    otherBet: true,
  } satisfies Record<BetRole, true>;

  const ALL_TAGS = {
    thinValue: true,
    marginalBet: true,
    flushDrawMissBluff: true,
    goodDonk: true,
    badDonk: true,
    overpairJam: true,
    cbet: true,
    delayedCbet: true,
    barrel: true,
    checkRaise: true,
    riverBlock: true,
    probe: true,
  } satisfies Record<StrategyTag, true>;

  const river = ctx(["As", "7h", "2d", "Kc", "3s"], ["2h", "9c"], SRP);
  const riverDecision = (strategy: NonNullable<ReviewedDecision["strategy"]>) =>
    d({ street: "river", actionTaken: { kind: "bet", bucket: "bet60-80", toAmount: 60 }, strategy });

  it("戦略判定の理由は、どれも専用の解説を持つ", () => {
    for (const reason of Object.keys(ALL_REASONS) as StrategyReason[]) {
      const has = REVIEW_KNOWLEDGE.some((e) => e.when.strategyReason?.includes(reason));
      // シンバリューだけは tag 側(thinValue)で持っている。
      const hasByTag = reason === "thinValueTarget" && REVIEW_KNOWLEDGE.some((e) => e.when.strategyTag?.includes("thinValue"));
      expect(has || hasByTag, `理由 ${reason} の解説が無い`).toBe(true);
    }
  });

  it("役割は(otherBet を除き)どれも専用の解説を持つ", () => {
    for (const role of Object.keys(ALL_ROLES) as BetRole[]) {
      if (role === "otherBet") continue;
      expect(REVIEW_KNOWLEDGE.some((e) => e.when.role?.includes(role)), `役割 ${role} の解説が無い`).toBe(true);
    }
  });

  it("タグの一覧が型と一致している(増えたときの取りこぼし防止)", () => {
    // 型に足したら satisfies が型エラーで知らせる。ここは数の固定。
    expect(Object.keys(ALL_TAGS)).toHaveLength(12);
  });

  it("理由ごとの解説は、評価(最善/ずれ)で言い分けたものが正しく引ける", () => {
    const board = ctx(["As", "Qh", "5d", "2c", "4s"], ["Kh", "Kd"], SRP);
    const at = (classification: ReviewedDecision["classification"]) =>
      idsFor(d({ classification, strategy: strat({ role: "cbet", tag: "cbet", reason: "cbAceHighBroadway", grade: classification }) }), board, 50)[0];
    expect(at("best")).toBe("verdict-cb-ahx-ok");
    expect(at("inaccuracy")).toBe("verdict-cb-ahx-off");
  });

  it("短文はバリィの口調(です・ます調を使わない)", () => {
    for (const e of REVIEW_KNOWLEDGE) {
      expect(/です|ます|ください/.test(e.summary), `${e.id}: ${e.summary}`).toBe(false);
    }
  });

  it("マージナルベット(大悪手)には、ボード条件の一般論より先に、その理由が出る", () => {
    const decision = riverDecision(
      strat({ role: "otherBet", tag: "marginalBet", reason: "marginalWeakHand", grade: "blunder" })
    );
    const ids = idsFor(decision, river, 50);
    expect(ids[0]).toBe("verdict-marginal-weak");
  });

  it("リバーのフラドロミス・ブラフには、ブロッカー理論の解説が出る", () => {
    const decision = riverDecision(
      strat({ role: "otherBet", tag: "flushDrawMissBluff", reason: "flushDrawMiss", grade: "mistake" })
    );
    expect(idsFor(decision, river, 50)[0]).toBe("verdict-flush-draw-miss");
  });

  it("シンバリューには、絶妙手の理由(バリューターゲット)が出る", () => {
    const decision = riverDecision(
      strat({ role: "otherBet", tag: "thinValue", reason: "thinValueTarget", grade: "artistic" })
    );
    expect(idsFor(decision, river, 50)[0]).toBe("verdict-thin-value");
  });

  it("ドンクは理由(落ちたカードで何が変わったか)ごとの解説が出る", () => {
    const flush = riverDecision(
      strat({ role: "donk", tag: "goodDonk", reason: "donkFlushCompleted", boardChange: "flushCompleted" })
    );
    const ids = idsFor(flush, river, 50);
    expect(ids[0]).toBe("verdict-donk-flush");
  });

  it("役割だけが分かる決定(判定なし)には、役割の説明が出る", () => {
    const flopBoard = ctx(["Ks", "8h", "3d", "Jc", "2s"], ["Ah", "Qc"], SRP);
    const probe = d({ street: "turn", strategy: strat({ role: "probe" }) });
    expect(idsFor(probe, flopBoard, 50)[0]).toBe("role-probe");
    const delayed = d({ street: "turn", strategy: strat({ role: "delayedCbet" }) });
    expect(idsFor(delayed, flopBoard, 50)[0]).toBe("role-delayed-cbet");
  });

  it("strategy が null(ベット/レイズ以外)の決定には、役割・判定を条件にした節は当たらない", () => {
    const decision = d({ street: "river", actionTaken: { kind: "check", bucket: "checkOrCall", toAmount: null }, strategy: null });
    const ids = idsFor(decision, river, 50);
    const strategyBound = REVIEW_KNOWLEDGE.filter(
      (e) => e.when.role || e.when.strategyTag || e.when.strategyReason || e.when.boardChange
    ).map((e) => e.id);
    for (const id of ids) expect(strategyBound).not.toContain(id);
  });
});

/**
 * プリフロップのミスは、降りすぎか参加しすぎかをバリィが言い分ける。
 * 自分の手と GTO の最頻手を比べて向きを決める。
 */
describe("プリフロップのミスの向き", () => {
  const pre = ctx([], ["7h", "2c"], SRP);
  const pf = (bucket: string, kind: string, gto: { bucket: string; frequency: number; evBb: number }[], classification: ReviewedDecision["classification"]) =>
    d({ street: "preflop", actionTaken: { kind, bucket, toAmount: null }, gtoActions: gto, classification });

  it("フォールドしたが GTO は参加 → 降りすぎ", () => {
    const x = pf("fold", "fold", [{ bucket: "raise2-5", frequency: 0.9, evBb: 1 }, { bucket: "fold", frequency: 0.1, evBb: 0 }], "blunder");
    expect(idsFor(x, pre, 50)[0]).toBe("preflop-overfold");
  });

  it("参加したが GTO はフォールド → 参加しすぎ", () => {
    const x = pf("call", "call", [{ bucket: "fold", frequency: 1, evBb: 0 }, { bucket: "call", frequency: 0, evBb: -1 }], "mistake");
    expect(idsFor(x, pre, 50)[0]).toBe("preflop-overplay");
  });

  it("コールしたが GTO はレイズ → 消極的", () => {
    const x = pf("call", "call", [{ bucket: "raise2-5", frequency: 0.8, evBb: 1 }, { bucket: "call", frequency: 0.2, evBb: 0.2 }], "mistake");
    expect(idsFor(x, pre, 50)[0]).toBe("preflop-too-passive");
  });

  it("レイズしたが GTO はコール → レイズしすぎ", () => {
    const x = pf("raise2-5", "raise", [{ bucket: "call", frequency: 0.8, evBb: 1 }, { bucket: "raise2-5", frequency: 0.2, evBb: 0.5 }], "mistake");
    expect(idsFor(x, pre, 50)[0]).toBe("preflop-too-aggressive");
  });

  it("正しい手(常識)には出さない", () => {
    const x = pf("fold", "fold", [{ bucket: "raise2-5", frequency: 0.9, evBb: 1 }, { bucket: "fold", frequency: 0.1, evBb: 0 }], "book");
    expect(idsFor(x, pre, 50)).not.toContain("preflop-overfold");
  });
});
