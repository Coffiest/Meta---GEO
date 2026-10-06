/**
 * パワーナンバー(15bb 以下のプッシュ/フォールドの目安)。オーナー指示で、15bb 以下のショートスタックの
 * 「最初に入る(オープン)」決定は、この表で判定する。
 *
 * 出典: https://poker-nyuumon.com/power-number/
 *  - M = 持ちスタック ÷(SB + BB + アンティ)
 *  - 有効M = M × 後ろに控えている人数
 *  - 有効M < 表の数字 → オールイン。そうでなければフォールド。
 *  - ∞ はどの有効M でもオールイン。「–」(空欄)は有効M が 3 未満のときだけオールイン。
 *  - 自分より前に誰も参加していない(全員フォールド)局面で使う。
 *
 * 表の並び: 行 = 1枚目、列 = 2枚目(A K Q … 2)。右上の三角がスーテッド、対角がペア、左下の三角がオフスート。
 * 色の帯(表示用): ∞・34 以上 = 赤系 / 16〜33 = 青 / 10〜15 = 黄 / 9 以下と「–」= 白。
 */

export const PN_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;

/** null = 「–」(有効M が 3 未満のときだけオールイン)。Infinity = ∞。 */
type PnCell = number | null;
const I = Infinity;
const _ = null;

export const POWER_NUMBER_TABLE: readonly (readonly PnCell[])[] = [
  /* A */ [I, I, I, I, I, 50, 37, 32, 28, 31, 27, 26, 24],
  /* K */ [I, I, I, 75, 66, 44, 17, 15, 14, 13, 11, 10, 9],
  /* Q */ [I, 48, I, 75, 58, 38, 16, 11, 10, 8, 8, 8, 8],
  /* J */ [50, 31, 26, I, 58, 39, 21, 12, 7, 7, 7, 7, 5],
  /* T */ [36, 19, 17, 22, I, 43, 26, 15, 10, 9, 7, 5, 4],
  /* 9 */ [27, 12, 9, 9, 11, I, 31, 17, 10, 9, 3, 3, _],
  /* 8 */ [24, 10, 8, 8, 10, 10, 66, 19, 15, 10, 5, _, _],
  /* 7 */ [22, 9, 6, 5, 6, 7, 10, 58, 15, 10, 9, _, _],
  /* 6 */ [18, 9, 6, 4, 3, 3, 4, 7, 51, 11, 10, 4, _],
  /* 5 */ [21, 9, 6, 4, _, _, _, _, _, 44, 11, 8, _],
  /* 4 */ [18, 8, 5, 3, _, _, _, _, _, _, 39, 6, _],
  /* 3 */ [16, 8, 5, 3, _, _, _, _, _, _, _, 33, _],
  /* 2 */ [15, 7, 4, 3, _, _, _, _, _, _, _, _, 28],
];

/** 「–」のマスの閾値(有効M がこれ未満ならオールイン)。 */
export const PN_DASH_THRESHOLD = 3;

/** パワーナンバーで判定する上限のスタック(bb)。オーナー指示: 15bb 以下。 */
export const PN_MAX_STACK_BB = 15;

export type PnBand = "red" | "blue" | "yellow" | "white";

/** 表示用の色の帯。 */
export function pnBand(v: PnCell): PnBand {
  if (v === null) return "white";
  if (v === Infinity || v >= 34) return "red";
  if (v >= 16) return "blue";
  if (v >= 10) return "yellow";
  return "white";
}

/** "AKs" / "T9o" / "77" → 表の [行, 列]。読めなければ null。 */
export function pnCellOf(handClass: string): [number, number] | null {
  const a = PN_RANKS.indexOf(handClass[0] as (typeof PN_RANKS)[number]);
  const b = PN_RANKS.indexOf(handClass[1] as (typeof PN_RANKS)[number]);
  if (a < 0 || b < 0) return null;
  if (a === b) return handClass.length === 2 ? [a, a] : null;
  const hi = Math.min(a, b);
  const lo = Math.max(a, b);
  const kind = handClass[2];
  if (kind === "s") return [hi, lo];
  if (kind === "o") return [lo, hi];
  return null;
}

/** ハンドのパワーナンバー。null は「–」。読めないハンドは undefined。 */
export function powerNumberOf(handClass: string): PnCell | undefined {
  const cell = pnCellOf(handClass);
  return cell ? POWER_NUMBER_TABLE[cell[0]]![cell[1]]! : undefined;
}

/** その有効M で、表の数字ならオールインか。 */
export function pnShouldPush(pn: PnCell, effectiveM: number): boolean {
  if (pn === null) return effectiveM < PN_DASH_THRESHOLD;
  return effectiveM < pn;
}

export interface PowerNumberVerdict {
  handClass: string;
  /** パワーナンバー。null は「–」、Infinity は ∞。 */
  pn: PnCell;
  /** M = スタック ÷ (SB + BB + アンティ)。 */
  m: number;
  playersBehind: number;
  effectiveM: number;
  /** 表が言う正解。 */
  correct: "push" | "fold";
  /** 実際の手が正解と一致したか。 */
  followed: boolean;
}

/**
 * 15bb 以下で、誰も参加していない局面の決定をパワーナンバーで判定する。
 *
 * @param stackBb 持ちスタック(このハンドの開始時、bb)
 * @param potBb   その時点のポット(SB + BB + アンティ、bb)
 * @param playersBehind 後ろに控えている人数(自分より後に行動する、まだ降りていない人)
 * @param action  実際に取った手(棋譜解析のバケット)
 */
export function judgePowerNumber(params: {
  handClass: string;
  stackBb: number;
  potBb: number;
  playersBehind: number;
  action: string;
}): PowerNumberVerdict | null {
  const pn = powerNumberOf(params.handClass);
  if (pn === undefined || params.potBb <= 0 || params.playersBehind < 1) return null;
  const m = params.stackBb / params.potBb;
  const effectiveM = m * params.playersBehind;
  const correct = pnShouldPush(pn, effectiveM) ? "push" : "fold";
  const pushed = params.action === "allIn";
  const folded = params.action === "fold";
  return {
    handClass: params.handClass,
    pn,
    m,
    playersBehind: params.playersBehind,
    effectiveM,
    correct,
    followed: correct === "push" ? pushed : folded,
  };
}

/**
 * パワーナンバーの判定を 9段階の格付けへ。
 * - 表どおり → best
 * - プッシュすべき手で、リンプ/ミニレイズ → inaccuracy(参加はしている)
 * - プッシュすべき手でフォールド → 表の数字と有効M の差が大きいほど重い(mistake / blunder)
 * - フォールドすべき手でオールイン → 際どければ inaccuracy、離れていれば mistake / blunder
 */
export function gradePowerNumber(v: PowerNumberVerdict, action: string): "best" | "inaccuracy" | "mistake" | "blunder" {
  if (v.followed) return "best";
  const threshold = v.pn === null ? PN_DASH_THRESHOLD : v.pn;
  if (v.correct === "push") {
    if (action !== "fold") return "inaccuracy";
    if (threshold === Infinity) return "blunder";
    return v.effectiveM < threshold * 0.5 ? "blunder" : v.effectiveM < threshold * 0.8 ? "mistake" : "inaccuracy";
  }
  // フォールドすべき手で参加した。
  if (action !== "allIn") return "inaccuracy";
  return v.effectiveM > threshold * 2 ? "blunder" : v.effectiveM > threshold * 1.3 ? "mistake" : "inaccuracy";
}
