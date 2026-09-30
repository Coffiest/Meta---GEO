/**
 * ポストフロップのベット/レイズを、オーナーの戦略ノート(Notion)に沿って9段階で評価する。
 *
 * オーナー確定の方針:
 *  - **ポストフロップは、GTOのEV損ではなくNotionの内容で良手/悪手を決める。**
 *  - 評価はGTOバッジと同じ9段階(最高は絶妙手)。
 *  - **どのルールにも当たらない手は評価しない**(= 呼び出し側でGTOバッジのまま残す)。
 *
 * 評価は下の `RULES` を**上から順に見て、最初に当たったもの**を採る。具体的な局面の話
 * (リバーのフラドロミス、シンバリュー …)を先に、一般的な話(CBのサイズ …)を後に置く。
 * 各ルールは `reason` を返し、解説(`apps/web/src/data/reviewKnowledge.ts`)はそれで引く。
 *
 * **バリューターゲットの有無や推奨サイズの当てはめは、相手のレンジが分からないので
 * 手の強さ × サイズ × ポジション × ボードの形のヒューリスティック。** しきい値は
 * `VERDICT_LIMITS` に集めてある。実際の棋譜で当たり外れを見て調整する前提。
 *
 * 全席を同じロジックで判定する(種別による分岐は持たない)。
 */

import { BET_SIZE_BANDS, type BetRoleInfo, type BetSizeClass, type BetStreet } from "./betRole.js";
import { readBoardTexture, type BoardTexture } from "./boardTexture.js";
import { readHandStrength, type HandStrength, type MadeCategory } from "./handStrength.js";
import type { PotType } from "./potShape.js";

/**
 * 9段階の評価。db の `Classification` と同じ文字列(engine は db に依存しないのでここで定義)。
 * 良い順: 絶妙手 > 最善 > Great > 良手 > 好手 > 常識 > 緩手 > 悪手 > 大悪手。
 */
export type NotionGrade =
  | "artistic"
  | "best"
  | "great"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "blunder";

/** 評価のまとまり(解説の引き当てと集計の目印)。 */
export type StrategyTag =
  | "thinValue"
  | "marginalBet"
  | "flushDrawMissBluff"
  | "goodDonk"
  | "badDonk"
  | "overpairJam"
  | "cbet"
  | "delayedCbet"
  | "barrel"
  | "checkRaise"
  | "riverBlock";

/** 評価の理由。解説の引き当てキー。 */
export type StrategyReason =
  // リバーのバリュー/ブラフ
  | "thinValueTarget"
  | "marginalWeakHand"
  | "marginalSizeTooBig"
  | "marginalFlushBoard"
  | "flushDrawMiss"
  | "riverBlockStrong"
  // ドンク
  | "donkFlushCompleted"
  | "donkTurnRepeat"
  | "donkStraightMove"
  | "donkLowBoard"
  | "donkNoReason"
  // フロップのジャム
  | "overpairJamLowSpr"
  // CB(ボード別の推奨サイズ)。評価は推奨からのずれで決まる
  | "cb3bet"
  | "cbAmlMiddleHit"
  | "cbLowFreqHand"
  | "cbAceHighBroadway"
  | "cbAceLowLow"
  | "cbPairedBoard"
  | "cbLowBoard"
  | "cbDryHigh"
  | "cbMonotone"
  | "cbDrawHeavy"
  // ディレイCB
  | "delayedCbSize"
  // バレル
  | "barrelPolarized"
  | "barrelMarginal"
  // チェックレイズ
  | "checkRaiseTooBig"
  | "checkRaiseDryBroadway"
  | "checkRaiseDraw";

/** 直前のストリートから、盤面のどこが変わったか。ドンクの理由の主役。 */
export type BoardChange = "flushCompleted" | "paired" | "straightMove" | "overcard" | "blank";

export interface StrategyVerdict {
  tag: StrategyTag | null;
  reason: StrategyReason | null;
  /** Notion に基づく評価。null ならどのルールにも当たらなかった(GTOバッジのまま)。 */
  grade: NotionGrade | null;
  boardChange: BoardChange | null;
}

/** 決定そのものの外から渡す文脈。 */
export interface VerdictExtra {
  /** プリフロップの結果のポットの形(3betPot の判定に使う)。 */
  potType?: PotType;
  /** その決定の時点の SPR(有効スタック ÷ ポット)。分からなければ null。 */
  spr?: number | null;
  /** オールインだったか(額からは分からないことがあるので、呼び出し側のバケットで渡す)。 */
  isAllIn?: boolean;
}

/** 判定のしきい値。ポット比。 */
export const VERDICT_LIMITS = {
  /** シンバリュー: OOP はこれ以下(=小さく)。Notion「ポジションがない時は小さく」。 */
  thinValueOopMax: 0.6,
  /** シンバリュー: IP はこれ以下。Notion「ポジションがある時は大きくても良い」。 */
  thinValueIpMax: 0.85,
  /** マージナル: これを超えるベットは、強い手でも「より強い手しかコールしない」サイズ。 */
  bigBetMin: 0.85,
  /** ブロック(約1/3)。この以下なら弱い手でも「安く打つ」ベットとして咎めない。 */
  blockMax: BET_SIZE_BANDS.block,
  /**
   * ドンクの「フロップローボード」= 最高ランクがこれ以下(8ハイ以下)。
   * Notion に数値の定義が無いので暫定。連続したボード(HMギャップ1以下)も同じく良いドンクの局面とする。
   */
  donkLowBoardMaxRank: 8,
  /** Notion「SPR2以下のオーバーペアはいきなりALLIN」。 */
  jamSprMax: 2,
} as const;

const BOARD_CARDS: Record<BetStreet, number> = { flop: 3, turn: 4, river: 5 };

function boardAt(street: BetStreet, board: readonly string[]): string[] {
  return board.slice(0, BOARD_CARDS[street]);
}

/** 役のグループ分け。強い=バリューで打ってよい / 中=ショーダウンバリュー / 弱=打つと薄すぎる。 */
const STRONG_MADE: readonly MadeCategory[] = [
  "straightFlush", "quads", "fullHouse", "flush", "straight", "trips", "twoPair",
];
const MEDIUM_MADE: readonly MadeCategory[] = ["overPair", "topPair", "middlePair"];
const WEAK_MADE: readonly MadeCategory[] = ["bottomPair", "pocketPairBelow"];

/** 直前のストリートとの差を読む。フロップは比べる相手がいないので null。 */
export function readBoardChange(street: BetStreet, board: readonly string[]): BoardChange | null {
  if (street === "flop") return null;
  const prevStreet: BetStreet = street === "river" ? "turn" : "flop";
  const prev = readBoardTexture(boardAt(prevStreet, board));
  const cur = readBoardTexture(boardAt(street, board));
  if (!prev || !cur) return null;

  if (cur.maxSuitCount >= 3 && cur.maxSuitCount > prev.maxSuitCount) return "flushCompleted";
  if (cur.isPaired && !prev.isPaired) return "paired";
  if (cur.hasStraightDraw && !prev.hasStraightDraw) return "straightMove";
  if (cur.highRank > prev.highRank) return "overcard";
  return "blank";
}

// ───────────────────────────── サイズの推奨とずれ ─────────────────────────────

const SIZE_ORDER: readonly BetSizeClass[] = ["block", "small", "medium", "large", "overbet"];

/** 推奨サイズからの段数のずれ → 評価。ぴったり=最善 / 1段=好手 / 2段以上=緩手。 */
function gradeBySizeGap(actual: BetSizeClass, recommended: readonly BetSizeClass[]): NotionGrade {
  const i = SIZE_ORDER.indexOf(actual);
  const gap = Math.min(...recommended.map((r) => Math.abs(SIZE_ORDER.indexOf(r) - i)));
  if (gap === 0) return "best";
  if (gap === 1) return "good";
  return "inaccuracy";
}

/** 評価に使う材料をまとめたもの。 */
interface Ctx {
  info: BetRoleInfo;
  hand: HandStrength | null;
  /** ターン時点の手(フラドロが外れたかの判定用)。 */
  turnHand: HandStrength | null;
  tex: BoardTexture | null;
  change: BoardChange | null;
  /** オールインはオーバーベット扱い。額が分からなければ null。 */
  size: BetSizeClass | null;
  f: number | null;
  potType: PotType | undefined;
  spr: number | null;
  isAllIn: boolean;
}

interface Hit {
  tag: StrategyTag;
  reason: StrategyReason;
  grade: NotionGrade;
}

type Rule = (c: Ctx) => Hit | null;

// ───────────────────────────── ルール ─────────────────────────────

/** リバーのフラドロミスでブラフ(どの役割でも)。ブロッカー理論で悪手。 */
const flushDrawMissBluff: Rule = (c) => {
  if (c.info.street !== "river" || !c.hand || !c.turnHand) return null;
  const hadDraw = c.turnHand.draws.flushDraw || c.turnHand.draws.nutFlushDraw;
  if (!hadDraw || c.hand.made !== "highCard") return null;
  return { tag: "flushDrawMissBluff", reason: "flushDrawMiss", grade: "mistake" };
};

/** ドンク。成立する理由があれば良手、無ければ悪手。 */
const donk: Rule = (c) => {
  if (c.info.role !== "donk") return null;
  const good = (reason: StrategyReason): Hit => ({ tag: "goodDonk", reason, grade: "excellent" });
  if (c.change === "flushCompleted") return good("donkFlushCompleted");
  if (c.change === "paired" && c.info.street === "turn") return good("donkTurnRepeat");
  if (c.change === "straightMove") return good("donkStraightMove");
  const t = c.tex;
  if (
    c.info.street === "flop" &&
    t &&
    (t.highRank <= VERDICT_LIMITS.donkLowBoardMaxRank || (t.hmGap !== null && t.hmGap <= 1))
  ) {
    return good("donkLowBoard");
  }
  return { tag: "badDonk", reason: "donkNoReason", grade: "mistake" };
};

/** リバーのバリュー: マージナルは大悪手、シンバリューは絶妙手、強い手のOOPブロックは好手。 */
const riverValue: Rule = (c) => {
  if (c.info.street !== "river" || !c.hand || !c.tex || c.f === null) return null;
  const { hand, tex, f } = c;
  const isBlock = f <= VERDICT_LIMITS.blockMax;

  if (STRONG_MADE.includes(hand.made)) {
    // ナッツ級を安く: Notion【ブロックベッド】「ガチナッツを混ぜる」。
    if (c.info.position === "OOP" && isBlock) {
      return { tag: "riverBlock", reason: "riverBlockStrong", grade: "good" };
    }
    return null;
  }

  const marginal = (reason: StrategyReason): Hit => ({ tag: "marginalBet", reason, grade: "blunder" });
  if (WEAK_MADE.includes(hand.made)) return isBlock ? null : marginal("marginalWeakHand");
  if (!MEDIUM_MADE.includes(hand.made)) return null;

  if (tex.flushPossible && !isBlock) return marginal("marginalFlushBoard");
  // オーバーペアは強めのバリューハンドなので、サイズで咎めるのはトップペア/ミドルペアだけ。
  if (hand.made !== "overPair") {
    const lowKicker = hand.made === "topPair" && hand.kicker === "low";
    if (f > VERDICT_LIMITS.bigBetMin || (lowKicker && f > VERDICT_LIMITS.thinValueOopMax)) {
      return marginal("marginalSizeTooBig");
    }
    if (c.info.position === "OOP" && f > VERDICT_LIMITS.thinValueOopMax) return marginal("marginalSizeTooBig");
  }
  const limit = c.info.position === "IP" ? VERDICT_LIMITS.thinValueIpMax : VERDICT_LIMITS.thinValueOopMax;
  if (!tex.flushPossible && f <= limit) {
    return { tag: "thinValue", reason: "thinValueTarget", grade: "artistic" };
  }
  return null;
};

/** フロップ・OOP・SPR2以下のオーバーペアでジャム(Notion「いきなりALLIN」)。 */
const overpairJam: Rule = (c) => {
  if (c.info.street !== "flop" || c.info.position !== "OOP" || !c.isAllIn) return null;
  if (!c.hand || c.hand.made !== "overPair") return null;
  if (c.spr === null || c.spr > VERDICT_LIMITS.jamSprMax) return null;
  return { tag: "overpairJam", reason: "overpairJamLowSpr", grade: "great" };
};

/** チェックレイズ。 */
const checkRaise: Rule = (c) => {
  if (c.info.role !== "checkRaise" || c.info.street !== "flop") return null;
  const t = c.tex;
  const dryKQ = !!t && t.draws === "dry" && (t.highRank === 13 || t.highRank === 12);
  if (c.size === "overbet" && !c.isAllIn && !dryKQ) {
    return { tag: "checkRaise", reason: "checkRaiseTooBig", grade: "inaccuracy" };
  }
  if (!c.hand) return null;
  const d = c.hand.draws;
  const hasFlushDraw = d.flushDraw || d.nutFlushDraw;
  // ドライなJTハイ: 「セットはチェックレイズに回す」「フラッシュドローは全てチェックレイズ」。
  const dryBroadway = !!t && t.draws === "dry" && t.bands[0] === "H" && t.broadwayCount >= 2;
  if (dryBroadway && (c.hand.made === "trips" || hasFlushDraw)) {
    return { tag: "checkRaise", reason: "checkRaiseDryBroadway", grade: "excellent" };
  }
  // 「チェックレイズは最低でも15%」= ドローを混ぜてエクイティを放棄しない。
  if (hasFlushDraw || d.openEnded || d.gutshot || d.backdoorFlushDraw) {
    return { tag: "checkRaise", reason: "checkRaiseDraw", grade: "excellent" };
  }
  return null;
};

/** CB。3betPot → ボード別の推奨サイズ。手の選び方の誤りはサイズより先に見る。 */
const cbet: Rule = (c) => {
  if (c.info.role !== "cbet" || c.info.street !== "flop" || !c.size || !c.tex) return null;
  const t = c.tex;
  const hit = (reason: StrategyReason, rec: readonly BetSizeClass[]): Hit => ({
    tag: "cbet",
    reason,
    grade: gradeBySizeGap(c.size!, rec),
  });

  // 3betPot: サイズは安く、オーバーベットは使わない。
  if (c.potType === "threeBet" || c.potType === "fourBetPlus") {
    if (c.size === "overbet" && !c.isAllIn) return { tag: "cbet", reason: "cb3bet", grade: "mistake" };
    return hit("cb3bet", ["block", "small"]);
  }

  const aml = t.shape === "H-M-L" && t.isAceHigh;
  if (aml && c.hand?.made === "middlePair") return hit("cbAmlMiddleHit", ["block"]);

  // 4サイズ混合で「ベット頻度が超低い」手(TPLK・ミドルヒット)。
  if (c.hand && (c.hand.made === "middlePair" || (c.hand.made === "topPair" && c.hand.kicker === "low"))) {
    return { tag: "cbet", reason: "cbLowFreqHand", grade: "inaccuracy" };
  }

  if (t.isPaired) return hit("cbPairedBoard", ["block", "overbet"]);
  if (t.isAceHigh && t.broadwayCount >= 2) return hit("cbAceHighBroadway", ["overbet"]);
  if (t.shape === "H-L-L" && t.isAceHigh) return hit("cbAceLowLow", ["block"]);
  if (t.bands[0] !== "H") {
    // 5〜9ハイ以下: ALLIN(ミドルオーバーペア)・75%・チェック。
    return hit("cbLowBoard", c.hand?.made === "overPair" ? ["overbet", "medium"] : ["medium"]);
  }
  if (t.suit === "monotone") return hit("cbMonotone", ["block"]);
  if (t.draws === "dry") {
    // A・Kハイは33%、Q・Jハイは簡易戦略として50%も可。
    return hit("cbDryHigh", t.highRank >= 13 ? ["block"] : ["block", "small"]);
  }
  if (t.draws === "drawHeavy") return hit("cbDrawHeavy", ["medium"]);
  return null;
};

/** ディレイCB: CBよりちょっと大きいくらい。 */
const delayedCbet: Rule = (c) => {
  if (c.info.role !== "delayedCbet" || !c.size) return null;
  return { tag: "delayedCbet", reason: "delayedCbSize", grade: gradeBySizeGap(c.size, ["medium", "large"]) };
};

/**
 * ターン/リバーバレル: ポラライズ(強い手とエア/ドローで打ち、微妙な手はチェック)して大きめに。
 * トリプルバレルもダブルバレルと同じ戦略。
 */
const barrel: Rule = (c) => {
  if (c.info.role !== "turnBarrel" && c.info.role !== "riverBarrel") return null;
  if (!c.hand) return null;
  const h = c.hand;
  const marginal =
    WEAK_MADE.includes(h.made) || h.made === "middlePair" || (h.made === "topPair" && h.kicker === "low");
  if (marginal) return { tag: "barrel", reason: "barrelMarginal", grade: "inaccuracy" };
  if (!c.size) return null;
  return { tag: "barrel", reason: "barrelPolarized", grade: gradeBySizeGap(c.size, ["medium", "large", "overbet"]) };
};

/** 上から順に見て、最初に当たったものを採る。 */
const RULES: readonly Rule[] = [flushDrawMissBluff, donk, riverValue, overpairJam, checkRaise, cbet, delayedCbet, barrel];

/**
 * 1つのベット/レイズを評価する。
 *
 * @param info 役割判定の結果(そのベット)
 * @param hole 打った人のホールカード(伏せられていれば手の条件は判定しない)
 * @param board 最終ボード(ストリートで切って使う)
 * @param extra ポットの形・SPR・オールインか
 */
export function judgeBet(
  info: BetRoleInfo,
  hole: readonly (string | null)[],
  board: readonly string[],
  extra: VerdictExtra = {}
): StrategyVerdict {
  const street = info.street;
  const isAllIn = extra.isAllIn ?? false;
  const size: BetSizeClass | null = isAllIn ? "overbet" : info.sizeClass;
  const ctx: Ctx = {
    info,
    hand: readHandStrength(hole, boardAt(street, board)),
    turnHand: street === "river" ? readHandStrength(hole, boardAt("turn", board)) : null,
    tex: readBoardTexture(boardAt(street, board)),
    change: readBoardChange(street, board),
    size,
    f: info.potFraction,
    potType: extra.potType,
    spr: extra.spr ?? null,
    isAllIn,
  };
  for (const rule of RULES) {
    const hit = rule(ctx);
    if (hit) return { ...hit, boardChange: ctx.change };
  }
  return { tag: null, reason: null, grade: null, boardChange: ctx.change };
}
