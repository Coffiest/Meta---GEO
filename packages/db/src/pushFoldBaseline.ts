import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cellLabel } from "./geoTree.js";
import type { GtoNodeResult } from "./preflopBaseline.js";

/**
 * HUプッシュ/フォールドのNash均衡(自社計算)を読み込み、GTOタブ表示用のノードへ変換する。
 * データは scripts/genPushFold.ts が生成した src/data/pushFoldNash.json。GTO WizardのHU Push/Fold
 * (ICMなしChipEV Nash)チャートと直接照合できる、自力計算の正解データ。
 */

interface PushFoldDepth {
  s: number;
  jamFreq: number;
  callFreq: number;
  jam: Record<string, number>;
  call: Record<string, number>;
}
interface PushFoldData {
  model: string;
  samples: number;
  generatedDepths: number[];
  depths: PushFoldDepth[];
}

function loadData(): PushFoldData {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "data", "pushFoldNash.json"), "utf8");
    return JSON.parse(raw) as PushFoldData;
  } catch {
    return { model: "unavailable", samples: 0, generatedDepths: [], depths: [] };
  }
}

const DATA = loadData();

/** スタック帯 → 代表bb深度。 */
const BUCKET_DEPTH: Record<string, number> = {
  "0-5": 4,
  "5-10": 7,
  "10-15": 12,
  "15-20": 17,
  "20-30": 20,
  "30+": 20,
};

/** 生成済み深度のうち、目標に最も近いものを選ぶ。 */
function nearestDepth(target: number): PushFoldDepth | null {
  if (DATA.depths.length === 0) return null;
  return DATA.depths.reduce((best, d) => (Math.abs(d.s - target) < Math.abs(best.s - target) ? d : best));
}

export function pushFoldAvailable(): boolean {
  return DATA.depths.length > 0;
}

/**
 * GTOタブ用: 指定スタック帯のHUプッシュ/フォールドNash(SBのjamレンジ)を13x13で返す。
 * side="jam"(SBのオープンジャム) / side="call"(BBのコール)を選べる。
 */
export function buildPushFoldGtoNode(params: { stackBucket: string; side?: "jam" | "call" }): GtoNodeResult {
  const side = params.side ?? "jam";
  const depth = nearestDepth(BUCKET_DEPTH[params.stackBucket] ?? 20);
  if (!depth) {
    return { position: side === "jam" ? "SB" : "BB", options: [], matrix: { cells: [], totalSamples: 0 }, unsupported: true };
  }

  const inRange = side === "jam" ? depth.jam : depth.call;
  const actionBucket = side === "jam" ? "allIn" : "checkOrCall";
  const foldBucket = "fold";

  let total = 0;
  let inCombos = 0;
  const cells = Array.from({ length: 13 }, (_, row) =>
    Array.from({ length: 13 }, (_, col) => {
      const lbl = cellLabel(row, col);
      const combos = lbl.length === 2 ? 6 : lbl.endsWith("s") ? 4 : 12;
      total += combos;
      // 混合頻度(0..1)。actionBucketの頻度と残りをfoldに割り当てる。
      const f = Math.max(0, Math.min(1, inRange[lbl] ?? 0));
      inCombos += combos * f;
      const byBucket: Record<string, number> = {};
      if (f > 0) byBucket[actionBucket] = f;
      if (1 - f > 0) byBucket[foldBucket] = 1 - f;
      return { label: lbl, count: combos, byBucket, evByBucket: {} as Record<string, number> };
    }),
  );

  const freq = total > 0 ? inCombos / total : 0;
  const options = [
    { bucket: actionBucket, frequency: freq, geometricRatio: 0, evBb: 0 },
    { bucket: foldBucket, frequency: 1 - freq, geometricRatio: 0, evBb: 0 },
  ].filter((o) => o.frequency > 0);

  // position は素のポジション名(SB/BB)にする。上部ポジションカードの active 判定が完全一致のため、
  // 装飾を付けると選択不能になる(GEOタブと同じ入力パターンにする)。深さは設定カードで表示。
  return { position: side === "jam" ? "SB" : "BB", options, matrix: { cells, totalSamples: total } };
}

export const PUSHFOLD_DEPTHS = DATA.generatedDepths;
