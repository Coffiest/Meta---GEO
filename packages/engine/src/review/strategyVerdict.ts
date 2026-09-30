/**
 * ベットの役割(`betRole.ts`)と手の強さ・ボードから、その手の「戦略上の判定」を出す。
 *
 * GTO のEV損とは別の物差しで、オーナーの戦略ノートに沿って次の3つを**格付けとして上書きする**
 * (オーナー確定。EV損の数字は残し、バッジだけを戦略判定にする):
 *  - シンバリューベット      → 絶妙手(artistic)
 *  - マージナルベット        → 大悪手(blunder)
 *  - リバーのフラドロミスでブラフ → 悪手(mistake)
 *
 * ドンクの良し悪しは上書きせず、理由(盤面のどこが変わったか)だけを返す。
 *
 * **バリューターゲットの有無は相手のレンジが分からないので、手の強さ × サイズ × ポジション ×
 * ボードの形のヒューリスティック。** しきい値は `VERDICT_LIMITS` に集めてある。実際の棋譜で
 * 当たり外れを見て調整する前提。
 *
 * 全席を同じロジックで判定する(種別による分岐は持たない)。
 */

import type { BetRoleInfo, BetStreet } from "./betRole.js";
import { readBoardTexture, type BoardTexture } from "./boardTexture.js";
import { readHandStrength, type HandStrength, type MadeCategory } from "./handStrength.js";

/** 上書きで付けうる格付け。`Classification` の部分集合(engine は db に依存しないので文字列で持つ)。 */
export type OverrideClass = "artistic" | "mistake" | "blunder";

export type StrategyTag =
  | "thinValue"
  | "marginalBet"
  | "flushDrawMissBluff"
  | "goodDonk"
  | "badDonk";

/** 判定の理由。解説の引き当てに使う(1つの tag に複数の理由がありうる)。 */
export type StrategyReason =
  // シンバリュー
  | "thinValueTarget"
  // マージナル
  | "marginalWeakHand"
  | "marginalSizeTooBig"
  | "marginalFlushBoard"
  // ブラフ
  | "flushDrawMiss"
  // ドンク
  | "donkFlushCompleted"
  | "donkTurnRepeat"
  | "donkStraightMove"
  | "donkLowBoard"
  | "donkNoReason";

/** 直前のストリートから、盤面のどこが変わったか。ドンクの理由の主役。 */
export type BoardChange = "flushCompleted" | "paired" | "straightMove" | "overcard" | "blank";

export interface StrategyVerdict {
  tag: StrategyTag | null;
  reason: StrategyReason | null;
  /** バッジを上書きする格付け。null なら GTO の格付けのまま。 */
  override: OverrideClass | null;
  boardChange: BoardChange | null;
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
  blockMax: 0.4,
  /**
   * ドンクの「フロップローボード」= 最高ランクがこれ以下(8ハイ以下)。
   * Notion に数値の定義が無いので暫定。連続したボード(HMギャップ1以下)も同じく良いドンクの局面とする。
   */
  donkLowBoardMaxRank: 8,
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

/**
 * ドンクの良し悪しと理由。
 *
 * Notion の「ドンクが存在するスポット = オリジナルがチェックバックしたい局面 = OOP側にナッツ級が
 * 移った局面」に沿う。良いドンクの局面: フロップのローボード/コネクトボード、ターンのリピート、
 * フラッシュ/ストレート完成、ナッツの移動。理由が無いリバーの純粋なブロックは誤り。
 */
function judgeDonk(street: BetStreet, tex: BoardTexture | null, change: BoardChange | null): {
  tag: "goodDonk" | "badDonk";
  reason: StrategyReason;
} {
  if (change === "flushCompleted") return { tag: "goodDonk", reason: "donkFlushCompleted" };
  if (change === "paired" && street === "turn") return { tag: "goodDonk", reason: "donkTurnRepeat" };
  if (change === "straightMove") return { tag: "goodDonk", reason: "donkStraightMove" };
  if (
    street === "flop" &&
    tex &&
    (tex.highRank <= VERDICT_LIMITS.donkLowBoardMaxRank || (tex.hmGap !== null && tex.hmGap <= 1))
  ) {
    return { tag: "goodDonk", reason: "donkLowBoard" };
  }
  return { tag: "badDonk", reason: "donkNoReason" };
}

/**
 * 1つのベット/レイズを判定する。
 *
 * @param info 役割判定の結果(そのベット)
 * @param hole 打った人のホールカード(伏せられていれば判定しない)
 * @param board 最終ボード(ストリートで切って使う)
 */
export function judgeBet(
  info: BetRoleInfo,
  hole: readonly (string | null)[],
  board: readonly string[]
): StrategyVerdict {
  const none: StrategyVerdict = { tag: null, reason: null, override: null, boardChange: null };
  const change = readBoardChange(info.street, board);
  const tex = readBoardTexture(boardAt(info.street, board));

  const isRiver = info.street === "river";
  const hand: HandStrength | null = isRiver ? readHandStrength(hole, boardAt("river", board)) : null;

  // 1) リバーのフラドロミスでブラフ: ターンでフラドロ → リバーで完成せず役なし → ベット。
  //    ドンク(OOPの先打ち)でも同じ。ブラフの選び方の誤りは、どの役割で打っても変わらない。
  if (isRiver && hand) {
    const turnHand = readHandStrength(hole, boardAt("turn", board));
    const missedFlushDraw =
      !!turnHand && (turnHand.draws.flushDraw || turnHand.draws.nutFlushDraw) && hand.made === "highCard";
    if (missedFlushDraw) {
      return { tag: "flushDrawMissBluff", reason: "flushDrawMiss", override: "mistake", boardChange: change };
    }
  }

  // ドンクは手札が要らない(盤面と役割だけで良し悪しの理由が出る)。上書きはしない。
  // バリュー側(シンバリュー/マージナル)の判定はかけない: ドンクの成立可否の説明と矛盾させないため。
  if (info.role === "donk") {
    const d = judgeDonk(info.street, tex, change);
    return { tag: d.tag, reason: d.reason, override: null, boardChange: change };
  }

  // 以降はリバーのバリュー判定。手札が要る。
  if (!isRiver || !hand || !tex) return { ...none, boardChange: change };

  const f = info.potFraction;
  if (f === null) return { ...none, boardChange: change };
  if (STRONG_MADE.includes(hand.made)) return { ...none, boardChange: change };

  const isBlock = f <= VERDICT_LIMITS.blockMax;
  const isWeak = WEAK_MADE.includes(hand.made);
  const isMedium = MEDIUM_MADE.includes(hand.made);
  const lowKicker = hand.made === "topPair" && hand.kicker === "low";

  // 2) マージナルベット: 打っても「より強い手しかコールしない / より弱い手はコールしない」。
  if (isWeak && !isBlock) {
    return { tag: "marginalBet", reason: "marginalWeakHand", override: "blunder", boardChange: change };
  }
  if (isMedium) {
    if (tex.flushPossible && !isBlock) {
      return { tag: "marginalBet", reason: "marginalFlushBoard", override: "blunder", boardChange: change };
    }
    // オーバーペアは強めのバリューハンドなので、サイズで咎めるのはトップペア/ミドルペアだけ。
    if (hand.made !== "overPair") {
      if (f > VERDICT_LIMITS.bigBetMin || (lowKicker && f > VERDICT_LIMITS.thinValueOopMax)) {
        return { tag: "marginalBet", reason: "marginalSizeTooBig", override: "blunder", boardChange: change };
      }
      if (info.position === "OOP" && f > VERDICT_LIMITS.thinValueOopMax) {
        return { tag: "marginalBet", reason: "marginalSizeTooBig", override: "blunder", boardChange: change };
      }
    }

    // 3) シンバリューベット: 中程度の手で、より弱い手がコールしてくれるサイズ。
    const limit = info.position === "IP" ? VERDICT_LIMITS.thinValueIpMax : VERDICT_LIMITS.thinValueOopMax;
    if (!tex.flushPossible && f <= limit) {
      return { tag: "thinValue", reason: "thinValueTarget", override: "artistic", boardChange: change };
    }
  }

  return { ...none, boardChange: change };
}
