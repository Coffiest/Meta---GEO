import { describe, expect, it } from "vitest";
import { compareHandRank, evaluateBest } from "../src/handEvaluator.js";
import { handRankKey } from "../src/solver/cfrPostflopMulti.js";
import { RANKS, SUITS, type Card } from "../src/types/card.js";

/**
 * ショーダウン符号の事前計算では、役評価を整数キー(handRankKey)へ畳んで内側ループを整数比較にしている。
 * このキーの順序が compareHandRank と完全に一致することを保証する(一致しないと解が静かに変わる)。
 */

/** 52枚のデッキ(決定的な順序)。 */
function deck(): Card[] {
  const out: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) out.push({ rank, suit });
  return out;
}

/** 決定的な擬似乱数(seed固定, xorshift)。テストの再現性のため Math.random を使わない。 */
function makeRng(seed: number): () => number {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** デッキから重複なく n 枚引く。 */
function draw(d: Card[], n: number, rnd: () => number): Card[] {
  const pool = [...d];
  const out: Card[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rnd() * pool.length) % pool.length;
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}

describe("handRankKey", () => {
  it("orders hands identically to compareHandRank across many random 7-card hands", () => {
    const d = deck();
    const rnd = makeRng(20260730);
    const ranks = Array.from({ length: 220 }, () => evaluateBest(draw(d, 7, rnd)));

    let compared = 0;
    let strictPairs = 0;
    for (let i = 0; i < ranks.length; i++) {
      for (let j = i + 1; j < ranks.length; j++) {
        const cmp = compareHandRank(ranks[i]!, ranks[j]!);
        const ki = handRankKey(ranks[i]!);
        const kj = handRankKey(ranks[j]!);
        const keyCmp = ki > kj ? 1 : ki < kj ? -1 : 0;
        expect(Math.sign(cmp)).toBe(keyCmp);
        compared++;
        if (cmp !== 0) strictPairs++;
      }
    }
    // 比較が実際に行われ、かつ引き分けだけでないこと(テストが空回りしていない保証)。
    expect(compared).toBeGreaterThan(20_000);
    expect(strictPairs).toBeGreaterThan(1_000);
  });

  it("is stable for equal ranks and monotonic in category", () => {
    const d = deck();
    const rnd = makeRng(7);
    const a = evaluateBest(draw(d, 7, rnd));
    expect(handRankKey(a)).toBe(handRankKey({ category: a.category, ranks: [...a.ranks] }));

    // 上位カテゴリのキーは、下位カテゴリのどのキッカー構成よりも必ず大きい。
    const lowMaxKickers = handRankKey({ category: 0, ranks: [14, 14, 14, 14, 14, 14] });
    const highMinKickers = handRankKey({ category: 1, ranks: [] });
    expect(highMinKickers).toBeGreaterThan(lowMaxKickers);
  });
});
