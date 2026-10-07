import { parseBoardCard } from "../review/boardTexture.js";

/**
 * GEO データベースのボードの分類(オーナー確定仕様)。
 *
 * 実際のカードの組み合わせは多すぎて1つ1つではデータが貯まらないため、ボードを「群」にまとめて集計する。
 *
 * フロップ: Amu「Flop CBの基礎 (BTN vs BB)」の Class 分類(7種)× コネクトの有無。
 *   Class1 モノトーン / Class2 トリップス / Class3 ペア /
 *   Class4 A〜Jハイ HMSD / Class5 A〜Jハイ HMnSD / Class6 T・9ハイ / Class7 8ハイ以下
 *   - HMSD = ハイカードとミドルカードの2枚を使うストレートドローがある(2枚が同じ5連の幅に入る。A は 1 としても数える)。
 *   - コネクト = フロップの時点で、何らかの2枚でストレートが完成しうる。
 *
 * ターン / リバー: 落ちたカード1枚が何をしたかで分ける。1枚が複数に当てはまるときは番号の若い方。
 * リバーはドロー発生(12〜14)を使わない(もう次のカードが無いので、ドローが生まれても意味が無い。ラグに入る)。
 * 画面では大分類(完成 / ペア / オーバーカード / ドロー / ラグ)を基本にし、サンプルが十分あるときだけ小分類まで出す。
 */

export type FlopClassId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface FlopClass {
  classId: FlopClassId;
  /** フロップの時点で、何らかの2枚でストレートが完成しうるか。ペア・トリップスのボードは常に false。 */
  connected: boolean;
  /** 群のキー(例 "c5" / "c7x")。x はコネクト。 */
  key: string;
}

export const FLOP_CLASS_LABEL: Record<FlopClassId, string> = {
  1: "モノトーン",
  2: "トリップス",
  3: "ペア",
  4: "A〜Jハイ HMSD",
  5: "A〜Jハイ HMnSD",
  6: "T・9ハイ",
  7: "8ハイ以下",
};

/** 「Class5 A〜Jハイ HMnSD(コネクトなし)」の形の表示名。 */
export function flopClassName(c: FlopClass): string {
  const conn = c.classId === 2 || c.classId === 3 ? "" : c.connected ? "(コネクト)" : "(コネクトなし)";
  return `Class${c.classId} ${FLOP_CLASS_LABEL[c.classId]}${conn}`;
}

export function flopClassKey(classId: FlopClassId, connected: boolean): string {
  return `c${classId}${connected ? "x" : ""}`;
}

type Card = { rank: number; suit: string };

function parseAll(board: readonly string[]): Card[] | null {
  const out: Card[] = [];
  for (const c of board) {
    const p = parseBoardCard(c);
    if (!p) return null;
    out.push(p);
  }
  return out;
}

/** A を 14 と 1 の両方に展開したランクの集合。 */
function rankValues(ranks: Iterable<number>): Set<number> {
  const s = new Set<number>();
  for (const r of ranks) {
    s.add(r);
    if (r === 14) s.add(1);
  }
  return s;
}

/** ランクの集合に5連(A は 1 にもなる)が含まれるか。 */
function hasStraight(values: Set<number>): boolean {
  for (let lo = 1; lo <= 10; lo++) {
    let ok = true;
    for (let r = lo; r < lo + 5; r++) if (!values.has(r)) ok = false;
    if (ok) return true;
  }
  return false;
}

/** 手札2枚のランクの組(r1 ≤ r2)。ストレートの判定はランクだけで決まるので 91 通りを総当たりする。 */
const HOLE_RANK_PAIRS: [number, number][] = [];
for (let a = 2; a <= 14; a++) for (let b = a; b <= 14; b++) HOLE_RANK_PAIRS.push([a, b]);

/** ボードに足すとストレートになる手札のランクの組。 */
function straightPairs(boardRanks: readonly number[]): Set<string> {
  const out = new Set<string>();
  for (const [a, b] of HOLE_RANK_PAIRS) {
    if (hasStraight(rankValues([...boardRanks, a, b]))) out.add(`${a}-${b}`);
  }
  return out;
}

/**
 * ボードに足すとオープンエンド(両側が空いた4連)になる手札のランクの組。ストレートが完成する組は除く。
 * A を含む4連(A234 / JQKA)は片側しか無いので数えない。
 */
function openEnderPairs(boardRanks: readonly number[]): Set<string> {
  const out = new Set<string>();
  for (const [a, b] of HOLE_RANK_PAIRS) {
    const values = rankValues([...boardRanks, a, b]);
    if (hasStraight(values)) continue;
    let oe = false;
    for (let lo = 2; lo <= 10 && !oe; lo++) {
      let ok = true;
      for (let r = lo; r < lo + 4; r++) if (!values.has(r)) ok = false;
      if (ok) oe = true;
    }
    if (oe) out.add(`${a}-${b}`);
  }
  return out;
}

/** フロップ(3枚)の群。読めなければ null。 */
export function classifyFlop(board: readonly string[]): FlopClass | null {
  if (board.length < 3) return null;
  const cards = parseAll(board.slice(0, 3));
  if (!cards) return null;
  const ranks = cards.map((c) => c.rank).sort((x, y) => y - x);
  const distinct = new Set(ranks).size;
  const monotone = new Set(cards.map((c) => c.suit)).size === 1;
  const connected = distinct === 3 && straightPairs(ranks).size > 0;

  let classId: FlopClassId;
  if (monotone) classId = 1;
  else if (distinct === 1) classId = 2;
  else if (distinct === 2) classId = 3;
  else {
    const [h, m] = ranks as [number, number, number];
    if (h >= 11) {
      // HMSD: H と M が同じ5連の幅に入る(差が4以内)。A は 1 としても数える(A5 のホイール)。
      const hmsd = h - m <= 4 || (h === 14 && m <= 5);
      classId = hmsd ? 4 : 5;
    } else if (h >= 9) classId = 6;
    else classId = 7;
  }
  return { classId, connected, key: flopClassKey(classId, connected) };
}

/** ターン / リバーで落ちたカードの分類。番号が若いほど優先。 */
export type StreetCardClass =
  | "quads"
  | "trips"
  | "straightFlush" // ストレートとフラッシュの両方が完成
  | "flushOver"
  | "flush"
  | "straightOver"
  | "straight"
  | "pairTop"
  | "pairLower"
  | "overAce"
  | "overOther"
  | "comboDraw" // フラッシュドローとストレートドローが同時に発生
  | "flushDraw"
  | "straightDraw"
  | "rag";

export type StreetCardGroup = "complete" | "pair" | "over" | "draw" | "rag";

export const STREET_CARD_ORDER: StreetCardClass[] = [
  "quads",
  "trips",
  "straightFlush",
  "flushOver",
  "flush",
  "straightOver",
  "straight",
  "pairTop",
  "pairLower",
  "overAce",
  "overOther",
  "comboDraw",
  "flushDraw",
  "straightDraw",
  "rag",
];

export const STREET_CARD_LABEL: Record<StreetCardClass, string> = {
  quads: "ボードにクワッズ",
  trips: "ボードにトリップス",
  straightFlush: "ストレートとフラッシュが完成",
  flushOver: "フラッシュ完成+オーバーカード",
  flush: "フラッシュ完成",
  straightOver: "ストレート完成+オーバーカード",
  straight: "ストレート完成",
  pairTop: "トップカードとペア",
  pairLower: "ミドル・ボトムとペア",
  overAce: "オーバーカード(A)",
  overOther: "オーバーカード(K以下)",
  comboDraw: "フラッシュドロー+ストレートドロー発生",
  flushDraw: "フラッシュドロー発生",
  straightDraw: "ストレートドロー発生",
  rag: "ラグ",
};

export const STREET_CARD_GROUP: Record<StreetCardClass, StreetCardGroup> = {
  quads: "complete",
  trips: "complete",
  straightFlush: "complete",
  flushOver: "complete",
  flush: "complete",
  straightOver: "complete",
  straight: "complete",
  pairTop: "pair",
  pairLower: "pair",
  overAce: "over",
  overOther: "over",
  comboDraw: "draw",
  flushDraw: "draw",
  straightDraw: "draw",
  rag: "rag",
};

export const STREET_CARD_GROUP_LABEL: Record<StreetCardGroup, string> = {
  complete: "完成系",
  pair: "ペア系",
  over: "オーバーカード",
  draw: "ドロー",
  rag: "ラグ",
};

/** リバーでは使わない分類(ドロー発生)。リバーでこれに当たるカードはラグにする。 */
const DRAW_CLASSES = new Set<StreetCardClass>(["comboDraw", "flushDraw", "straightDraw"]);

/**
 * 直前までのボード(フロップならターン、ターンまでならリバー)に、落ちた1枚(board の最後)が何をしたか。
 * board はターンなら4枚、リバーなら5枚。読めなければ null。
 */
export function classifyStreetCard(board: readonly string[]): StreetCardClass | null {
  if (board.length !== 4 && board.length !== 5) return null;
  const cards = parseAll(board);
  if (!cards) return null;
  const isRiver = board.length === 5;
  const before = cards.slice(0, -1);
  const card = cards[cards.length - 1]!;
  const beforeRanks = before.map((c) => c.rank);
  const afterRanks = cards.map((c) => c.rank);
  const sameRankBefore = beforeRanks.filter((r) => r === card.rank).length;
  const topBefore = Math.max(...beforeRanks);
  const over = card.rank > topBefore;

  if (sameRankBefore >= 3) return "quads";
  if (sameRankBefore === 2) return "trips";

  const suitBefore = before.filter((c) => c.suit === card.suit).length;
  // 同じスートが3枚以上になった(モノトーンに4枚目が落ちたときも、1枚でフラッシュになるので完成に入れる)。
  const flush = suitBefore >= 2;
  const sBefore = straightPairs(beforeRanks);
  const sAfter = straightPairs(afterRanks);
  let straight = false;
  for (const k of sAfter) if (!sBefore.has(k)) straight = true;

  if (flush && straight) return "straightFlush";
  if (flush) return over ? "flushOver" : "flush";
  if (straight) return over ? "straightOver" : "straight";
  if (sameRankBefore === 1) return card.rank === topBefore ? "pairTop" : "pairLower";
  if (over) return card.rank === 14 ? "overAce" : "overOther";
  if (isRiver) return "rag";

  const flushDraw = suitBefore === 1;
  const oBefore = openEnderPairs(beforeRanks);
  const oAfter = openEnderPairs(afterRanks);
  let straightDraw = false;
  for (const k of oAfter) if (!oBefore.has(k)) straightDraw = true;
  if (flushDraw && straightDraw) return "comboDraw";
  if (flushDraw) return "flushDraw";
  if (straightDraw) return "straightDraw";
  return "rag";
}

export function isDrawClass(c: StreetCardClass): boolean {
  return DRAW_CLASSES.has(c);
}
