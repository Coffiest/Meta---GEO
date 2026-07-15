import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * プリフロップEVモデルの共有プリミティブ。
 * genPreflopVsOpen.ts(生成スクリプト)と局後検討(reviewGto.ts)が同じ数式・同じ係数を使うための一元化。
 *
 * - 169クラスのラベル順序は genPreflopNash.ts と同一(行=13x13の row-major)。
 * - eqMatrix.json: 169x169 プリフロップ・エクイティ行列(2000サンプルMC, リポジトリ同梱)。
 * - 実現率モデル: playability(ハンド依存) × posBase(位置) × sprAdjust(SPR補正)。
 *   genPreflopVsOpen.ts の校正値と同一に保つこと(変更時は両方を更新して再生成する)。
 */

const RANKS_DESC = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const RC: Record<number, string> = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };

function labelOf(row: number, col: number): string {
  const hi = RC[RANKS_DESC[Math.min(row, col)]!]!;
  const lo = RC[RANKS_DESC[Math.max(row, col)]!]!;
  if (row === col) return `${hi}${hi}`;
  return row < col ? `${hi}${lo}s` : `${hi}${lo}o`;
}

export const EV_N = 169;
export const EV_LABELS: string[] = [];
const COMBOS: number[] = [];
for (let row = 0; row < 13; row++) {
  for (let col = 0; col < 13; col++) {
    const l = labelOf(row, col);
    EV_LABELS.push(l);
    COMBOS.push(l.length === 2 ? 6 : l.endsWith("s") ? 4 : 12);
  }
}
/** クラスの出現確率(コンボ数/1326)。 */
export const EV_P = COMBOS.map((c) => c / 1326);
export const EV_IDX: Record<string, number> = {};
EV_LABELS.forEach((l, i) => (EV_IDX[l] = i));

function loadEqMatrix(): number[][] {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return JSON.parse(readFileSync(join(here, "data", "eqMatrix.json"), "utf8")) as number[][];
  } catch {
    return [];
  }
}
const EQ = loadEqMatrix();

export function eqMatrixAvailable(): boolean {
  return EQ.length === EV_N;
}

/** クラスhの、頻度レンジ(freq[169])に対する加重平均エクイティ。レンジ質量0なら0.5。 */
export function eqVsRange(h: number, freq: number[]): number {
  if (!eqMatrixAvailable()) return 0.5;
  let num = 0,
    den = 0;
  const row = EQ[h]!;
  for (let j = 0; j < EV_N; j++) {
    const w = EV_P[j]! * freq[j]!;
    if (w > 0) {
      num += w * row[j]!;
      den += w;
    }
  }
  return den > 0 ? num / den : 0.5;
}

/** レンジの総質量(全ハンドに対する割合)。 */
export function rangeMass(freq: number[]): number {
  let f = 0;
  for (let j = 0; j < EV_N; j++) f += EV_P[j]! * freq[j]!;
  return f;
}

/** Record<label, freq> → 169配列。 */
export function freqArrayOf(rec: Record<string, number>): number[] {
  const out = new Array<number>(EV_N).fill(0);
  for (const [l, f] of Object.entries(rec)) {
    const i = EV_IDX[l];
    if (i !== undefined) out[i] = Math.max(0, Math.min(1, f));
  }
  return out;
}

const RANK_OF: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10, "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2 };

/**
 * ハンド依存のプレイアビリティ(エクイティ実現率の素点)。genPreflopVsOpen.ts と同一。
 */
export function playability(l: string): number {
  const hi = RANK_OF[l[0]!]!;
  const lo = RANK_OF[l[1]!]!;
  if (l.length === 2) {
    return hi >= 10 ? 1.02 : hi >= 7 ? 0.98 : 0.94;
  }
  const suited = l.endsWith("s");
  const gap = hi - lo;
  if (suited) {
    if (hi >= 10 && lo >= 10) return 1.0;
    if (hi === 14) return 0.92;
    if (gap <= 2 && lo >= 4) return 0.9;
    return 0.78;
  }
  if (hi >= 10 && lo >= 10) return 0.84;
  if (hi === 14) return 0.68;
  return 0.52;
}

/** 位置ベース係数(ディフェンダー用)。genPreflopVsOpen.ts と同一。 */
export function posBase(defender: string, playersBehind: number): number {
  const base = defender === "BB" ? 0.92 : defender === "SB" ? 0.62 : 0.93;
  return base * Math.pow(0.97, playersBehind);
}

/** SPRが低いほど実現率は1へ近づく。genPreflopVsOpen.ts と同一。 */
export function sprAdjust(r: number, spr: number): number {
  const t = Math.max(0, Math.min(1, 1 - spr / 5)) * 0.5;
  return r + (1 - r) * t;
}

/** ポスト額(ベースライン=ポスト前)。BB= blind1 + ante1。 */
export const POSTED: Record<string, number> = { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0.5, BB: 2.0 };
/** プリフロップ行動順。 */
export const PREFLOP_ORDER = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
/** 死に金合計(SB0.5+BB1+ante1)。 */
export const DEAD_TOTAL = 2.5;

/** 自分と相手以外のブラインド+アンティの死に金。 */
export function deadOthersOf(a: string, b: string): number {
  let dead = 0;
  for (const p of ["SB", "BB"] as const) {
    if (p === a || p === b) continue;
    dead += p === "SB" ? 0.5 : 2.0;
  }
  return dead;
}

/** effStackBb → 転記レンジのバンドキー。 */
export function bandOfStack(effStackBb: number): string {
  if (effStackBb >= 30) return "100";
  if (effStackBb >= 20) return "20";
  if (effStackBb >= 15) return "14";
  if (effStackBb >= 10) return "10";
  return "7";
}

/** バンドキー → 代表スタック深度(bb)。 */
export const BAND_DEPTH: Record<string, number> = { "100": 100, "20": 20, "14": 14, "10": 10, "7": 7 };
