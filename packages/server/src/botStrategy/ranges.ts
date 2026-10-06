import {
  EV_IDX,
  EV_LABELS,
  EV_N,
  PREFLOP_BANDS,
  bandOfStack,
  eqMatrixAvailable,
  eqVsRange,
  expandToken,
  freqArrayOf,
  getNashJamRange,
  getVsOpenCallRange,
} from "@meta-geo/db";

/**
 * 169 マス(ハンドクラス)のレンジの道具。プリフロップの表(`@meta-geo/db` の計算済みデータ)と、
 * ランダムな相手に対する強さの順位から、相手のレンジを見積もる。
 */

export type Range169 = number[];

export const ALL_ONES: Range169 = new Array<number>(EV_N).fill(1);

export function emptyRange(): Range169 {
  return new Array<number>(EV_N).fill(0);
}

export function rangeOfTokens(tokens: readonly string[] | undefined): Range169 {
  const out = emptyRange();
  if (!tokens) return out;
  for (const t of tokens) for (const c of expandToken(t)) if (EV_IDX[c] !== undefined) out[EV_IDX[c]!] = 1;
  return out;
}

export function idxOf(handClass: string): number | undefined {
  return EV_IDX[handClass];
}

/** ランダムな2枚に対する勝率(強さの目安)。表が無い環境では 0.5。 */
let strengthCache: number[] | null = null;
export function strengthOf(i: number): number {
  if (!strengthCache) {
    strengthCache = eqMatrixAvailable() ? EV_LABELS.map((_, h) => eqVsRange(h, ALL_ONES)) : new Array<number>(EV_N).fill(0.5);
  }
  return strengthCache[i] ?? 0.5;
}

/** 強さの順位による「上位 lo〜hi の割合」のレンジ(コンボ数で数える)。 */
let orderCache: number[] | null = null;
const COMBOS = EV_LABELS.map((l) => (l.length === 2 ? 6 : l.endsWith("s") ? 4 : 12));
export function percentileRange(lo: number, hi: number): Range169 {
  if (!orderCache) orderCache = EV_LABELS.map((_, i) => i).sort((a, b) => strengthOf(b) - strengthOf(a));
  const out = emptyRange();
  let acc = 0;
  for (const i of orderCache) {
    const share = COMBOS[i]! / 1326;
    const start = acc;
    acc += share;
    if (acc > lo && start < hi) out[i] = 1;
  }
  return out;
}

/** 位置ごとのオープンレンジ(表のレイズ+ジャム+リンプ)。表が無ければ強さの順位で近似。 */
export function openRange(pos: string, effBb: number): Range169 {
  const p = PREFLOP_BANDS[bandOfStack(effBb)]?.[pos];
  if (p) {
    const r = rangeOfTokens([...(p.raise ?? []), ...(p.jam ?? [])]);
    if (r.some((v) => v > 0)) return r;
  }
  const width: Record<string, number> = { UTG: 0.18, HJ: 0.22, CO: 0.28, BTN: 0.45, SB: 0.45, BB: 0.5 };
  return percentileRange(0, width[pos] ?? 0.3);
}

/** オープンへのコールのレンジ(計算済みのディフェンス表)。無ければ強さの順位で近似。 */
export function callVsOpenRange(openerPos: string, callerPos: string, effBb: number): Range169 {
  const rec = getVsOpenCallRange(bandOfStack(effBb), openerPos, callerPos);
  if (rec && Object.keys(rec).length > 0) return freqArrayOf(rec);
  return percentileRange(0.06, callerPos === "BB" ? 0.5 : 0.25);
}

/** オープンでのジャムのレンジ(Nash)。 */
export function jamRange(pos: string, stackBb: number): Range169 | null {
  const rec = getNashJamRange(pos, Math.max(1, Math.min(25, stackBb)));
  return rec ? freqArrayOf(rec) : null;
}

/** 2つのレンジの大きい方を取る(広げる)。 */
export function unionRange(a: Range169, b: Range169): Range169 {
  return a.map((v, i) => Math.max(v, b[i]!));
}

export function freqOf(range: Range169, handClass: string): number {
  const i = EV_IDX[handClass];
  return i === undefined ? 0 : range[i]!;
}
