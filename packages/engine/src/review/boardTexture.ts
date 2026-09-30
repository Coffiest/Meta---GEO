/**
 * ボードの質感(テクスチャ)を判定する。
 *
 * オーナーの戦略ノートは、その大半が「ペアボードなら」「モノトーンなら」「A-L-L なら」
 * といった**ボードの質感**を条件にしている。アプリにはこれを判定する仕組みが無かったので、
 * ここで作る。棋譜解析の解説を局面に紐づけるための土台。
 *
 * ランクの帯は**オーナー確定仕様**:
 *
 *   L = 2〜4 / M = 5〜9 / H = T〜A
 *
 * (ノートの中に「A-L-L(5以下)」と書かれた箇所もあったが、【ミドルペアボード】の節の
 *  「ロー(2~4)、ミドル(5~9)、ハイ(T~A)」に揃える、とオーナーが決めた。)
 */

export type RankBand = "L" | "M" | "H";
export type SuitPattern = "monotone" | "twotone" | "rainbow";
/** ドローの多寡。しきい値は下の DRAW_BANDS を参照。 */
export type DrawDensity = "dry" | "normal" | "drawHeavy";

export interface BoardTexture {
  /** 開いている枚数(3=フロップ / 4=ターン / 5=リバー)。 */
  cardCount: number;
  /** 各カードのランク(2〜14)。高い順。 */
  ranks: number[];
  /** 各カードの帯。高い順。 */
  bands: RankBand[];
  /** 帯の並びを繋いだ形(例 "H-L-L")。ノートの「A-L-L」等と突き合わせる。 */
  shape: string;
  /** 最高ランク(2〜14)。 */
  highRank: number;
  /** 最高ランクが A か。 */
  isAceHigh: boolean;
  /** 最高ランクが K か。 */
  isKingHigh: boolean;
  /** ブロードウェイ(T〜A)の枚数。ノートの「2BW」= 2枚。 */
  broadwayCount: number;
  /** ペアが乗っているか。 */
  isPaired: boolean;
  /** ペアのランクの帯(ペアが無ければ null)。 */
  pairBand: RankBand | null;
  /** 同じランクが3枚(トリップスボード)。 */
  isTrips: boolean;
  /** スートの散り方。 */
  suit: SuitPattern;
  /** 同じスートの最大枚数。 */
  maxSuitCount: number;
  /**
   * フラッシュが成立しうるか(同じスートが3枚以上)。
   * `suit === "twotone"` は「2枚以上が同じ」なので、5枚のボードではほぼ常に真になる。
   * 「フラッシュ完成カードが落ちた」のような条件にはこちらを使うこと。
   */
  flushPossible: boolean;
  /**
   * 最高ランクと2番目のランクの差。ノートの【A〜Jhi HMnSD】の「HM」。
   * 「HMが小さくなるほどサイズが大きくなる」= 差が小さいほどコネクト寄り。
   * カードが2枚未満なら null。
   */
  hmGap: number | null;
  /** ストレートドローが生まれうる並びがあるか。 */
  hasStraightDraw: boolean;
  /** ドローの本数(下の数え方を参照)。 */
  drawCount: number;
  /** 本数を3段階に落としたもの。 */
  draws: DrawDensity;
}

/** ドローの本数 → ドライ / 普通 / ドローヘビー のしきい値(オーナー確定: 本数で段階分け)。 */
export const DRAW_BANDS = {
  /** これ以下はドライ。 */
  dryMax: 1,
  /** これ以上はドローヘビー。 */
  heavyMin: 3,
} as const;

/** 2枚のランクがこの差以内なら、その2枚でストレートドローが生まれうるとみなす。 */
const STRAIGHT_SPAN = 3;

const RANK_CHARS: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

/** "As" / "10h" / "Kd" を {rank, suit} に。読めなければ null。 */
export function parseBoardCard(card: string): { rank: number; suit: string } | null {
  if (!card || card.length < 2) return null;
  const suit = card.slice(-1).toLowerCase();
  if (!"shdc".includes(suit)) return null;
  const rankStr = card.slice(0, -1).toUpperCase();
  const rank = rankStr === "10" ? 10 : RANK_CHARS[rankStr];
  return rank ? { rank, suit } : null;
}

export function bandOf(rank: number): RankBand {
  if (rank <= 4) return "L";
  if (rank <= 9) return "M";
  return "H";
}

/**
 * ドローの本数を数える。
 *
 * 「ドローヘビー」に厳密な定義はノートに無いので、次の数え方に決めた
 * (オーナーは「ドローの本数で段階分け」を選択):
 *
 *   ・同じスートが2枚以上ある → +1(フラッシュドローが存在しうる)
 *   ・ランクの差が3以内の組 → 1組につき +1(ストレートドローが存在しうる)
 *
 * エースは 14 と 1 の両方で数える(A23 のようなホイール寄りの並びを拾うため)。
 * ノートに出てくる実例で校正してある: Q75r=1(ドライ) / A82r=0(ドライ) / JT9tt=4(ドローヘビー)。
 */
function countDraws(parsed: { rank: number; suit: string }[]): { count: number; hasStraightDraw: boolean } {
  let count = 0;
  const suits = new Map<string, number>();
  for (const c of parsed) suits.set(c.suit, (suits.get(c.suit) ?? 0) + 1);
  for (const n of suits.values()) {
    if (n >= 2) {
      count += 1;
      break; // フラッシュドローは1本と数える(モノトーンでも2本にはしない)
    }
  }

  // ストレート方向。エースは高低どちらにも効くので両方の値を持たせる。
  const values: number[][] = parsed.map((c) => (c.rank === 14 ? [14, 1] : [c.rank]));
  let straightPairs = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const near = values[i]!.some((a) => values[j]!.some((b) => a !== b && Math.abs(a - b) <= STRAIGHT_SPAN));
      if (near) straightPairs += 1;
    }
  }
  return { count: count + straightPairs, hasStraightDraw: straightPairs > 0 };
}

/** ボード(3〜5枚)の質感を判定する。読めるカードが1枚も無ければ null。 */
export function readBoardTexture(board: readonly string[]): BoardTexture | null {
  const parsed = board.map(parseBoardCard).filter((c): c is { rank: number; suit: string } => c !== null);
  if (parsed.length === 0) return null;

  const sorted = [...parsed].sort((a, b) => b.rank - a.rank);
  const ranks = sorted.map((c) => c.rank);
  const bands = ranks.map(bandOf);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  let pairRank: number | null = null;
  let isTrips = false;
  for (const [r, n] of counts) {
    if (n >= 3) isTrips = true;
    if (n >= 2 && (pairRank === null || r > pairRank)) pairRank = r;
  }

  const suitCounts = new Map<string, number>();
  for (const c of sorted) suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1);
  const maxSuit = Math.max(...suitCounts.values());
  // モノトーンは「全部が同じスート」。ツートーンは「2枚以上が同じスート」。
  const suit: SuitPattern =
    suitCounts.size === 1 ? "monotone" : maxSuit >= 2 ? "twotone" : "rainbow";

  const { count: drawCount, hasStraightDraw } = countDraws(sorted);
  const draws: DrawDensity =
    drawCount <= DRAW_BANDS.dryMax ? "dry" : drawCount >= DRAW_BANDS.heavyMin ? "drawHeavy" : "normal";

  return {
    cardCount: sorted.length,
    ranks,
    bands,
    shape: bands.join("-"),
    highRank: ranks[0]!,
    isAceHigh: ranks[0] === 14,
    isKingHigh: ranks[0] === 13,
    broadwayCount: ranks.filter((r) => r >= 10).length,
    isPaired: pairRank !== null,
    pairBand: pairRank === null ? null : bandOf(pairRank),
    isTrips,
    suit,
    maxSuitCount: maxSuit,
    flushPossible: maxSuit >= 3,
    hmGap: ranks.length >= 2 ? ranks[0]! - ranks[1]! : null,
    hasStraightDraw,
    drawCount,
    draws,
  };
}
