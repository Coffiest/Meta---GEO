import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cellLabel } from "./geoTree.js";
import type { GtoNodeResult } from "./preflopBaseline.js";

/**
 * 6-maxマルチウェイ・プッシュ/フォールドNash(BBアンティあり, 自社計算)を読み込み、GTOタブ表示用へ変換する。
 * genPreflopNash.ts が全ポジション(UTG/HJ/CO/BTN/SB)×全スタック(1-25bb)を解いた結果。
 * トーナメント(Big Blind Ante)のショート〜ミドルスタックの標準的な開き(シューブ)レンジ。
 */

interface PosData {
  jamFreq: number;
  jam: Record<string, number>;
}
interface CallData {
  callFreq: number;
  call: Record<string, number>;
}
interface StackData {
  s: number;
  positions: Record<string, PosData>;
  /** vsJam[jammerPos][callerPos] = ジャムに直面したときのコール(ディフェンス)レンジ。 */
  vsJam?: Record<string, Record<string, CallData>>;
}
interface NashData {
  model: string;
  samples: number;
  ante: string;
  stacks: StackData[];
}

function loadData(): NashData {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "data", "preflopNash.json"), "utf8");
    return JSON.parse(raw) as NashData;
  } catch {
    return { model: "unavailable", samples: 0, ante: "", stacks: [] };
  }
}

const DATA = loadData();
const OPENERS = ["UTG", "HJ", "CO", "BTN", "SB"];

/** スタック帯 → 代表bb深度(データのある範囲にクランプ)。 */
const BUCKET_DEPTH: Record<string, number> = {
  "0-5": 4,
  "5-10": 8,
  "10-15": 12,
  "15-20": 17,
  "20-30": 22,
  "30+": 25,
};

function nearestStack(target: number): StackData | null {
  if (DATA.stacks.length === 0) return null;
  return DATA.stacks.reduce((best, s) => (Math.abs(s.s - target) < Math.abs(best.s - target) ? s : best));
}

export function preflopNashAvailable(): boolean {
  return DATA.stacks.length > 0;
}

/**
 * GTOタブ用: 指定ポジション・スタック帯の「開きジャム」レンジを13x13で返す。
 * heroPos が opener(UTG..SB)でない、またはデータ未整備なら unsupported。
 */
export function buildPreflopNashNode(params: { heroPos: string; stackBucket: string }): GtoNodeResult {
  if (!OPENERS.includes(params.heroPos)) {
    return { position: params.heroPos, options: [], matrix: { cells: [], totalSamples: 0 }, unsupported: true };
  }
  const stack = nearestStack(BUCKET_DEPTH[params.stackBucket] ?? 12);
  const pos = stack?.positions[params.heroPos];
  if (!stack || !pos) {
    return { position: params.heroPos, options: [], matrix: { cells: [], totalSamples: 0 }, unsupported: true };
  }

  let total = 0;
  let inCombos = 0;
  const cells = Array.from({ length: 13 }, (_, row) =>
    Array.from({ length: 13 }, (_, col) => {
      const lbl = cellLabel(row, col);
      const combos = lbl.length === 2 ? 6 : lbl.endsWith("s") ? 4 : 12;
      total += combos;
      const f = Math.max(0, Math.min(1, pos.jam[lbl] ?? 0));
      inCombos += combos * f;
      const byBucket: Record<string, number> = {};
      if (f > 0) byBucket["allIn"] = f;
      if (1 - f > 0) byBucket["fold"] = 1 - f;
      return { label: lbl, count: combos, byBucket, evByBucket: {} as Record<string, number> };
    }),
  );

  const freq = total > 0 ? inCombos / total : 0;
  const options = [
    { bucket: "allIn", frequency: freq, geometricRatio: 0, evBb: 0 },
    { bucket: "fold", frequency: 1 - freq, geometricRatio: 0, evBb: 0 },
  ].filter((o) => o.frequency > 0);

  return { position: `${params.heroPos} ${stack.s}bb`, options, matrix: { cells, totalSamples: total } };
}

/**
 * GTOタブ用: ジャムに直面したときのコール(ディフェンス)レンジを13x13で返す。
 * jammerPos のジャムに対する callerPos のコール範囲。データ未整備なら unsupported。
 */
export function buildPreflopNashCallNode(params: {
  jammerPos: string;
  callerPos: string;
  stackBucket: string;
}): GtoNodeResult {
  const stack = nearestStack(BUCKET_DEPTH[params.stackBucket] ?? 12);
  const cd = stack?.vsJam?.[params.jammerPos]?.[params.callerPos];
  if (!stack || !cd) {
    return { position: params.callerPos, options: [], matrix: { cells: [], totalSamples: 0 }, unsupported: true };
  }

  let total = 0;
  let inCombos = 0;
  const cells = Array.from({ length: 13 }, (_, row) =>
    Array.from({ length: 13 }, (_, col) => {
      const lbl = cellLabel(row, col);
      const combos = lbl.length === 2 ? 6 : lbl.endsWith("s") ? 4 : 12;
      total += combos;
      const f = Math.max(0, Math.min(1, cd.call[lbl] ?? 0));
      inCombos += combos * f;
      const byBucket: Record<string, number> = {};
      if (f > 0) byBucket["call"] = f;
      if (1 - f > 0) byBucket["fold"] = 1 - f;
      return { label: lbl, count: combos, byBucket, evByBucket: {} as Record<string, number> };
    }),
  );
  const freq = total > 0 ? inCombos / total : 0;
  const options = [
    { bucket: "call", frequency: freq, geometricRatio: 0, evBb: 0 },
    { bucket: "fold", frequency: 1 - freq, geometricRatio: 0, evBb: 0 },
  ].filter((o) => o.frequency > 0);

  // position は素のポジション名(例 "BB")。PositionPillBar が完全一致で active 判定するため装飾しない。
  return { position: params.callerPos, options, matrix: { cells, totalSamples: total } };
}

/** データにあるスタック深度の一覧。 */
export const PREFLOP_NASH_STACKS = DATA.stacks.map((s) => s.s);
