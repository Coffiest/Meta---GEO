export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

/** 2〜14 (14 = Ace) */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export const SUITS: readonly Suit[] = ["spades", "hearts", "diamonds", "clubs"];
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

/** チップレースやポットの端数配分で使うスート優先順(降順): spades > hearts > diamonds > clubs */
export const SUIT_PRIORITY: Readonly<Record<Suit, number>> = {
  spades: 4,
  hearts: 3,
  diamonds: 2,
  clubs: 1,
};

export function cardToString(card: Card): string {
  const rankStr =
    card.rank === 14 ? "A" : card.rank === 13 ? "K" : card.rank === 12 ? "Q" : card.rank === 11 ? "J" : String(card.rank);
  const suitChar = { spades: "s", hearts: "h", diamonds: "d", clubs: "c" }[card.suit];
  return `${rankStr}${suitChar}`;
}
