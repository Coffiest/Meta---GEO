/**
 * 自分の手が、そのボードに対してどう当たっているかを判定する。
 *
 * `handRank.ts` の `describeMadeHand` は役(ワンペア/ツーペア…)しか返さないので、
 * オーナーの戦略ノートが条件にしている TPGK / ミドルヒット / ボトムヒット /
 * ストレートドロー / バックドアフラドロ といった粒度は判定できない。ここで作る。
 *
 * ポーカー用語の対応:
 *   TPTK = トップペア・トップキッカー(ボード最高ランクにヒット + Aキッカー)
 *   TPGK = トップペア・グッドキッカー(同上 + K〜Tキッカー)
 *   TPLK = トップペア・ローキッカー(同上 + 9以下キッカー)
 *   オーバーペア = 手札のポケットがボード最高ランクより上
 *   ミドルヒット = ボードの2番目のランクにヒット
 *   ボトムヒット = ボードの最下位ランクにヒット
 */

import { parseBoardCard } from "./boardTexture.js";

/** 出来上がっている役(強い順)。 */
export type MadeCategory =
  | "straightFlush"
  | "quads"
  | "fullHouse"
  | "flush"
  | "straight"
  | "trips" // セット(ポケットペア+ボード1枚)とトリップス(手札1枚+ボードのペア)をまとめる
  | "twoPair"
  | "overPair"
  | "topPair"
  | "middlePair"
  | "bottomPair"
  | "pocketPairBelow" // ボードに届いていないポケット(アンダーペア)
  | "highCard";

export type KickerBand = "top" | "good" | "low" | null;

/** 引きに来ているもの。複数同時に成立しうる。 */
export interface DrawFlags {
  /** フラッシュドロー(同じスートが手札+ボードで4枚)。 */
  flushDraw: boolean;
  /** ナッツフラッシュドロー(その色のAを持っている)。 */
  nutFlushDraw: boolean;
  /** バックドアフラッシュドロー(同じスートが3枚)。 */
  backdoorFlushDraw: boolean;
  /** オープンエンドのストレートドロー(4枚連続)。 */
  openEnded: boolean;
  /** ガットショット(1つ抜けの4枚)。 */
  gutshot: boolean;
  /** 手札2枚ともボード最高ランクより上(2オーバー)。 */
  twoOverCards: boolean;
}

export interface HandStrength {
  made: MadeCategory;
  /** トップペアのときのキッカーの段。それ以外は null。 */
  kicker: KickerBand;
  draws: DrawFlags;
  /** 何らかのドローが1つでも成立しているか。 */
  hasAnyDraw: boolean;
}

const RANK_CHARS: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

function parse(card: string | null | undefined) {
  return card ? parseBoardCard(card) : null;
}

/** 5枚の並びからストレートが成立しているか。エースは高低どちらでも使う。 */
function hasStraight(ranks: Set<number>): boolean {
  const s = new Set(ranks);
  if (s.has(14)) s.add(1);
  for (let low = 1; low <= 10; low++) {
    let ok = true;
    for (let k = 0; k < 5; k++) if (!s.has(low + k)) ok = false;
    if (ok) return true;
  }
  return false;
}

/** 4枚連続(オープンエンド)か、1つ抜けの4枚(ガットショット)か。 */
function straightDraws(ranks: Set<number>): { openEnded: boolean; gutshot: boolean } {
  const s = new Set(ranks);
  if (s.has(14)) s.add(1);
  let openEnded = false;
  let gutshot = false;
  // 5枚の窓を全部見て、4枚揃っていればドロー。両端が空いていればオープンエンド。
  for (let low = 1; low <= 10; low++) {
    const window = [0, 1, 2, 3, 4].map((k) => low + k);
    const have = window.filter((r) => s.has(r)).length;
    if (have !== 4) continue;
    const missing = window.find((r) => !s.has(r))!;
    if (missing === window[0] || missing === window[4]) {
      // 端が抜けている = 連続4枚。両端とも伸ばせるならオープンエンド。
      // 片側が盤の端(A234 / JQKA)なら、完成するカードは1種類だけなのでガットショットと同じ。
      const run = missing === window[0] ? window.slice(1) : window.slice(0, 4);
      const below = run[0]! - 1;
      const above = run[3]! + 1;
      if (below >= 1 && !s.has(below) && above <= 14 && !s.has(above)) openEnded = true;
      else gutshot = true;
    } else {
      gutshot = true;
    }
  }
  return { openEnded, gutshot: gutshot && !openEnded };
}

/**
 * 手札2枚とボードから、手の当たり方を判定する。
 * 手札が2枚揃っていない(伏せている相手など)場合は null。
 */
export function readHandStrength(
  holeCards: readonly (string | null)[],
  board: readonly string[]
): HandStrength | null {
  const hole = holeCards.map(parse).filter((c): c is { rank: number; suit: string } => c !== null);
  if (hole.length < 2) return null;
  const boardCards = board.map(parse).filter((c): c is { rank: number; suit: string } => c !== null);

  const all = [...hole, ...boardCards];
  const allRanks = new Set(all.map((c) => c.rank));
  const boardRanks = boardCards.map((c) => c.rank).sort((a, b) => b - a);

  // ── スート ──
  const suitCount = new Map<string, number>();
  for (const c of all) suitCount.set(c.suit, (suitCount.get(c.suit) ?? 0) + 1);
  let flushSuit: string | null = null;
  let flushDrawSuit: string | null = null;
  let backdoorSuit: string | null = null;
  for (const [s, n] of suitCount) {
    if (n >= 5) flushSuit = s;
    else if (n === 4) flushDrawSuit = s;
    else if (n === 3) backdoorSuit = s;
  }
  // 手札が絡んでいないフラッシュ/ドローは自分のものではない。
  const holeHas = (s: string | null) => s !== null && hole.some((c) => c.suit === s);
  const flush = holeHas(flushSuit);
  const flushDraw = holeHas(flushDrawSuit);
  const backdoorFlushDraw = holeHas(backdoorSuit);
  const nutFlushDraw =
    flushDraw && hole.some((c) => c.suit === flushDrawSuit && c.rank === 14);

  // ── 役 ──
  const rankCount = new Map<number, number>();
  for (const c of all) rankCount.set(c.rank, (rankCount.get(c.rank) ?? 0) + 1);
  const groups = [...rankCount.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const straight = hasStraight(allRanks);

  let made: MadeCategory = "highCard";
  let kicker: KickerBand = null;

  const topBoard = boardRanks[0] ?? 0;
  const isPocket = hole[0]!.rank === hole[1]!.rank;
  const quads = groups.find(([, n]) => n >= 4);
  const tripsGroup = groups.find(([, n]) => n === 3);
  const pairGroups = groups.filter(([, n]) => n === 2);

  if (flush && straight) made = "straightFlush";
  else if (quads) made = "quads";
  else if (tripsGroup && pairGroups.length > 0) made = "fullHouse";
  else if (flush) made = "flush";
  else if (straight) made = "straight";
  else if (tripsGroup && hole.some((c) => c.rank === tripsGroup[0])) made = "trips";
  else {
    // ポケットペアは「手札の中だけで出来ているペア」なので、ボードに当たって出来たペアとは
    // 分けて扱う。分けないと 55 が 972 の上で「ミドルヒット」に化ける。
    const boardRankSet = new Set(boardRanks);
    const hitRanks = [...new Set(hole.filter((c) => boardRankSet.has(c.rank)).map((c) => c.rank))];
    if (hitRanks.length >= 2) made = "twoPair";
    else if (isPocket) {
      // ここに来る時点でボードにポケットと同じランクは無い(あれば上の trips で確定済み)。
      made = boardCards.length === 0 || hole[0]!.rank > topBoard ? "overPair" : "pocketPairBelow";
    } else if (hitRanks.length === 1) {
      const r = hitRanks[0]!;
      if (r === topBoard) {
        made = "topPair";
        const kick = hole.find((c) => c.rank !== r)?.rank ?? 0;
        kicker = kick === 14 ? "top" : kick >= 10 ? "good" : "low";
      } else if (r === boardRanks[boardRanks.length - 1]) made = "bottomPair";
      else made = "middlePair";
    }
  }

  const sd = straightDraws(allRanks);
  const draws: DrawFlags = {
    flushDraw,
    nutFlushDraw,
    backdoorFlushDraw: backdoorFlushDraw && !flushDraw && !flush,
    openEnded: sd.openEnded && !straight,
    gutshot: sd.gutshot && !straight,
    twoOverCards:
      boardCards.length > 0 && !isPocket && hole.every((c) => c.rank > topBoard),
  };

  return {
    made,
    kicker,
    draws,
    hasAnyDraw:
      draws.flushDraw || draws.backdoorFlushDraw || draws.openEnded || draws.gutshot,
  };
}

/** 未使用の警告を避けつつ、ランク表を外へ出しておく(他所でのパースに使えるように)。 */
export const RANK_VALUES = RANK_CHARS;
