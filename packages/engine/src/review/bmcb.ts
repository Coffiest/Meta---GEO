import { readHandStrength } from "./handStrength.js";
import type { NotionGrade } from "./strategyVerdict.js";

/**
 * BMCB(IP のコーラーが、プリフロップのレイザーのフロップのチェックを見て打つベット)の判定。
 * 出典: オーナー支給のスライド「BMCB簡易戦略(LJ vs BTN)」「BMCBについて(CO vs BTN)」。
 *
 *  - ハイボード系: バリュー = TPTK 以上、ブラフ = ボトムヒット・ローポケ・ガットショット。80% 前後の大きいサイズでポラライズ。
 *    それ以外の手はチェック(ベット頻度は全体で約 20%)。
 *  - コネクト・ロー系: レンジで 33%(頻度 60%)。簡易的に、2オーバー(ペアもドローも無い)は全部チェック。
 *  - モノトーン系: ハンドに関係なく 33%(頻度 50%)。ただし A・K ハイのモノトーンはレンジチェック。
 *  - ペアボード系: ハンドに関係なく 33%(頻度 60%)。ただし全部ブロードウェイのペアボード(AKK など)はレンジチェック。
 */
export type BmcbBoard = "high" | "connect" | "monotone" | "paired" | "monotoneAK" | "pairedBroadway";
export type BmcbHand = "value" | "bluff" | "other" | "twoOver" | "any";

export interface BmcbJudgement {
  board: BmcbBoard;
  hand: BmcbHand;
  /** 正解のアクション(ハイボードの bluff は「打つ」が基本、チェックも可)。 */
  correct: "bigBet" | "smallBet" | "check";
  grade: NotionGrade;
}

const RANK: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
const rankOf = (c: string) => RANK[c[0]!.toUpperCase()] ?? Number(c[0]);
const suitOf = (c: string) => c.slice(-1).toLowerCase();

/** 小さいサイズ(33%)とみなす上限・大きいサイズ(80%)とみなす下限。 */
export const BMCB_SMALL_MAX = 0.45;
export const BMCB_BIG_MIN = 0.6;

export function bmcbBoardOf(flop: readonly string[]): BmcbBoard | null {
  if (flop.length < 3) return null;
  const fb = flop.slice(0, 3);
  const ranks = fb.map(rankOf).sort((a, b) => b - a);
  const high = ranks[0]!;
  if (new Set(fb.map(suitOf)).size === 1) return high >= 13 ? "monotoneAK" : "monotone";
  if (new Set(ranks).size < 3) return ranks.every((r) => r >= 10) ? "pairedBroadway" : "paired";
  // コネクト = 3枚が5ランクの幅に収まる(ストレートの目がある)。ロー = 9 ハイ以下。どちらも広く安く打つ。
  const span = ranks[0]! - ranks[2]!;
  const wheelSpan = ranks[0] === 14 ? ranks[1]! - 1 : 99;
  if (high <= 9 || span <= 4 || wheelSpan <= 4) return "connect";
  return "high";
}

function handRole(board: BmcbBoard, hole: readonly string[], flop: readonly string[]): BmcbHand {
  const hs = readHandStrength(hole, flop.slice(0, 3));
  if (!hs) return "other";
  const m = hs.made;
  if (board === "high") {
    const topBoard = Math.max(...flop.slice(0, 3).map(rankOf));
    const kick = Math.max(...hole.map(rankOf).filter((r) => r !== topBoard));
    const tptk = m === "topPair" && (kick === 14 || (topBoard === 14 && kick === 13));
    const strong = ["straightFlush", "quads", "fullHouse", "flush", "straight", "trips", "twoPair", "overPair"].includes(m);
    if (strong || tptk) return "value";
    if (m === "bottomPair" || m === "pocketPairBelow" || (m === "highCard" && hs.draws.gutshot)) return "bluff";
    return "other";
  }
  if (board === "connect" && m === "highCard" && hs.draws.twoOverCards && !hs.hasAnyDraw) return "twoOver";
  return "any";
}

/**
 * `kind` は bet / check。`sizePct` はベットのポットに対する割合。
 * 判定できないとき(手札・ボードが読めない)は null。
 */
export function judgeBmcb(params: {
  hole: readonly string[];
  flop: readonly string[];
  kind: "bet" | "check";
  sizePct: number;
}): BmcbJudgement | null {
  const board = bmcbBoardOf(params.flop);
  if (!board || params.hole.length !== 2) return null;
  const hand = handRole(board, params.hole, params.flop);
  const bet = params.kind === "bet";
  const small = bet && params.sizePct <= BMCB_SMALL_MAX;
  const big = bet && params.sizePct >= BMCB_BIG_MIN;
  const out = (correct: BmcbJudgement["correct"], grade: NotionGrade): BmcbJudgement => ({ board, hand, correct, grade });

  if (board === "monotoneAK" || board === "pairedBroadway") return out("check", bet ? "mistake" : "best");
  if (board === "high") {
    if (hand === "value") return out("bigBet", big ? "best" : bet ? "good" : "inaccuracy");
    if (hand === "bluff") return out("bigBet", big ? "best" : bet ? "good" : "good");
    return out("check", bet ? "mistake" : "best");
  }
  if (hand === "twoOver") return out("check", bet ? "inaccuracy" : "best");
  // レンジで 33%(頻度 50〜60%)。チェックも混ぜる戦略なので、チェックは良手。
  return out("smallBet", small ? "best" : bet ? "inaccuracy" : "excellent");
}
