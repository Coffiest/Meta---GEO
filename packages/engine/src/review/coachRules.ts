import type { Card, Rank } from "../types/card.js";
import { RANKS, SUITS, parseCard } from "../types/card.js";
import { HAND_CATEGORY, compareHandRank, evaluateBest, type HandRank } from "../handEvaluator.js";
import { normalizeCallLikeAggression } from "./normalizeActions.js";
import type { NotionGrade } from "./strategyVerdict.js";

/**
 * 棋譜解析の「コーチのルール」(オーナー指示。該当する局面では必ずこの解説とバッジを出す)。
 *
 *  2.   ポットコミット(プリフロップ・フロップ)         → 無条件で大悪手。コミットとは何か・なぜダメかを解説。
 *  3.   ベットへのコール                               → オッズの式(必要勝率)と推定勝率。足りていれば最善、足りなければ乖離に応じて緩手〜大悪手。
 *                                                      チェックレイズでもよい場面ならそれも言う。
 *  4-1. BMCB(IP。相手の CB のチェックを見てベット)   → BMCB とは何かを解説し、サイズで判定。
 *  4-2. IP のダブル/トリプルバレルが 40% 以下         → 大悪手。ポラライズの解説。
 *  4-3. IP のリバーのシンバリュー                      → 75% 前後が主流だと解説(40% 以下のバレルは 4-2 が優先)。
 *  5-2. OOP のブロックベット(SRP)                    → セミナッツ/ガチナッツを 33〜50% で打てたら絶妙手。打てなければ緩手。
 *  5-3. リバーでベットに直面                           → MDF を示す。相手のナッツ級の代表3つをブロックしてコールしたら絶妙手。
 *  5-4. リバーのブラフレイズ                           → ナッツ級をブロックした A ハイ/ボードとのワンペアでレイズしたら絶妙手。
 *                                                      その候補で降りたら緩手(シンバリューを打たれ放題になる)。
 *
 * 出典: 木原直哉「コミットとは何か」/ ゼロポーカー「ポットコミット」「BMCB」/ ポーカーアカデミー「MDF」/
 *       てっぺー訳 SauloCosta「リバーブラフレイズについての究極のガイド」。
 *
 * 相手の手札は使わない(使うのは手順とボードだけ)。勝率は、相手のアクションから見積もったレンジに対する推定。
 * 席の持ち主によって分岐しない。
 */

export type CoachId =
  | "commit"
  | "oddsCall"
  | "bmcb"
  | "bmcbCheck"
  | "polarize"
  | "thinValue"
  | "blockBet"
  | "blockBetMissed"
  | "riverCatch"
  | "riverRaise"
  | "riverRaiseMissed"
  | "riverMdf"
  | "riverCallNoBlock"
  | "riverFoldBlocker"
  | "riverFoldOk";

export interface CoachVerdict {
  id: CoachId;
  /** バッジ。null なら解説だけ(他の格付けを残す)。 */
  grade: NotionGrade | null;
  street: string;
  /** コールに必要な勝率(0〜1)。 */
  requiredEquity?: number | undefined;
  /** 推定勝率(0〜1)。相手のアクションから見積もったレンジに対して。 */
  equity?: number | undefined;
  /** MDF(0〜1)。 */
  mdf?: number | undefined;
  /** ベット/レイズの額(ポットに対する割合、0〜)。 */
  sizePct?: number | undefined;
  /** コールする額・ポット(bb)。オッズの式に使う。 */
  callBb?: number | undefined;
  potBb?: number | undefined;
  /** コミット: ベット後に残るスタック(bb)と、相手のオールインにコールするのに必要な勝率。 */
  remainingBb?: number | undefined;
  /** 相手のナッツ級の代表(最大3つ)。 */
  nutExamples?: NutExample[] | undefined;
  /** そのうち自分がブロックしているもの(key)。 */
  blocked?: string[] | undefined;
  /** 自分の手(解説用の言葉。例「ミドルペア」「A ハイ」)。 */
  handLabel?: string | undefined;
  /** チェックレイズでもよい場面か(コールの解説に添える)。 */
  checkRaiseOk?: boolean | undefined;
}

export interface NutExample {
  /** 例: "Ah"(フラッシュはカード1枚)/ "98" / "KK" / "Kx"。 */
  key: string;
  /** 役の名前(ストレート・セット…)。 */
  made: string;
  /** ブロックに使うカード(フラッシュ)かランク。 */
  cards: string[];
  ranks: number[];
}

export interface CoachAction {
  sequenceNumber: number;
  seatIndex: number;
  street: string;
  kind: string;
  toAmount: number | null;
  potBefore: number;
}

export interface CoachHand {
  buttonFixedPos: number;
  seatCount: number;
  bigBlind: number;
  board: readonly string[];
  seats: readonly { seatIndex: number; startingStack: number; holeCards: readonly string[] }[];
  actions: readonly CoachAction[];
}

/**
 * ベット後に、相手のオールインへのコールに必要な勝率がこれ以下ならコミット(大悪手)。
 * 分かりやすくコミットしているときだけ言う(オーナー指示: 37%・34% では「すぐコミットと言われて不快」)。
 * 25% = 残りのスタックがポットの半分(SPR 0.5)。ここまで来ると降りるのは明らかに損(出典: cardplayer.com の SPR 解説)。
 */
export const COMMIT_MAX_REQUIRED_EQUITY = 0.25;
/** ポラライズしていない(安すぎる)バレルの上限。 */
export const POLARIZE_MAX_PCT = 0.4;
/** ブロックベットのサイズ(33〜50%。端数の揺れを少し許す)。 */
export const BLOCK_MIN_PCT = 0.25;
export const BLOCK_MAX_PCT = 0.55;

const STREETS = ["preflop", "flop", "turn", "river"] as const;
const AGGRESSIVE = new Set(["bet", "raise", "allIn"]);

interface Replay {
  street: string;
  hero: number;
  kind: string;
  toAmount: number | null;
  potBefore: number;
  heroStreet: number;
  heroRemaining: number;
  facing: number;
  live: number[];
  opponents: { seat: number; street: number; remaining: number }[];
  preflopRaiser: number | null;
  /** そのストリートで各席がした任意のアクション(順に)。 */
  byStreet: Record<string, { seat: number; kind: string }[]>;
}

function replay(hand: CoachHand, seq: number): Replay | null {
  const actions = normalizeCallLikeAggression(hand.actions as CoachAction[]);
  const me = actions.find((a) => a.sequenceNumber === seq);
  if (!me) return null;
  const start = new Map(hand.seats.map((s) => [s.seatIndex, s.startingStack]));
  const dealt = hand.seats.filter((s) => s.holeCards.length === 2 || start.has(s.seatIndex)).map((s) => s.seatIndex);
  const handC = new Map<number, number>();
  let streetC = new Map<number, number>();
  const folded = new Set<number>();
  let street = "preflop";
  let preflopRaiser: number | null = null;
  const byStreet: Record<string, { seat: number; kind: string }[]> = { preflop: [], flop: [], turn: [], river: [] };
  for (const a of actions) {
    if (a.street !== street) {
      for (const [s, v] of streetC) handC.set(s, (handC.get(s) ?? 0) + v);
      streetC = new Map();
      street = a.street;
    }
    if (a.sequenceNumber === seq) break;
    if (a.kind === "postAnte") {
      handC.set(a.seatIndex, (handC.get(a.seatIndex) ?? 0) + (a.toAmount ?? 0));
      continue;
    }
    if (a.kind === "postBlind") {
      streetC.set(a.seatIndex, (streetC.get(a.seatIndex) ?? 0) + (a.toAmount ?? 0));
      continue;
    }
    byStreet[a.street]?.push({ seat: a.seatIndex, kind: a.kind });
    if (a.street === "preflop" && (a.kind === "raise" || a.kind === "allIn")) preflopRaiser = a.seatIndex;
    if (a.kind === "fold") folded.add(a.seatIndex);
    if (a.toAmount !== null) streetC.set(a.seatIndex, a.toAmount);
  }
  const hero = me.seatIndex;
  const remainingOf = (s: number) => (start.get(s) ?? 0) - (handC.get(s) ?? 0) - (streetC.get(s) ?? 0);
  const live = dealt.filter((s) => !folded.has(s));
  let maxOther = 0;
  for (const [s, v] of streetC) if (s !== hero && !folded.has(s)) maxOther = Math.max(maxOther, v);
  const heroStreet = streetC.get(hero) ?? 0;
  return {
    street: me.street,
    hero,
    kind: me.kind,
    toAmount: me.toAmount,
    potBefore: me.potBefore,
    heroStreet,
    heroRemaining: remainingOf(hero),
    facing: Math.max(0, maxOther - heroStreet),
    live,
    opponents: live.filter((s) => s !== hero).map((s) => ({ seat: s, street: streetC.get(s) ?? 0, remaining: remainingOf(s) })),
    preflopRaiser,
    byStreet,
  };
}

/** ポストフロップの行動順(SB が先頭、BTN が最後)。大きいほど後ろ(IP)。 */
function postflopOrder(seat: number, button: number, n: number): number {
  const offset = (((seat - button) % n) + n) % n;
  return (offset + n - 1) % n;
}

function cards(strs: readonly string[]): Card[] {
  const out: Card[] = [];
  for (const s of strs) {
    const c = parseCard(s);
    if (c) out.push(c);
  }
  return out;
}

const key = (c: Card) => `${c.rank}${c.suit}`;
const RANK_CHAR: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T" };
const rankChar = (r: number) => RANK_CHAR[r] ?? String(r);
const SUIT_CHAR: Record<string, string> = { spades: "s", hearts: "h", diamonds: "d", clubs: "c" };
const cardStr = (c: Card) => `${rankChar(c.rank)}${SUIT_CHAR[c.suit]}`;

function deckWithout(used: readonly Card[]): Card[] {
  const u = new Set(used.map(key));
  const out: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) if (!u.has(`${rank}${suit}`)) out.push({ rank, suit });
  return out;
}

const MADE_NAME: Record<number, string> = {
  [HAND_CATEGORY.straightFlush]: "ストレートフラッシュ",
  [HAND_CATEGORY.fourOfAKind]: "クワッズ",
  [HAND_CATEGORY.fullHouse]: "フルハウス",
  [HAND_CATEGORY.flush]: "フラッシュ",
  [HAND_CATEGORY.straight]: "ストレート",
  [HAND_CATEGORY.threeOfAKind]: "スリーカード",
  [HAND_CATEGORY.twoPair]: "ツーペア",
  [HAND_CATEGORY.onePair]: "ワンペア",
  [HAND_CATEGORY.highCard]: "ハイカード",
};

/**
 * ボードに対するナッツ級の代表(強い順に、手の形が違うものを最大3つ)。
 * 例: K♥9♥5♣2♥Q♦ → 「A♥ のフラッシュ」「K♥ のフラッシュ」「QQ のセット」…
 */
export function nutExamples(boardStrs: readonly string[], limit = 3): NutExample[] {
  const board = cards(boardStrs);
  if (board.length < 3) return [];
  const deck = deckWithout(board);
  const combos: { a: Card; b: Card; rank: HandRank }[] = [];
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const a = deck[i]!;
      const b = deck[j]!;
      combos.push({ a, b, rank: evaluateBest([a, b, ...board]) });
    }
  }
  combos.sort((x, y) => compareHandRank(y.rank, x.rank));
  const boardRank = evaluateBest(board);
  const out: NutExample[] = [];
  const seen = new Set<string>();
  for (const c of combos) {
    if (out.length >= limit) break;
    // ボードそのものより強くならない手は「ナッツ級」ではない。
    if (compareHandRank(c.rank, boardRank) <= 0) break;
    const cat = c.rank.category;
    let ex: NutExample;
    if (cat === HAND_CATEGORY.flush || cat === HAND_CATEGORY.straightFlush) {
      const counts = new Map<string, number>();
      for (const x of [c.a, c.b, ...board]) counts.set(x.suit, (counts.get(x.suit) ?? 0) + 1);
      const suit = [...counts.entries()].find(([, n]) => n >= 5)?.[0];
      const inSuit = [c.a, c.b].filter((x) => x.suit === suit).sort((x, y) => y.rank - x.rank);
      const top = inSuit[0] ?? c.a;
      ex = { key: cardStr(top), made: MADE_NAME[cat]!, cards: [cardStr(top)], ranks: [] };
    } else {
      // 片方のカードだけで同じ役になるなら、そのランクだけ(例「Kx」)。
      const onlyA = compareHandRank(evaluateBest([c.a, ...board]), c.rank) === 0;
      const onlyB = compareHandRank(evaluateBest([c.b, ...board]), c.rank) === 0;
      const ranks = onlyA && !onlyB ? [c.a.rank] : onlyB && !onlyA ? [c.b.rank] : [c.a.rank, c.b.rank].sort((x, y) => y - x);
      const label = ranks.length === 1 ? `${rankChar(ranks[0]!)}x` : ranks.map(rankChar).join("");
      const made =
        cat === HAND_CATEGORY.threeOfAKind && ranks.length === 2 && ranks[0] === ranks[1] ? "セット" : MADE_NAME[cat]!;
      ex = { key: label, made, cards: [], ranks };
    }
    if (seen.has(ex.key)) continue;
    seen.add(ex.key);
    out.push(ex);
  }
  return out;
}

/** 自分の2枚が、ナッツ級の代表のどれをブロックしているか。 */
export function blockedExamples(holeStrs: readonly string[], examples: readonly NutExample[]): string[] {
  const hole = cards(holeStrs);
  const holeStrsSet = new Set(hole.map(cardStr));
  const holeRanks = new Set<number>(hole.map((c) => c.rank));
  return examples
    .filter((e) => (e.cards.length > 0 ? e.cards.some((c) => holeStrsSet.has(c)) : e.ranks.some((r) => holeRanks.has(r))))
    .map((e) => e.key);
}

// ───────────────────────── 自分の手の分類 ─────────────────────────

interface MadeInfo {
  rank: HandRank;
  /** ボードのカードとペアになっているワンペア(リバーのブラフレイズの候補)。 */
  boardPair: boolean;
  /** A ハイ(ペア無しで A を持つ)。 */
  aceHigh: boolean;
  /** ミドルペア(ボードの2番目のランクとペア)。 */
  middlePair: boolean;
  /** フラッシュの成立しうるボード(同じスート3枚以上)で、自分はフラッシュではないツーペア。 */
  twoPairOnFlushBoard: boolean;
  /** ガチナッツ(クワッズ以上、または相手の誰よりも強いフラッシュ以上)。 */
  absoluteNuts: boolean;
  label: string;
}

function madeInfo(holeStrs: readonly string[], boardStrs: readonly string[]): MadeInfo | null {
  const hole = cards(holeStrs);
  const board = cards(boardStrs);
  if (hole.length !== 2 || board.length < 3) return null;
  const rank = evaluateBest([...hole, ...board]);
  const boardRanks = [...new Set(board.map((c) => c.rank))].sort((a, b) => b - a);
  const pairRank = rank.category === HAND_CATEGORY.onePair ? rank.ranks[0] : null;
  // 手札の1枚とボードの1枚でできたペア(ポケットペアのオーバーペアや、ボードだけのペアは含まない)。
  const boardPair = pairRank != null && boardRanks.includes(pairRank as Rank) && hole.some((c) => c.rank === pairRank);
  const aceHigh = rank.category === HAND_CATEGORY.highCard && hole.some((c) => c.rank === 14);
  const middlePair = boardPair && boardRanks.length >= 2 && pairRank === boardRanks[1];
  const suitCounts = new Map<string, number>();
  for (const c of board) suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1);
  const flushBoard = [...suitCounts.values()].some((n) => n >= 3);
  const twoPairOnFlushBoard = flushBoard && rank.category === HAND_CATEGORY.twoPair;
  let absoluteNuts = rank.category >= HAND_CATEGORY.fourOfAKind;
  if (!absoluteNuts && rank.category >= HAND_CATEGORY.flush) {
    const deck = deckWithout([...hole, ...board]);
    absoluteNuts = true;
    outer: for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) {
        if (compareHandRank(evaluateBest([deck[i]!, deck[j]!, ...board]), rank) > 0) {
          absoluteNuts = false;
          break outer;
        }
      }
    }
  }
  const topPair = pairRank === boardRanks[0] && boardPair;
  const label = absoluteNuts
    ? `ナッツの${MADE_NAME[rank.category]}`
    : middlePair
      ? "ミドルペア"
      : topPair
        ? "トップペア"
        : boardPair
          ? "ボトムペア"
          : aceHigh
            ? "A ハイ"
            : MADE_NAME[rank.category]!;
  return { rank, boardPair, aceHigh, middlePair, twoPairOnFlushBoard, absoluteNuts, label };
}

// ───────────────────────── 推定勝率(相手のレンジに対して) ─────────────────────────

/** Chen の点数(プリフロップの手の強さの目安)。 */
function chen(a: Card, b: Card): number {
  const hi = Math.max(a.rank, b.rank);
  const lo = Math.min(a.rank, b.rank);
  const base = (r: number) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  let s = base(hi);
  if (hi === lo) return Math.max(5, s * 2);
  if (a.suit === b.suit) s += 2;
  const gap = hi - lo - 1;
  s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 12) s += 1;
  return s;
}

type PreflopRole = "threeBet" | "raise" | "call" | "check";

/** 相手のプリフロップの役割 → 上位何割の手を持っているか(下限・上限)。 */
const PREFLOP_RANGE: Record<PreflopRole, [number, number]> = {
  threeBet: [0, 0.08],
  raise: [0, 0.3],
  call: [0.03, 0.45],
  check: [0, 0.7],
};

function preflopRoleOf(byStreet: Replay["byStreet"], seat: number): PreflopRole {
  const pre = byStreet["preflop"] ?? [];
  let raises = 0;
  let mine: string | null = null;
  for (const a of pre) {
    if (a.kind === "raise" || a.kind === "allIn") raises++;
    if (a.seat === seat) {
      if ((a.kind === "raise" || a.kind === "allIn") && raises >= 2) mine = "threeBet";
      else if (a.kind === "raise" || a.kind === "allIn") mine = mine === "threeBet" ? mine : "raise";
      else if (a.kind === "call" && mine === null) mine = "call";
      else if (a.kind === "check" && mine === null) mine = "check";
    }
  }
  return (mine as PreflopRole | null) ?? "call";
}

function drawOf(hole: Card[], board: Card[]): boolean {
  const all = [...hole, ...board];
  const suits = new Map<string, number>();
  for (const c of all) suits.set(c.suit, (suits.get(c.suit) ?? 0) + 1);
  const fd = [...suits.entries()].some(([s, n]) => n === 4 && hole.some((h) => h.suit === s));
  const vals = new Set<number>();
  for (const c of all) {
    vals.add(c.rank);
    if (c.rank === 14) vals.add(1);
  }
  let oe = false;
  for (let lo = 1; lo <= 11; lo++) {
    let n = 0;
    for (let r = lo; r < lo + 5; r++) if (vals.has(r)) n++;
    if (n >= 4) oe = true;
  }
  return fd || oe;
}

/** 相手のポストフロップのアクション1つが、手の強さごとにどれだけありそうか(重み)。 */
function actionWeight(kind: string, hole: Card[], board: Card[]): number {
  const r = evaluateBest([...hole, ...board]);
  const boardTop = Math.max(...board.map((c) => c.rank));
  const strong = r.category >= HAND_CATEGORY.twoPair;
  const goodPair = r.category === HAND_CATEGORY.onePair && (r.ranks[0] ?? 0) >= boardTop;
  const pair = r.category === HAND_CATEGORY.onePair;
  const draw = drawOf(hole, board);
  if (AGGRESSIVE.has(kind)) return strong ? 1 : goodPair ? 0.9 : pair ? 0.45 : draw ? 0.6 : 0.22;
  if (kind === "call") return strong ? 0.9 : goodPair ? 1 : pair ? 0.75 : draw ? 0.8 : 0.12;
  if (kind === "check") return strong ? 0.45 : 1;
  return 1;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 相手(1人)のレンジに対する推定勝率。レンジ = プリフロップの役割の上位X% × ポストフロップの各アクションの重み。
 * 乱数は手順から決めた種で固定する(同じハンドは何度解析しても同じ数字)。
 */
export function estimateEquityVsRange(params: {
  hole: readonly string[];
  board: readonly string[];
  role: PreflopRole;
  /** ストリートごとの相手のアクション(そのストリートのボードで重みを付ける)。 */
  history: { street: string; kind: string }[];
  fullBoard: readonly string[];
  samples?: number;
  seed?: number;
}): number | null {
  const hole = cards(params.hole);
  const board = cards(params.board);
  if (hole.length !== 2) return null;
  const deck = deckWithout([...hole, ...board]);
  const [lo, hi] = PREFLOP_RANGE[params.role];
  const all: { a: Card; b: Card; s: number }[] = [];
  for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) all.push({ a: deck[i]!, b: deck[j]!, s: chen(deck[i]!, deck[j]!) });
  all.sort((x, y) => y.s - x.s);
  const from = Math.floor(all.length * lo);
  const to = Math.max(from + 1, Math.ceil(all.length * hi));
  const fullBoard = cards(params.fullBoard);
  const boardAt = (street: string) =>
    fullBoard.slice(0, street === "flop" ? 3 : street === "turn" ? 4 : street === "river" ? 5 : 0);
  const range: { a: Card; b: Card; w: number }[] = [];
  for (const c of all.slice(from, to)) {
    let w = 1;
    for (const h of params.history) {
      const b = boardAt(h.street);
      if (b.length < 3) continue;
      w *= actionWeight(h.kind, [c.a, c.b], b);
    }
    if (w > 0) range.push({ a: c.a, b: c.b, w });
  }
  const total = range.reduce((s, c) => s + c.w, 0);
  if (total <= 0) return null;
  const cum: number[] = [];
  let acc = 0;
  for (const c of range) cum.push((acc += c.w));
  const rand = mulberry(params.seed ?? 1);
  const samples = params.samples ?? (board.length === 5 ? 1200 : 900);
  let win = 0;
  for (let n = 0; n < samples; n++) {
    const x = rand() * total;
    let lo2 = 0;
    let hi2 = cum.length - 1;
    while (lo2 < hi2) {
      const mid = (lo2 + hi2) >> 1;
      if (cum[mid]! < x) lo2 = mid + 1;
      else hi2 = mid;
    }
    const opp = range[lo2]!;
    const runout = [...board];
    if (runout.length < 5) {
      const used = new Set([...hole, ...board, opp.a, opp.b].map(key));
      const rest = deck.filter((c) => !used.has(key(c)));
      while (runout.length < 5) {
        const i = Math.floor(rand() * rest.length);
        runout.push(rest[i]!);
        rest.splice(i, 1);
      }
    }
    const cmp = compareHandRank(evaluateBest([...hole, ...runout]), evaluateBest([opp.a, opp.b, ...runout]));
    win += cmp > 0 ? 1 : cmp === 0 ? 0.5 : 0;
  }
  return win / samples;
}

// ───────────────────────── ルール ─────────────────────────

function boardOf(hand: CoachHand, street: string): string[] {
  const n = street === "flop" ? 3 : street === "turn" ? 4 : street === "river" ? 5 : 0;
  return hand.board.slice(0, n);
}

function heroBetOn(byStreet: Replay["byStreet"], street: string, hero: number): boolean {
  return (byStreet[street] ?? []).some((a) => a.seat === hero && AGGRESSIVE.has(a.kind));
}

/** 1つの決定に当てはまるコーチのルール(当てはまらなければ null)。 */
export function judgeCoach(hand: CoachHand, sequenceNumber: number): CoachVerdict | null {
  const r = replay(hand, sequenceNumber);
  if (!r) return null;
  const bb = hand.bigBlind > 0 ? hand.bigBlind : 1;
  const hero = hand.seats.find((s) => s.seatIndex === r.hero);
  if (!hero) return null;
  const street = r.street;
  const kind = r.kind;
  const isRaiseLike = kind === "bet" || kind === "raise";
  const heroAdd = r.toAmount !== null ? r.toAmount - r.heroStreet : 0;
  const sizePct = r.potBefore > 0 && heroAdd > 0 ? (heroAdd - r.facing) / (r.potBefore + r.facing) : 0;

  // 2. ポットコミット(プリフロップ・フロップのオールインではないベット/レイズ)。
  if ((street === "preflop" || street === "flop") && isRaiseLike && r.toAmount !== null) {
    const e = r.heroRemaining - heroAdd;
    if (e > 0) {
      const pAfter = r.potBefore + heroAdd;
      let worst: { required: number; eff: number } | null = null;
      for (const o of r.opponents) {
        const match = Math.min(Math.max(0, r.toAmount - o.street), o.remaining);
        const after = o.remaining - match;
        if (after <= 0) continue;
        const eff = Math.min(e, after);
        const required = eff / (pAfter + match + 2 * eff);
        if (!worst || eff > worst.eff) worst = { required, eff };
      }
      if (worst && worst.required <= COMMIT_MAX_REQUIRED_EQUITY) {
        return {
          id: "commit",
          grade: "blunder",
          street,
          requiredEquity: worst.required,
          remainingBb: e / bb,
          potBb: pAfter / bb,
        };
      }
    }
  }

  if (street === "preflop") return null;
  // ここから下は、ヘッズアップのポストフロップだけ。
  if (r.opponents.length !== 1) return null;
  const opp = r.opponents[0]!;
  const ip = postflopOrder(r.hero, hand.buttonFixedPos, hand.seatCount) > postflopOrder(opp.seat, hand.buttonFixedPos, hand.seatCount);
  const board = boardOf(hand, street);
  const made = madeInfo(hero.holeCards, board);
  const streetActs = r.byStreet[street] ?? [];
  const firstToAct = streetActs.length === 0;

  // 4-2. IP のダブル/トリプルバレルが 40% 以下 → 大悪手(ポラライズ)。
  if (ip && kind === "bet" && sizePct > 0 && sizePct <= POLARIZE_MAX_PCT) {
    const doubleBarrel = street === "turn" && heroBetOn(r.byStreet, "flop", r.hero);
    const tripleBarrel = street === "river" && heroBetOn(r.byStreet, "flop", r.hero) && heroBetOn(r.byStreet, "turn", r.hero);
    if (doubleBarrel || tripleBarrel) return { id: "polarize", grade: "blunder", street, sizePct };
  }

  // 5-3 / 5-4. リバーでベットに直面。
  if (street === "river" && r.facing > 0 && made) {
    const p0 = r.potBefore - r.facing;
    const mdf = p0 > 0 ? p0 / (p0 + r.facing) : 0;
    const examples = nutExamples(hand.board.slice(0, 5));
    const blocked = blockedExamples(hero.holeCards, examples);
    const candidate = (made.aceHigh || made.boardPair) && blocked.length > 0;
    const base = { street, mdf, nutExamples: examples, blocked, handLabel: made.label };
    // リバーはオッズではなく MDF とブロッカーで考える(オーナー指示)。
    if (kind === "call" && blocked.length > 0) return { id: "riverCatch", grade: "artistic", ...base };
    // ナッツ級を1つも抑えていないコールは、守る順番が後ろの手 → 降りる候補(緩手)。
    if (kind === "call") return { id: "riverCallNoBlock", grade: "inaccuracy", ...base };
    if ((kind === "raise" || kind === "allIn") && candidate) return { id: "riverRaise", grade: "artistic", ...base };
    if (kind === "fold" && candidate) return { id: "riverRaiseMissed", grade: "inaccuracy", ...base };
    // ナッツ級を抑えているのに降りた → コールで守る候補だった(緩手)。抑えていなければ降りてよい。
    if (kind === "fold" && blocked.length > 0) return { id: "riverFoldBlocker", grade: "inaccuracy", ...base };
    if (kind === "fold") return { id: "riverFoldOk", grade: null, ...base };
    return { id: "riverMdf", grade: null, ...base };
  }

  // 3. ベットへのコール: オッズの式と推定勝率。
  if (kind === "call" && r.facing > 0) {
    const required = r.facing / (r.potBefore + r.facing);
    const history: { street: string; kind: string }[] = [];
    for (const s of STREETS) {
      if (s === "preflop") continue;
      for (const a of r.byStreet[s] ?? []) if (a.seat === opp.seat) history.push({ street: s, kind: a.kind });
      if (s === street) break;
    }
    const equity = estimateEquityVsRange({
      hole: hero.holeCards,
      board,
      role: preflopRoleOf(r.byStreet, opp.seat),
      history,
      fullBoard: hand.board,
      seed: sequenceNumber * 7919 + r.hero,
    });
    if (equity === null) return null;
    const gap = required - equity;
    const grade: NotionGrade = gap <= 0 ? "best" : gap < 0.05 ? "inaccuracy" : gap < 0.15 ? "mistake" : "blunder";
    const heroCheckedFirst = streetActs.some((a) => a.seat === r.hero && a.kind === "check");
    const p0 = r.potBefore - r.facing;
    return {
      id: "oddsCall",
      grade,
      street,
      requiredEquity: required,
      equity,
      callBb: r.facing / bb,
      potBb: r.potBefore / bb,
      mdf: street === "river" && p0 > 0 ? p0 / (p0 + r.facing) : undefined,
      handLabel: made?.label,
      checkRaiseOk: !ip && heroCheckedFirst && equity >= 0.65,
    };
  }

  // 4-1. BMCB: IP のコーラーが、プリフロップのレイザーのフロップのチェックを見てベット。
  if (
    street === "flop" &&
    ip &&
    r.preflopRaiser === opp.seat &&
    streetActs.length === 1 &&
    streetActs[0]!.seat === opp.seat &&
    streetActs[0]!.kind === "check"
  ) {
    if (kind === "bet") {
      const grade: NotionGrade = sizePct <= 0.5 ? "best" : sizePct <= 0.8 ? "excellent" : "inaccuracy";
      return { id: "bmcb", grade, street, sizePct };
    }
    if (kind === "check") return { id: "bmcbCheck", grade: null, street };
  }

  // 4-3. IP のリバーのシンバリュー(ワンペアでのベット)。
  if (street === "river" && ip && kind === "bet" && made?.rank.category === HAND_CATEGORY.onePair) {
    return { id: "thinValue", grade: null, street, sizePct, handLabel: made.label };
  }

  // 5-2. OOP のブロックベット(SRP)。セミナッツ(ミドルペア・フラッシュボードのツーペア)とガチナッツ。
  const raises = (r.byStreet["preflop"] ?? []).filter((a) => a.kind === "raise" || a.kind === "allIn").length;
  if (!ip && firstToAct && raises === 1 && made && (made.middlePair || made.twoPairOnFlushBoard || made.absoluteNuts)) {
    if (kind === "bet" && sizePct >= BLOCK_MIN_PCT && sizePct <= BLOCK_MAX_PCT) {
      return { id: "blockBet", grade: "artistic", street, sizePct, handLabel: made.label };
    }
    const semiBig = kind === "bet" && sizePct > BLOCK_MAX_PCT && !made.absoluteNuts;
    if ((street === "turn" || street === "river") && (kind === "check" || semiBig)) {
      return { id: "blockBetMissed", grade: "inaccuracy", street, sizePct: kind === "bet" ? sizePct : undefined, handLabel: made.label };
    }
  }

  return null;
}
