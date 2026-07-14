import { parseCard, type Card } from "@meta-geo/engine/src/types/card.js";
import { evaluateBest, HAND_CATEGORY, type HandCategory } from "@meta-geo/engine/src/handEvaluator.js";

const CATEGORY_LABEL: Record<HandCategory, string> = {
  [HAND_CATEGORY.highCard]: "ハイカード",
  [HAND_CATEGORY.onePair]: "ワンペア",
  [HAND_CATEGORY.twoPair]: "ツーペア",
  [HAND_CATEGORY.threeOfAKind]: "スリーカード",
  [HAND_CATEGORY.straight]: "ストレート",
  [HAND_CATEGORY.flush]: "フラッシュ",
  [HAND_CATEGORY.fullHouse]: "フルハウス",
  [HAND_CATEGORY.fourOfAKind]: "フォーカード",
  [HAND_CATEGORY.straightFlush]: "ストレートフラッシュ",
};

/** カード枚数が5未満(プリフロップ〜)のときの簡易役判定。ランク重複数だけで判定する
 * (ストレート/フラッシュは5枚必要なため対象外。ペア系とハイカードのみ)。 */
function describeFewCards(cards: Card[]): string {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const freqs = [...counts.values()].sort((a, b) => b - a);
  if (freqs[0] === 4) return CATEGORY_LABEL[HAND_CATEGORY.fourOfAKind];
  if (freqs[0] === 3) return CATEGORY_LABEL[HAND_CATEGORY.threeOfAKind];
  if (freqs[0] === 2 && freqs[1] === 2) return CATEGORY_LABEL[HAND_CATEGORY.twoPair];
  if (freqs[0] === 2) return CATEGORY_LABEL[HAND_CATEGORY.onePair];
  return CATEGORY_LABEL[HAND_CATEGORY.highCard];
}

/**
 * 自分のホールカード + ボードから、現在成立している役の日本語名を返す。
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
    return "ロイヤルフラッシュ";
  }
  return CATEGORY_LABEL[rank.category];
}
