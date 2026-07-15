import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cellLabel } from "./geoTree.js";
import type { GtoNodeResult } from "./preflopBaseline.js";

/**
 * オープンレイズに直面したディフェンス(vsオープン)解を読み込み、GTOタブ表示用へ変換する。
 * genPreflopVsOpen.ts が転記済みオープンレンジ(PREFLOP_BANDS)に対して解いた混合戦略。
 * hand→[call, 3bet, jam](foldは残り)。バンド: "100"=30-100bb / "20"=20-29bb / "14"=15-20bb。
 */

interface VsOpenEntry {
  callFreq: number;
  threeBetFreq: number;
  jamFreq: number;
  threeBetToBb?: number;
  strat: Record<string, [number, number, number]>;
  /** 3betポット用(タスクB): defenderの3betレンジ hand→頻度。 */
  threeBetRange?: Record<string, number>;
  /** 3betポット用(タスクB): openerのcall-vs-3betレンジ hand→頻度。 */
  callVs3betRange?: Record<string, number>;
}
interface VsOpenData {
  model: string;
  bands: Record<string, Record<string, Record<string, VsOpenEntry>>>;
}

function loadData(): VsOpenData {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "data", "preflopVsOpen.json"), "utf8");
    return JSON.parse(raw) as VsOpenData;
  } catch {
    return { model: "unavailable", bands: {} };
  }
}
const DATA = loadData();

/** 3betサイズ(bb)からUIバケットへ。 */
function threeBetBucket(bb: number | undefined): string {
  if (!bb) return "raise4+";
  if (bb < 2.5) return "raise2-2.5";
  if (bb < 3) return "raise2.5-3";
  if (bb < 4) return "raise3-4";
  return "raise4+";
}

/**
 * GTOタブ用: band("100"/"20"/"14")での「openerのオープンに直面したdefender」の
 * ディフェンス混合戦略(fold/call/3bet/allin)を13x13で返す。
 */
export function buildPreflopVsOpenNode(band: string, opener: string, defender: string): GtoNodeResult {
  const entry = DATA.bands[band]?.[opener]?.[defender];
  if (!entry) {
    return { position: defender, options: [], matrix: { cells: [], totalSamples: 0 }, unsupported: true };
  }
  const r3Bucket = threeBetBucket(entry.threeBetToBb);

  let total = 0, callW = 0, r3W = 0, jamW = 0, foldW = 0;
  const cells = Array.from({ length: 13 }, (_, row) =>
    Array.from({ length: 13 }, (_, col) => {
      const lbl = cellLabel(row, col);
      const combos = lbl.length === 2 ? 6 : lbl.endsWith("s") ? 4 : 12;
      total += combos;
      const s = entry.strat[lbl];
      const c = s?.[0] ?? 0;
      const r3 = s?.[1] ?? 0;
      const j = s?.[2] ?? 0;
      const f = Math.max(0, 1 - c - r3 - j);
      callW += combos * c;
      r3W += combos * r3;
      jamW += combos * j;
      foldW += combos * f;
      const byBucket: Record<string, number> = {};
      if (j > 0.005) byBucket["allIn"] = j;
      if (r3 > 0.005) byBucket[r3Bucket] = r3;
      if (c > 0.005) byBucket["call"] = c;
      if (f > 0.005) byBucket["fold"] = f;
      return { label: lbl, count: combos, byBucket, evByBucket: {} as Record<string, number> };
    }),
  );

  const options = [
    { bucket: "allIn", frequency: total > 0 ? jamW / total : 0, geometricRatio: 0, evBb: 0 },
    { bucket: r3Bucket, frequency: total > 0 ? r3W / total : 0, geometricRatio: 0, evBb: 0 },
    { bucket: "call", frequency: total > 0 ? callW / total : 0, geometricRatio: 0, evBb: 0 },
    { bucket: "fold", frequency: total > 0 ? foldW / total : 0, geometricRatio: 0, evBb: 0 },
  ].filter((o) => o.frequency > 0.001);

  // position は素のポジション名(PositionPillBar の active 判定が完全一致のため)。
  return { position: defender, options, matrix: { cells, totalSamples: total } };
}

export function preflopVsOpenAvailable(): boolean {
  return Object.keys(DATA.bands).length > 0;
}

/**
 * (band, opener, defender) のディフェンスの「コール」レンジ(handクラス→コール頻度)を返す。
 * ポストフロップ(SRP)のレンジ導出に使う。未整備なら null。
 */
export function getVsOpenCallRange(band: string, opener: string, defender: string): Record<string, number> | null {
  const entry = DATA.bands[band]?.[opener]?.[defender];
  if (!entry) return null;
  const out: Record<string, number> = {};
  for (const [label, s] of Object.entries(entry.strat)) {
    const c = s[0];
    if (c > 0.02) out[label] = c;
  }
  return out;
}

/** (band, opener, defender) の 3bettor(=defender)の3betレンジ hand→頻度。未整備なら null。 */
export function getVsOpen3betRange(band: string, opener: string, defender: string): Record<string, number> | null {
  const r = DATA.bands[band]?.[opener]?.[defender]?.threeBetRange;
  return r && Object.keys(r).length ? r : null;
}

/** (band, opener, defender) の opener の call-vs-3bet レンジ hand→頻度。未整備なら null。 */
export function getVsOpenCallVs3betRange(band: string, opener: string, defender: string): Record<string, number> | null {
  const r = DATA.bands[band]?.[opener]?.[defender]?.callVs3betRange;
  return r && Object.keys(r).length ? r : null;
}

/** (band, opener, defender) の3betサイズ(bb)。未整備なら undefined。 */
export function getVsOpen3betToBb(band: string, opener: string, defender: string): number | undefined {
  return DATA.bands[band]?.[opener]?.[defender]?.threeBetToBb;
}
