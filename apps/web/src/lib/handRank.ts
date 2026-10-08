import { parseCard, type Card } from "@meta-geo/engine/src/types/card.js";
import { compareHandRank, evaluate5, evaluateBest, HAND_CATEGORY, type HandCategory, type HandRank } from "@meta-geo/engine/src/handEvaluator.js";

// 役名は i18n キーを返す(表示側の component で t() する。多言語対応)。
const CATEGORY_KEY: Record<HandCategory, string> = {
  [HAND_CATEGORY.highCard]: "hand.highCard",
  [HAND_CATEGORY.onePair]: "hand.onePair",
  [HAND_CATEGORY.twoPair]: "hand.twoPair",
  [HAND_CATEGORY.threeOfAKind]: "hand.threeOfAKind",
  [HAND_CATEGORY.straight]: "hand.straight",
  [HAND_CATEGORY.flush]: "hand.flush",
  [HAND_CATEGORY.fullHouse]: "hand.fullHouse",
  [HAND_CATEGORY.fourOfAKind]: "hand.fourOfAKind",
  [HAND_CATEGORY.straightFlush]: "hand.straightFlush",
};

/** カード枚数が5未満(プリフロップ〜)のときの簡易役判定。ランク重複数だけで判定する
 * (ストレート/フラッシュは5枚必要なため対象外。ペア系とハイカードのみ)。 */
function describeFewCards(cards: Card[]): string {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const freqs = [...counts.values()].sort((a, b) => b - a);
  if (freqs[0] === 4) return CATEGORY_KEY[HAND_CATEGORY.fourOfAKind];
  if (freqs[0] === 3) return CATEGORY_KEY[HAND_CATEGORY.threeOfAKind];
  if (freqs[0] === 2 && freqs[1] === 2) return CATEGORY_KEY[HAND_CATEGORY.twoPair];
  if (freqs[0] === 2) return CATEGORY_KEY[HAND_CATEGORY.onePair];
  return CATEGORY_KEY[HAND_CATEGORY.highCard];
}

/**
 * 自分のホールカード + ボードから、現在成立している役の i18n キーを返す。
 * 5枚以上なら engine の evaluateBest で厳密に判定、5枚未満(プリフロップ等)は簡易判定。
 * カードが揃っていない/不正な場合は null。
 */
export function describeMadeHand(holeCards: (string | null)[], board: string[]): string | null {
  const parsed: Card[] = [];
  for (const s of [...holeCards, ...board]) {
    if (!s) continue;
    const c = parseCard(s);
    if (c) parsed.push(c);
  }
  if (parsed.length < 2) return null;
  if (parsed.length < 5) return describeFewCards(parsed);

  const rank = evaluateBest(parsed);
  if (rank.category === HAND_CATEGORY.straightFlush && rank.ranks[0] === 14) {
    return "hand.royalFlush";
  }
  return CATEGORY_KEY[rank.category];
}

/**
 * いまの役を作っている5枚(キッカー込み)を、渡したカード文字列のまま返す(オレンジ枠を付ける対象)。
 * 5枚未満(プリフロップ)は手札だけを返す。同じ強さの組が複数あれば手札を多く使う組を選ぶ。
 */
export function bestFiveCards(holeCards: (string | null)[], board: string[]): string[] {
  const hole = holeCards.filter((c): c is string => !!c);
  const all = [...hole, ...board];
  const parsed = all.map((s) => ({ s, c: parseCard(s) })).filter((x): x is { s: string; c: Card } => !!x.c);
  if (parsed.length < 5) return hole;
  let best: { rank: HandRank; picks: string[]; holeUsed: number } | null = null;
  const n = parsed.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const pick = [parsed[a]!, parsed[b]!, parsed[c]!, parsed[d]!, parsed[e]!];
            const rank = evaluate5(pick.map((x) => x.c));
            const holeUsed = pick.filter((x) => hole.includes(x.s)).length;
            const cmp = best ? compareHandRank(rank, best.rank) : 1;
            if (!best || cmp > 0 || (cmp === 0 && holeUsed > best.holeUsed)) {
              best = { rank, picks: pick.map((x) => x.s), holeUsed };
            }
          }
  return best ? best.picks : hole;
}
