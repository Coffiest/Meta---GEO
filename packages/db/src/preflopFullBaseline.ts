import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cellLabel } from "./geoTree.js";
import { expandToken } from "./preflopBaseline.js";
import type { GtoNodeResult } from "./preflopBaseline.js";
import { PREFLOP_BANDS } from "./data/preflop100.js";

/** レンジ文字列配列をハンドクラスのSetへ展開する。 */
function expandRange(tokens: string[]): Set<string> {
  const s = new Set<string>();
  for (const t of tokens) for (const c of expandToken(t)) s.add(c);
  return s;
}

/** バンドキー → UI表示用のスタック帯ラベル。 */
const BAND_LABEL: Record<string, string> = {
  "100": "30-100bb",
  "20": "20-29bb",
  "14": "15-20bb",
  "10": "10-15bb",
  "7": "10bb以下",
};

/**
 * ユーザー提供のGTO Wizardレンジ(転記)を13x13で返す。
 * バンド("100"/"20"/"14"/"10"/"7")ごとに jam/raise/limp/fold の混合を色分けする。
 * セルは jam(紫/allIn) → raise(オレンジ/raise2-2.5) → limp(緑/call) → fold(青) の優先順で
 * 最初に一致したアクションで着色する(重複記載は上位が勝つ)。
 */
export function buildPreflopBandNode(band: string, heroPos: string): GtoNodeResult {
  const table = PREFLOP_BANDS[band];
  const pos = table?.[heroPos];
  if (!pos) return { position: heroPos, options: [], matrix: { cells: [], totalSamples: 0 }, unsupported: true };
  const jamSet = pos.jam ? expandRange(pos.jam) : null;
  const raiseSet = pos.raise ? expandRange(pos.raise) : null;
  const limpSet = pos.limp ? expandRange(pos.limp) : null;

  let total = 0, jamW = 0, raiseW = 0, limpW = 0, foldW = 0;
  const cells = Array.from({ length: 13 }, (_, row) =>
    Array.from({ length: 13 }, (_, col) => {
      const lbl = cellLabel(row, col);
      const combos = lbl.length === 2 ? 6 : lbl.endsWith("s") ? 4 : 12;
      total += combos;
      const byBucket: Record<string, number> = {};
      if (jamSet && jamSet.has(lbl)) { byBucket["allIn"] = 1; jamW += combos; }
      else if (raiseSet && raiseSet.has(lbl)) { byBucket["raise2-2.5"] = 1; raiseW += combos; }
      else if (limpSet && limpSet.has(lbl)) { byBucket["call"] = 1; limpW += combos; }
      else { byBucket["fold"] = 1; foldW += combos; }
      return { label: lbl, count: combos, byBucket, evByBucket: {} as Record<string, number> };
    }),
  );

  const options = [
    { bucket: "allIn", frequency: total > 0 ? jamW / total : 0, geometricRatio: 0, evBb: 0 },
    { bucket: "raise2-2.5", frequency: total > 0 ? raiseW / total : 0, geometricRatio: 0, evBb: 0 },
    { bucket: "call", frequency: total > 0 ? limpW / total : 0, geometricRatio: 0, evBb: 0 },
    { bucket: "fold", frequency: total > 0 ? foldW / total : 0, geometricRatio: 0, evBb: 0 },
  ].filter((o) => o.frequency > 0.001);

  // position は素のポジション名(例 "UTG")にする。GEOタブと同じく、上部ポジションカード
  // (PositionPillBar)が active 判定に `node.position === "UTG"` の完全一致を使うため、
  // 装飾文字列を付けるとどのカードも active にならず選択不能になる(帯・レイズ幅は設定カードで表示)。
  void BAND_LABEL;
  return { position: heroPos, options, matrix: { cells, totalSamples: total } };
}

/** 後方互換: 30-100bbバンド("100")のオープンレンジノード。 */
export function buildPreflop100Node(heroPos: string): GtoNodeResult {
  return buildPreflopBandNode("100", heroPos);
}

/**
 * 通常のプリフロップ戦略(fold / open-raise / jam の混合)を読み込み、GTOタブ表示用へ変換する。
 * genPreflopFull.ts が全ポジション×全スタックで解いた混合戦略(CFR)。ポストフロップはエクイティ実現率で
 * 近似しているため GTO Wizardと完全一致はしないが、ディープ=open / ~20bb=混合 / <10bb=push の遷移を持つ。
 */

interface PosData {
  fold: number;
  open: number;
  jam: number;
  /** strat[handClass] = [fold, open, jam]。 */
  strat: Record<string, [number, number, number]>;
}
interface StackData {
  s: number;
  positions: Record<string, PosData>;
}
interface FullData {
  model: string;
  samples: number;
  openSize: Record<string, number>;
  stacks: StackData[];
}

function loadData(): FullData {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "data", "preflopFull.json"), "utf8");
    return JSON.parse(raw) as FullData;
  } catch {
    return { model: "unavailable", samples: 0, openSize: {}, stacks: [] };
  }
}

const DATA = loadData();
const OPENERS = ["UTG", "HJ", "CO", "BTN", "SB"];

const BUCKET_DEPTH: Record<string, number> = {
  "0-5": 4,
  "5-10": 8,
  "10-15": 12,
  "15-20": 18,
  "20-30": 25,
  "30+": 30,
};

function nearestStack(target: number): StackData | null {
  if (DATA.stacks.length === 0) return null;
  return DATA.stacks.reduce((best, s) => (Math.abs(s.s - target) < Math.abs(best.s - target) ? s : best));
}

export function preflopFullAvailable(): boolean {
  return DATA.stacks.length > 0;
}

const OPEN_BUCKET = "raise2-2.5"; // オープン(2-2.3bb)を表すバケット(色: オレンジ)

/**
 * GTOタブ用: 指定ポジション・スタック帯の通常戦略(fold/open/jam混合)を13x13で返す。
 * heroPos が opener でない、またはデータ未整備なら unsupported。
 */
export function buildPreflopFullNode(params: { heroPos: string; stackBucket: string }): GtoNodeResult {
  if (!OPENERS.includes(params.heroPos)) {
    return { position: params.heroPos, options: [], matrix: { cells: [], totalSamples: 0 }, unsupported: true };
  }
  const stack = nearestStack(BUCKET_DEPTH[params.stackBucket] ?? 20);
  const pos = stack?.positions[params.heroPos];
  if (!stack || !pos) {
    return { position: params.heroPos, options: [], matrix: { cells: [], totalSamples: 0 }, unsupported: true };
  }

  let total = 0;
  let openW = 0, jamW = 0, foldW = 0;
  const cells = Array.from({ length: 13 }, (_, row) =>
    Array.from({ length: 13 }, (_, col) => {
      const lbl = cellLabel(row, col);
      const combos = lbl.length === 2 ? 6 : lbl.endsWith("s") ? 4 : 12;
      total += combos;
      const s = pos.strat[lbl] ?? [1, 0, 0];
      const [f, o, j] = [Math.max(0, s[0]), Math.max(0, s[1]), Math.max(0, s[2])];
      foldW += combos * f;
      openW += combos * o;
      jamW += combos * j;
      const byBucket: Record<string, number> = {};
      if (o > 0.005) byBucket[OPEN_BUCKET] = o;
      if (j > 0.005) byBucket["allIn"] = j;
      if (f > 0.005) byBucket["fold"] = f;
      return { label: lbl, count: combos, byBucket, evByBucket: {} as Record<string, number> };
    }),
  );

  const options = [
    { bucket: OPEN_BUCKET, frequency: total > 0 ? openW / total : 0, geometricRatio: 0, evBb: 0 },
    { bucket: "allIn", frequency: total > 0 ? jamW / total : 0, geometricRatio: 0, evBb: 0 },
    { bucket: "fold", frequency: total > 0 ? foldW / total : 0, geometricRatio: 0, evBb: 0 },
  ].filter((o) => o.frequency > 0.005);

  // position は素のポジション名(例 "UTG")にする。上部ポジションカード(PositionPillBar)が
  // active 判定に `node.position === "UTG"` の完全一致を使うため、装飾文字列を付けると選択不能になる
  // (GEOタブと完全に同じ入力パターンにするための必須要件。スタック帯は設定カードで表示)。
  return { position: params.heroPos, options, matrix: { cells, totalSamples: total } };
}

export const PREFLOP_FULL_STACKS = DATA.stacks.map((s) => s.s);
