import { readBoardTexture, type BoardTexture, type DrawDensity, type RankBand, type SuitPattern } from "./boardTexture.js";
import { readHandStrength, type HandStrength, type KickerBand, type MadeCategory } from "./handStrength.js";
import { readPotShape, type PotType } from "./potShape.js";
import type { BetRole } from "./betRole.js";
import type { BoardChange } from "./strategyVerdict.js";

/**
 * 解説の知識ベース(`packages/engine/knowledge/*.md`)から書き起こした「解説ルール」と、その当てはめ。
 *
 * 知識は Markdown に溜める。記事を読んで得た内容(要点)をそのまま書き、そのうち解説に使える
 * ものを ```json rule のブロックとして同じファイルに置く。ブロックが1つのルールで、
 *  - いつ出すか(`when`)
 *  - 何を言うか(`summary` = 常時出る1〜2文 / `body` = 「詳しく見る」で開く本文)
 *  - バッジを付けるか(`grade`)
 * を持つ。Markdown → `articleRules.generated.ts` の変換は `scripts/build-knowledge.ts`
 * (`pnpm --filter @meta-geo/engine run knowledge`)。生成物が Markdown と食い違っていれば
 * テスト(`test/articleRules.test.ts`)が落ちる。
 *
 * ここは純関数だけ。サーバー(`packages/db/src/reviewArticles.ts`)が決定ごとに
 * `readArticleFacts` で状況を読み、`matchArticleRule` で1つ選んで決定に載せる。
 * 画面は載った id から同じ生成物を引いて文章を出す。
 *
 * **席の持ち主が誰であっても、同じ経路・同じ形で判定する。**
 */

export type ArticleStreet = "preflop" | "flop" | "turn" | "river";

/** プリフロップで hero が決定する時点で直面している状況。 */
export type PreflopSpotKind = "unopened" | "vsLimp" | "vsOpen" | "vs3bet" | "vs4bet";

/**
 * トーナメントの段階(ICM の圧力の目安)。
 *  - early: 入賞まで4人以上
 *  - nearBubble: 入賞まであと2〜3人
 *  - bubble: あと1人で入賞
 *  - itm: 入賞圏(最終卓より前)
 *  - finalTable: MTT の最終卓(9人以下)
 */
export type IcmStage = "early" | "nearBubble" | "bubble" | "itm" | "finalTable";

export const ARTICLE_GRADES = ["best", "excellent", "good", "book", "inaccuracy", "mistake", "blunder"] as const;
export type ArticleGrade = (typeof ARTICLE_GRADES)[number];

export interface ArticleRange {
  /** この値以上(境界を含む)。 */
  min?: number;
  /** この値未満(境界を含まない)。 */
  max?: number;
}

/** ルールの条件。書いた項目だけを判定する(全て AND、配列は「どれか」)。 */
export interface ArticleWhen {
  street?: ArticleStreet[];
  heroPos?: string[];
  /** hero が実際に取った手(棋譜解析のバケット)。 */
  action?: string[];
  facingBet?: boolean;
  effStackBb?: ArticleRange;
  facingSizeBb?: ArticleRange;
  /** 直面しているベット ÷ そのベット前のポット(%)。 */
  facingPotPct?: ArticleRange;
  /** 有効スタック ÷ ポット。 */
  spr?: ArticleRange;
  preflopSpot?: PreflopSpotKind[];
  /** プリフロップで、自分がまだ自発的に動いていない(ブラインド以外にチップを入れていない)。「コールド」の判定。 */
  heroFirstAction?: boolean;
  potType?: PotType[];
  blindVsBlind?: boolean;
  heroPreflopAggressor?: boolean;
  inPosition?: boolean;
  multiway?: boolean;
  heroCovers?: boolean;
  icmStage?: IcmStage[];
  /** hero の手札(レンジ表記: "AA" / "QQ+" / "AKs" / "A5s-A2s" / "T9s" / "KQo")。 */
  heroHand?: string[];
  role?: BetRole[];
  /** 以下のボード条件は、決定の時点で見えているボードで判定する。ただし boardSuit / boardShape はフロップ3枚で判定する。 */
  boardShape?: string[];
  boardHighBand?: RankBand[];
  boardSuit?: SuitPattern[];
  boardFlushPossible?: boolean;
  boardDraws?: DrawDensity[];
  boardPaired?: boolean;
  boardPairBand?: RankBand[];
  boardBroadwayCount?: ArticleRange;
  boardHmGap?: ArticleRange;
  boardChange?: BoardChange[];
  made?: MadeCategory[];
  kicker?: Exclude<KickerBand, null>[];
  anyDraw?: (keyof HandStrength["draws"])[];
}

export interface ArticleRule {
  id: string;
  /** 記事(知識ベースの見出し)。 */
  article: string;
  sourceUrl: string | null;
  title: string;
  /** 常時出る1〜2文(バリィの口調)。 */
  summary: string;
  /** 「詳しく見る」で開く本文。 */
  body: string;
  /** バッジ。null なら解説だけを添える。 */
  grade: ArticleGrade | null;
  /** true なら、GTO の格付けがある決定ではバッジを置き換えない(解説だけ添える)。 */
  keepGto: boolean;
  priority: number;
  when: ArticleWhen;
}

// ───────────────────────────── Markdown の読み込み ─────────────────────────────

const WHEN_KEYS: Record<keyof ArticleWhen, "list" | "bool" | "range"> = {
  street: "list",
  heroPos: "list",
  action: "list",
  facingBet: "bool",
  effStackBb: "range",
  facingSizeBb: "range",
  facingPotPct: "range",
  spr: "range",
  preflopSpot: "list",
  heroFirstAction: "bool",
  potType: "list",
  blindVsBlind: "bool",
  heroPreflopAggressor: "bool",
  inPosition: "bool",
  multiway: "bool",
  heroCovers: "bool",
  icmStage: "list",
  heroHand: "list",
  role: "list",
  boardShape: "list",
  boardHighBand: "list",
  boardSuit: "list",
  boardFlushPossible: "bool",
  boardDraws: "list",
  boardPaired: "bool",
  boardPairBand: "list",
  boardBroadwayCount: "range",
  boardHmGap: "range",
  boardChange: "list",
  made: "list",
  kicker: "list",
  anyDraw: "list",
};

/** 語彙が決まっている条件の、取りうる値。書き間違えると実データで一度も当たらなくなるので、読み込み時に弾く。 */
export const ARTICLE_VOCAB: Partial<Record<keyof ArticleWhen, readonly string[]>> = {
  street: ["preflop", "flop", "turn", "river"],
  heroPos: ["UTG", "HJ", "CO", "BTN", "SB", "BB"],
  action: [
    "fold",
    "call",
    "raise2-5",
    "raise5+",
    "allIn",
    "checkOrCall",
    "bet20-40",
    "bet40-60",
    "bet60-80",
    "bet80-100",
    "bet100+",
  ],
  preflopSpot: ["unopened", "vsLimp", "vsOpen", "vs3bet", "vs4bet"],
  potType: ["limped", "srp", "threeBet", "fourBetPlus"],
  icmStage: ["early", "nearBubble", "bubble", "itm", "finalTable"],
  role: ["checkRaise", "probe", "donk", "delayedCbet", "cbet", "turnBarrel", "riverBarrel", "otherBet"],
  boardHighBand: ["L", "M", "H"],
  boardSuit: ["monotone", "twotone", "rainbow"],
  boardDraws: ["dry", "normal", "drawHeavy"],
  boardPairBand: ["L", "M", "H"],
  boardChange: ["flushCompleted", "paired", "straightMove", "overcard", "blank"],
  made: [
    "straightFlush",
    "quads",
    "fullHouse",
    "flush",
    "straight",
    "trips",
    "twoPair",
    "overPair",
    "topPair",
    "middlePair",
    "bottomPair",
    "pocketPairBelow",
    "highCard",
  ],
  kicker: ["top", "good", "low"],
  anyDraw: ["flushDraw", "nutFlushDraw", "backdoorFlushDraw", "openEnded", "gutshot", "twoOverCards"],
};

const PREFLOP_ACTIONS = new Set(["fold", "call", "raise2-5", "raise5+", "allIn"]);
const POSTFLOP_ACTIONS = new Set(["fold", "checkOrCall", "bet20-40", "bet40-60", "bet60-80", "bet80-100", "bet100+", "allIn"]);

export class KnowledgeFormatError extends Error {}

/** ルールの JSON を検証して ArticleRule にする。誤りは場所が分かる文言で投げる。 */
export function validateArticleRule(raw: unknown, article: string, sourceUrl: string | null): ArticleRule {
  const fail = (msg: string): never => {
    throw new KnowledgeFormatError(`[${article}] ${msg}`);
  };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail("ルールはオブジェクトで書く");
  const r = raw as Record<string, unknown>;
  const id = r.id;
  if (typeof id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail(`id は kebab-case の文字列: ${String(id)}`);
  for (const k of ["title", "summary", "body"] as const) {
    if (typeof r[k] !== "string" || (r[k] as string).trim() === "") fail(`${String(id)}: ${k} が空`);
  }
  const allowed = new Set(["id", "title", "summary", "body", "grade", "keepGto", "priority", "when"]);
  for (const k of Object.keys(r)) if (!allowed.has(k)) fail(`${String(id)}: 未知の項目 ${k}`);

  const grade = r.grade ?? null;
  if (grade !== null && !(ARTICLE_GRADES as readonly string[]).includes(grade as string)) fail(`${String(id)}: grade が不正 ${String(grade)}`);
  const priority = r.priority ?? 0;
  if (typeof priority !== "number") fail(`${String(id)}: priority は数値`);
  const keepGto = r.keepGto ?? false;
  if (typeof keepGto !== "boolean") fail(`${String(id)}: keepGto は真偽値`);

  const whenRaw = r.when ?? {};
  if (typeof whenRaw !== "object" || whenRaw === null || Array.isArray(whenRaw)) fail(`${String(id)}: when はオブジェクト`);
  const when = whenRaw as Record<string, unknown>;
  for (const [k, v] of Object.entries(when)) {
    const kind = WHEN_KEYS[k as keyof ArticleWhen];
    if (!kind) fail(`${String(id)}: 未知の条件 ${k}`);
    if (kind === "bool" && typeof v !== "boolean") fail(`${String(id)}: ${k} は真偽値`);
    if (kind === "range") {
      if (typeof v !== "object" || v === null || Array.isArray(v)) fail(`${String(id)}: ${k} は {min,max}`);
      for (const [rk, rv] of Object.entries(v as Record<string, unknown>)) {
        if ((rk !== "min" && rk !== "max") || typeof rv !== "number") fail(`${String(id)}: ${k}.${rk} が不正`);
      }
    }
    if (kind === "list") {
      if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== "string")) fail(`${String(id)}: ${k} は文字列の配列`);
      const vocab = ARTICLE_VOCAB[k as keyof ArticleWhen];
      for (const x of v as string[]) {
        if (vocab && !vocab.includes(x)) fail(`${String(id)}: ${k} に未知の値 ${x}`);
        if (k === "heroHand" && parseHandRange(x) === null) fail(`${String(id)}: heroHand を読めない ${x}`);
      }
    }
  }

  // ストリートとアクションの語彙が噛み合っているか(プリフロップに checkOrCall を書く等は一度も当たらない)。
  const streets = (when.street as string[] | undefined) ?? [];
  const actions = (when.action as string[] | undefined) ?? [];
  for (const a of actions) {
    const okPre = streets.length === 0 || streets.includes("preflop") ? PREFLOP_ACTIONS.has(a) : false;
    const okPost = streets.length === 0 || streets.some((s) => s !== "preflop") ? POSTFLOP_ACTIONS.has(a) : false;
    if (!okPre && !okPost) fail(`${String(id)}: action ${a} はそのストリートに無い`);
  }
  // バッジを付けるなら、hero が何をしたかを必ず条件にする(手を問わずに良し悪しは言えない)。
  if (grade !== null && actions.length === 0) fail(`${String(id)}: grade を付けるルールは when.action が必須`);

  return {
    id: id as string,
    article,
    sourceUrl,
    title: (r.title as string).trim(),
    summary: (r.summary as string).trim(),
    body: (r.body as string).trim(),
    grade: grade as ArticleGrade | null,
    keepGto: keepGto as boolean,
    priority: priority as number,
    when: when as ArticleWhen,
  };
}

/**
 * 知識ベースの Markdown からルールを取り出す。
 *
 *  - `## 見出し` が記事の区切り。その直後の `出典: <URL>` が以降のルールの出典になる。
 *  - ```json rule で始まるブロックが1つのルール。それ以外の本文・コードブロックは知識のメモとして読み飛ばす。
 */
export function parseKnowledgeMarkdown(md: string): ArticleRule[] {
  const rules: ArticleRule[] = [];
  const lines = md.split(/\r?\n/);
  let article = "";
  let sourceUrl: string | null = null;
  let inRule = false;
  let inOtherFence = false;
  let buf: string[] = [];
  let startLine = 0;
  lines.forEach((line, i) => {
    if (inRule) {
      if (/^```\s*$/.test(line)) {
        let raw: unknown;
        try {
          raw = JSON.parse(buf.join("\n"));
        } catch (e) {
          throw new KnowledgeFormatError(`[${article}] ${startLine + 1}行目のルールが JSON として読めない: ${(e as Error).message}`);
        }
        rules.push(validateArticleRule(raw, article, sourceUrl));
        inRule = false;
        buf = [];
      } else buf.push(line);
      return;
    }
    if (inOtherFence) {
      if (/^```\s*$/.test(line)) inOtherFence = false;
      return;
    }
    if (/^```json\s+rule\s*$/.test(line)) {
      inRule = true;
      startLine = i;
      return;
    }
    if (/^```/.test(line)) {
      inOtherFence = true;
      return;
    }
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h && !line.startsWith("###")) {
      article = h[1]!;
      sourceUrl = null;
      return;
    }
    const src = /^出典:\s*(\S+)/.exec(line);
    if (src) sourceUrl = src[1]!;
  });
  if (inRule) throw new KnowledgeFormatError(`[${article}] ${startLine + 1}行目のルールが閉じていない`);
  const seen = new Set<string>();
  for (const r of rules) {
    if (seen.has(r.id)) throw new KnowledgeFormatError(`id が重複: ${r.id}`);
    seen.add(r.id);
  }
  return rules;
}

// ───────────────────────────── 手札のレンジ表記 ─────────────────────────────

const RANKS = "23456789TJQKA";
const rankOf = (c: string): number => RANKS.indexOf(c.toUpperCase());

interface HandKey {
  hi: number;
  lo: number;
  /** "s" スーテッド / "o" オフスート / "p" ポケットペア */
  kind: "s" | "o" | "p";
}

/** 手札2枚を "AKs" のような種類に直す。読めなければ null。 */
export function handKeyOf(holeCards: readonly (string | null)[]): HandKey | null {
  const [a, b] = holeCards;
  if (!a || !b || a.length < 2 || b.length < 2) return null;
  const ra = rankOf(a[0]!);
  const rb = rankOf(b[0]!);
  if (ra < 0 || rb < 0) return null;
  if (ra === rb) return { hi: ra, lo: rb, kind: "p" };
  const suited = a[1]!.toLowerCase() === b[1]!.toLowerCase();
  return { hi: Math.max(ra, rb), lo: Math.min(ra, rb), kind: suited ? "s" : "o" };
}

/**
 * レンジ表記1つを、手札の種類を判定する関数にする。
 *  "AA" / "QQ+" / "77-55" / "AKs" / "AKo" / "AK"(両方) / "ATs+" / "A5s-A2s" / "KQo+"
 */
export function parseHandRange(token: string): ((h: HandKey) => boolean) | null {
  const t = token.trim();
  let m = /^([2-9TJQKA])\1(\+)?$/i.exec(t);
  if (m) {
    const r = rankOf(m[1]!);
    return (h) => h.kind === "p" && (m![2] ? h.hi >= r : h.hi === r);
  }
  m = /^([2-9TJQKA])\1-([2-9TJQKA])\2$/i.exec(t);
  if (m) {
    const a = rankOf(m[1]!);
    const b = rankOf(m[2]!);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return (h) => h.kind === "p" && h.hi >= lo && h.hi <= hi;
  }
  m = /^([2-9TJQKA])([2-9TJQKA])([so])?(\+)?$/i.exec(t);
  if (m && m[1]!.toUpperCase() !== m[2]!.toUpperCase()) {
    const hi = Math.max(rankOf(m[1]!), rankOf(m[2]!));
    const lo = Math.min(rankOf(m[1]!), rankOf(m[2]!));
    const kind = m[3]?.toLowerCase() as "s" | "o" | undefined;
    const plus = Boolean(m[4]);
    return (h) =>
      h.kind !== "p" && (!kind || h.kind === kind) && h.hi === hi && (plus ? h.lo >= lo && h.lo < hi : h.lo === lo);
  }
  m = /^([2-9TJQKA])([2-9TJQKA])([so])?-([2-9TJQKA])([2-9TJQKA])\3?$/i.exec(t);
  if (m && m[1]!.toUpperCase() === m[4]!.toUpperCase()) {
    const hi = rankOf(m[1]!);
    const a = rankOf(m[2]!);
    const b = rankOf(m[5]!);
    const kind = m[3]?.toLowerCase() as "s" | "o" | undefined;
    return (h) => h.kind !== "p" && (!kind || h.kind === kind) && h.hi === hi && h.lo >= Math.min(a, b) && h.lo <= Math.max(a, b);
  }
  return null;
}

export function handInRange(holeCards: readonly (string | null)[], tokens: readonly string[]): boolean {
  const key = handKeyOf(holeCards);
  if (!key) return false;
  return tokens.some((t) => parseHandRange(t)?.(key) ?? false);
}

// ───────────────────────────── 決定ごとの状況 ─────────────────────────────

export interface ArticleFacts {
  street: string;
  heroPos: string;
  action: string;
  facingBet: boolean;
  effStackBb: number;
  facingSizeBb: number | null;
  facingPotPct: number | null;
  spr: number | null;
  preflopSpot: PreflopSpotKind | null;
  /** プリフロップの決定で、自分がまだ自発的に動いていないか。ポストフロップは null。 */
  heroFirstAction: boolean | null;
  potType: PotType;
  blindVsBlind: boolean;
  heroPreflopAggressor: boolean;
  /** ポストフロップで hero が最後に行動するか。プリフロップは null。 */
  inPosition: boolean | null;
  multiway: boolean;
  heroCovers: boolean;
  icmStage: IcmStage | null;
  holeCards: readonly string[];
  /** 決定の時点で見えているボード。 */
  texture: BoardTexture | null;
  /** フロップ3枚(boardSuit / boardShape 用)。 */
  flop: BoardTexture | null;
  hand: HandStrength | null;
  role: BetRole | null;
  boardChange: BoardChange | null;
}

export interface ArticleHandInput {
  buttonFixedPos: number;
  seatCount: number;
  board: readonly string[];
  seats: readonly { seatIndex: number; startingStack: number; holeCards: readonly string[] }[];
  actions: readonly { sequenceNumber: number; seatIndex: number; street: string; kind: string }[];
  /** トーナメントの段階。分からなければ null(icmStage を条件にしたルールは当たらない)。 */
  icmStage: IcmStage | null;
}

export interface ArticleDecisionInput {
  sequenceNumber: number;
  street: string;
  seatIndex: number;
  heroPos: string;
  effStackBb: number;
  potBb: number;
  facingSizeBb: number | null;
  bucket: string;
  role: BetRole | null;
  boardChange: BoardChange | null;
}

const BOARD_CARDS_BY_STREET: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

function isForcedPost(kind: string): boolean {
  return kind === "postBlind" || kind === "postAnte";
}
function isAggression(kind: string): boolean {
  return kind === "raise" || kind === "bet" || kind === "allIn";
}

/** ポストフロップの行動順(SB が最初、BTN が最後)。大きいほど後。 */
function postflopOrder(seatIndex: number, buttonFixedPos: number, seatCount: number): number {
  const offset = (((seatIndex - buttonFixedPos) % seatCount) + seatCount) % seatCount;
  return offset === 0 ? seatCount : offset;
}

/**
 * トーナメントの残り人数から段階を出す。
 * @param gameType "sng" | "mtt"
 */
export function icmStageOf(params: {
  playersRemaining: number | null;
  itmPlaces: number | null;
  gameType: string | null;
}): IcmStage | null {
  const { playersRemaining, itmPlaces, gameType } = params;
  if (playersRemaining === null || itmPlaces === null || itmPlaces <= 0) return null;
  const distance = playersRemaining - itmPlaces;
  if (distance <= 0) return gameType === "mtt" && playersRemaining <= 9 ? "finalTable" : "itm";
  if (gameType === "mtt" && playersRemaining <= 9) return distance === 1 ? "bubble" : "finalTable";
  if (distance === 1) return "bubble";
  if (distance <= 3) return "nearBubble";
  return "early";
}

/** 1つの決定について、ルールの条件判定に使う状況を読む。 */
export function readArticleFacts(hand: ArticleHandInput, d: ArticleDecisionInput): ArticleFacts {
  const before = hand.actions.filter((a) => a.sequenceNumber < d.sequenceNumber);
  const preflopVoluntary = hand.actions.filter((a) => a.street === "preflop" && !isForcedPost(a.kind));

  // プリフロップで直面している状況。
  let preflopSpot: PreflopSpotKind | null = null;
  let heroFirstAction: boolean | null = null;
  if (d.street === "preflop") {
    const prior = before.filter((a) => a.street === "preflop" && !isForcedPost(a.kind));
    heroFirstAction = !prior.some((a) => a.seatIndex === d.seatIndex);
    const raises = prior.filter((a) => isAggression(a.kind)).length;
    const calls = prior.filter((a) => a.kind === "call").length;
    preflopSpot =
      raises === 0 ? (calls > 0 ? "vsLimp" : "unopened") : raises === 1 ? "vsOpen" : raises === 2 ? "vs3bet" : "vs4bet";
  }

  // プリフロップ最後のレイザー(決定がプリフロップなら、その時点まで)。
  const pfSource = d.street === "preflop" ? before.filter((a) => a.street === "preflop" && !isForcedPost(a.kind)) : preflopVoluntary;
  let lastRaiser: number | null = null;
  for (const a of pfSource) if (isAggression(a.kind)) lastRaiser = a.seatIndex;

  const folded = new Set(before.filter((a) => a.kind === "fold").map((a) => a.seatIndex));
  const dealt = hand.seats.filter((s) => s.holeCards.length > 0 || s.startingStack > 0);
  const live = dealt.filter((s) => !folded.has(s.seatIndex));

  let inPosition: boolean | null = null;
  if (d.street !== "preflop") {
    const mine = postflopOrder(d.seatIndex, hand.buttonFixedPos, hand.seatCount);
    inPosition = live.every((s) => s.seatIndex === d.seatIndex || postflopOrder(s.seatIndex, hand.buttonFixedPos, hand.seatCount) < mine);
  }

  const heroStack = hand.seats.find((s) => s.seatIndex === d.seatIndex)?.startingStack ?? 0;
  const heroCovers = live.every((s) => s.seatIndex === d.seatIndex || s.startingStack <= heroStack);

  const shape = readPotShape(hand.actions, { buttonFixedPos: hand.buttonFixedPos, seatCount: hand.seatCount });

  const n = BOARD_CARDS_BY_STREET[d.street] ?? hand.board.length;
  const board = hand.board.slice(0, n);
  const hole = hand.seats.find((s) => s.seatIndex === d.seatIndex)?.holeCards ?? [];
  const facing = d.facingSizeBb !== null && d.facingSizeBb > 0 ? d.facingSizeBb : null;
  const potBeforeBet = facing !== null ? d.potBb - facing : null;

  return {
    street: d.street,
    heroPos: d.heroPos,
    action: d.bucket,
    facingBet: facing !== null,
    effStackBb: d.effStackBb,
    facingSizeBb: facing,
    facingPotPct: facing !== null && potBeforeBet !== null && potBeforeBet > 0 ? (facing / potBeforeBet) * 100 : null,
    spr: d.potBb > 0 ? d.effStackBb / d.potBb : null,
    preflopSpot,
    heroFirstAction,
    potType: shape.type,
    blindVsBlind: shape.isBlindVsBlind,
    heroPreflopAggressor: lastRaiser === d.seatIndex,
    inPosition,
    multiway: d.street !== "preflop" && live.length >= 3,
    heroCovers,
    icmStage: hand.icmStage,
    holeCards: hole,
    texture: board.length >= 3 ? readBoardTexture(board) : null,
    flop: hand.board.length >= 3 && d.street !== "preflop" ? readBoardTexture(hand.board.slice(0, 3)) : null,
    hand: board.length >= 3 ? readHandStrength(hole, board) : null,
    role: d.role,
    boardChange: d.boardChange,
  };
}

// ───────────────────────────── 当てはめ ─────────────────────────────

function inRange(v: number | null | undefined, c: ArticleRange | undefined): boolean {
  if (!c) return true;
  if (v === null || v === undefined) return false;
  if (c.min !== undefined && v < c.min) return false;
  if (c.max !== undefined && v >= c.max) return false;
  return true;
}
function inList<T extends string>(v: T | null | undefined, list: readonly T[] | undefined): boolean {
  if (!list) return true;
  if (v === null || v === undefined) return false;
  return list.includes(v);
}
function isBool(v: boolean | null | undefined, want: boolean | undefined): boolean {
  if (want === undefined) return true;
  if (v === null || v === undefined) return false;
  return v === want;
}

/** ルールの条件に当てはまるか。 */
export function ruleMatches(rule: ArticleRule, f: ArticleFacts): boolean {
  const w = rule.when;
  if (!inList(f.street as ArticleStreet, w.street)) return false;
  if (!inList(f.heroPos, w.heroPos)) return false;
  if (!inList(f.action, w.action)) return false;
  if (!isBool(f.facingBet, w.facingBet)) return false;
  if (!inRange(f.effStackBb, w.effStackBb)) return false;
  if (!inRange(f.facingSizeBb, w.facingSizeBb)) return false;
  if (!inRange(f.facingPotPct, w.facingPotPct)) return false;
  if (!inRange(f.spr, w.spr)) return false;
  if (!inList(f.preflopSpot, w.preflopSpot)) return false;
  if (!isBool(f.heroFirstAction, w.heroFirstAction)) return false;
  if (!inList(f.potType, w.potType)) return false;
  if (!isBool(f.blindVsBlind, w.blindVsBlind)) return false;
  if (!isBool(f.heroPreflopAggressor, w.heroPreflopAggressor)) return false;
  if (!isBool(f.inPosition, w.inPosition)) return false;
  if (!isBool(f.multiway, w.multiway)) return false;
  if (!isBool(f.heroCovers, w.heroCovers)) return false;
  if (!inList(f.icmStage, w.icmStage)) return false;
  if (w.heroHand && !handInRange(f.holeCards, w.heroHand)) return false;
  if (!inList(f.role, w.role)) return false;

  const t = f.texture;
  const needsBoard =
    w.boardShape || w.boardHighBand || w.boardSuit || w.boardFlushPossible !== undefined || w.boardDraws ||
    w.boardPaired !== undefined || w.boardPairBand || w.boardBroadwayCount || w.boardHmGap;
  if (needsBoard && !t) return false;
  if (t) {
    if (!inList(f.flop?.shape ?? null, w.boardShape)) return false;
    if (!inList(f.flop?.suit ?? null, w.boardSuit)) return false;
    if (!inList(t.bands[0] ?? null, w.boardHighBand)) return false;
    if (!isBool(t.flushPossible, w.boardFlushPossible)) return false;
    if (!inList(t.draws, w.boardDraws)) return false;
    if (!isBool(t.isPaired, w.boardPaired)) return false;
    if (!inList(t.pairBand, w.boardPairBand)) return false;
    if (!inRange(t.broadwayCount, w.boardBroadwayCount)) return false;
    if (!inRange(t.hmGap, w.boardHmGap)) return false;
  }
  if (!inList(f.boardChange, w.boardChange)) return false;

  const needsHand = w.made || w.kicker || w.anyDraw;
  if (needsHand && !f.hand) return false;
  if (f.hand) {
    if (!inList(f.hand.made, w.made)) return false;
    if (!inList(f.hand.kicker, w.kicker)) return false;
    if (w.anyDraw && !w.anyDraw.some((k) => f.hand!.draws[k])) return false;
  }
  return true;
}

/** 具体さ(書かれた条件の数。手札・手の役・ボードは重く数える)+ priority。 */
export function ruleSpecificity(rule: ArticleRule): number {
  let s = 0;
  for (const [k, v] of Object.entries(rule.when)) {
    if (v === undefined) continue;
    s += k === "heroHand" || k === "made" || k === "anyDraw" || k === "action" ? 2 : 1;
  }
  return s * 10 + rule.priority;
}

/** 当てはまるルールのうち、最も具体的なもの。無ければ null。 */
export function matchArticleRule(rules: readonly ArticleRule[], f: ArticleFacts): ArticleRule | null {
  let best: ArticleRule | null = null;
  let bestScore = -Infinity;
  for (const r of rules) {
    if (!ruleMatches(r, f)) continue;
    const s = ruleSpecificity(r);
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }
  return best;
}


/** 生成物(`articleRules.generated.ts`)の中身。テストが Markdown から作り直して突き合わせる。 */
export function renderGeneratedRules(rules: readonly ArticleRule[]): string {
  return [
    "// このファイルは生成物です。手で書き換えないこと。",
    "// 元: packages/engine/knowledge/*.md / 作り直し: pnpm --filter @meta-geo/engine run knowledge",
    'import type { ArticleRule } from "./articleRules.js";',
    "",
    `export const ARTICLE_RULES: readonly ArticleRule[] = ${JSON.stringify(rules, null, 2)};`,
    "",
  ].join("\n");
}
