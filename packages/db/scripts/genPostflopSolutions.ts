/**
 * 代表フロップ×バンド×主要ペアのSRPポストフロップ解を事前計算し、JSONバンドルへ書き出す。
 *
 *   実行例:
 *     FLOP_COUNT=16 BANDS=20,14 MATCHUPS=BTNvBB,COvBB ITER=60 SAMPLE=6 \
 *       pnpm --filter @meta-geo/db exec tsx scripts/genPostflopSolutions.ts
 *   出力: packages/db/src/data/postflopSolutions.json
 *
 * 設計:
 *   - 全1755フロップ(スート同型で正規化した代表)から、テクスチャ(ペア有無×スート数×高さ)で
 *     層化してFLOP_COUNT枚をラウンドロビン抽出する(PioSOLVERのflop subset風)。
 *   - 各スポットを prepareGtoPostflopSpot(品質オーバーライド付き)で解き、全ノード戦略(snapshot)を
 *     gtoPostflopSpotKey で冪等キー化してバンドルへ格納する。
 *   - バンドルは seedGtoPostflopSolutions.ts が GtoSolution へ upsert する(JSON事前生成→seedは投入だけ)。
 *
 * 環境変数:
 *   FLOP_COUNT  抽出フロップ数(既定 16)
 *   BANDS       カンマ区切り(既定 "20,14")。"100" は重いので明示指定時のみ。
 *   MATCHUPS    "OPvDEF" のカンマ区切り(既定 "BTNvBB,COvBB")。
 *   ITER        反復数(既定 60)
 *   SAMPLE      チャンスサンプル数(既定 6。ターン/リバー各層に適用され二乗で効く)
 *   BETSIZES    ベットサイズ(既定 "0.75")
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  prepareGtoPostflopSpot,
  gtoPostflopSpotKey,
  gtoPostflopSpotComponents,
  GTO_POSTFLOP_SOLVER_VERSION,
  type GtoPostflopSpotSnapshot,
} from "../src/gtoPostflop.js";
import { canonicalizeBoard } from "../src/solverSpot.js";
import { getVsOpenCallRange } from "../src/preflopVsOpenBaseline.js";

/** ポストフロップ解の対象となりうるポジション候補。 */
const OPENERS = ["UTG", "HJ", "CO", "BTN", "SB"];
const DEFENDERS = ["SB", "BB"];

/**
 * band で vsOpen コールレンジが定義されている (opener, defender) ペアを全列挙する。
 * MATCHUPS=auto のときに使う(レビューが要求しうる全ペアを網羅)。
 */
function autoMatchups(band: string): { opener: string; defender: string }[] {
  const out: { opener: string; defender: string }[] = [];
  for (const opener of OPENERS) {
    for (const defender of DEFENDERS) {
      if (opener === defender) continue;
      if (getVsOpenCallRange(band, opener, defender)) out.push({ opener, defender });
    }
  }
  return out;
}

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS = ["s", "h", "d", "c"];

/** スート同型で正規化した代表フロップ(1755枚)を列挙する。 */
function canonicalFlops(): string[][] {
  const cards: string[] = [];
  for (const r of RANKS) for (const s of SUITS) cards.push(r + s);
  const seen = new Set<string>();
  const reps: string[][] = [];
  for (let i = 0; i < 52; i++)
    for (let j = i + 1; j < 52; j++)
      for (let k = j + 1; k < 52; k++) {
        const flop = [cards[i]!, cards[j]!, cards[k]!];
        const canon = canonicalizeBoard(flop);
        if (seen.has(canon)) continue;
        seen.add(canon);
        reps.push(flop);
      }
  return reps;
}

/** テクスチャ分類(ボード構造 × スート数 × 高さ)。層化抽出のキーに使う。 */
function texture(flop: string[]): string {
  const ranks = flop.map((c) => c.slice(0, -1));
  const suits = flop.map((c) => c.slice(-1));
  const uniqSuits = new Set(suits).size;
  const suitClass = uniqSuits === 1 ? "mono" : uniqSuits === 2 ? "two" : "rain";
  const uniqRanks = new Set(ranks).size;
  const rankClass = uniqRanks === 3 ? "unp" : uniqRanks === 2 ? "pair" : "trips";
  const hi = Math.min(...ranks.map((r) => RANKS.indexOf(r))); // 0=A
  const hiClass = hi <= 3 ? "high" : hi <= 7 ? "mid" : "low";
  return `${rankClass}-${suitClass}-${hiClass}`;
}

/**
 * テクスチャ層で比例配分し、各層内は均等間隔で採って全体に散った count 枚を選ぶ(決定的)。
 * trips(3カード)は実戦頻度が極小なので除外する。
 */
function stratifiedSubset(flops: string[][], count: number): string[][] {
  const groups = new Map<string, string[][]>();
  let total = 0;
  for (const f of flops) {
    const t = texture(f);
    if (t.startsWith("trips")) continue;
    (groups.get(t) ?? groups.set(t, []).get(t)!).push(f);
    total++;
  }
  const keys = [...groups.keys()].sort();
  const out: string[][] = [];
  for (const key of keys) {
    const g = groups.get(key)!;
    // この層の割当数(最低1枚、count比例)。
    const take = Math.max(1, Math.round((count * g.length) / total));
    for (let m = 0; m < take && m < g.length; m++) {
      const pos = Math.min(g.length - 1, Math.floor((m + 0.5) * (g.length / take)));
      out.push(g[pos]!);
    }
  }
  // 決定的に間引き/不足時はそのまま。テクスチャキー順で安定。
  if (out.length <= count) return out;
  const trimmed: string[][] = [];
  const stride = out.length / count;
  for (let i = 0; i < count; i++) trimmed.push(out[Math.min(out.length - 1, Math.floor(i * stride))]!);
  return trimmed;
}

interface BundleEntry {
  spotKey: string;
  street: string;
  effStackBucket: string;
  heroPos: string;
  boardCanon: string;
  actionLine: string;
  betTree: string;
  solution: GtoPostflopSpotSnapshot;
}

async function main() {
  // FLOP_COUNT="all"(または0)で全1755フロップ(trips除く)を網羅。数値なら層化抽出。
  const flopCountRaw = (process.env["FLOP_COUNT"] ?? "16").trim().toLowerCase();
  const flopAll = flopCountRaw === "all" || flopCountRaw === "0";
  const FLOP_COUNT = flopAll ? Number.POSITIVE_INFINITY : Number(flopCountRaw);
  const BANDS = (process.env["BANDS"] ?? "20,14").split(",").map((s) => s.trim()).filter(Boolean);
  // MATCHUPS="auto" で band ごとに vsOpen コールレンジのある全ペアを網羅。それ以外は "OPvDEF" 指定。
  const matchupsRaw = (process.env["MATCHUPS"] ?? "BTNvBB,COvBB").trim();
  const matchupsAuto = matchupsRaw.toLowerCase() === "auto";
  const MATCHUPS = matchupsAuto
    ? []
    : matchupsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((m) => {
          const [op, def] = m.split("v");
          return { opener: op!, defender: def! };
        });
  const ITER = Number(process.env["ITER"] ?? 60);
  const SAMPLE = Number(process.env["SAMPLE"] ?? 6);
  const BETSIZES = (process.env["BETSIZES"] ?? "0.75").split(",").map(Number);

  const here = dirname(fileURLToPath(import.meta.url));
  const dataDir = join(here, "..", "src", "data");
  const outPath = join(dataDir, "postflopSolutions.json");

  // 既存バンドルへ追記(冪等: 同一spotKeyは上書き)。バンド/ペアを分けて複数回実行できる。
  const bySpot = new Map<string, BundleEntry>();
  if (existsSync(outPath)) {
    try {
      const prev = JSON.parse(readFileSync(outPath, "utf8")) as { entries?: BundleEntry[] };
      for (const e of prev.entries ?? []) bySpot.set(e.spotKey, e);
    } catch {
      /* 壊れていたら作り直す */
    }
  }

  // FLOP_COUNT=all は trips を除いた全代表フロップ(1755-ペア/トリップス除外分)。
  const allFlops = canonicalFlops().filter((f) => !texture(f).startsWith("trips"));
  const flops = flopAll ? allFlops : stratifiedSubset(canonicalFlops(), FLOP_COUNT);
  // band ごとの対象ペア。
  const matchupsFor = (band: string) => (matchupsAuto ? autoMatchups(band) : MATCHUPS.filter((m) => getVsOpenCallRange(band, m.opener, m.defender)));
  const totalTarget = BANDS.reduce((s, b) => s + matchupsFor(b).length * flops.length, 0);
  console.error(
    `[genPostflopSolutions] flops=${flops.length} bands=${BANDS.join(",")} matchups=${matchupsAuto ? "auto" : MATCHUPS.map((m) => `${m.opener}v${m.defender}`).join(",")} target=${totalTarget} iter=${ITER} sample=${SAMPLE} sizes=${BETSIZES.join("/")}`,
  );

  let solved = 0;
  const t0 = Date.now();
  for (const band of BANDS) {
    for (const { opener, defender } of matchupsFor(band)) {
      for (const board of flops) {
        const key = gtoPostflopSpotKey(band, opener, defender, board);
        if (bySpot.has(key)) {
          solved++;
          continue;
        }
        const handle = await prepareGtoPostflopSpot({
          band,
          openerPos: opener,
          defenderPos: defender,
          board,
          quality: { iterations: ITER, sampleChance: SAMPLE, betSizes: BETSIZES },
        });
        solved++;
        if (!handle || !handle.snapshot) continue;
        const c = gtoPostflopSpotComponents(band, opener, defender, board);
        bySpot.set(key, { spotKey: key, ...c, solution: handle.snapshot() });
        if (solved % 4 === 0 || solved === totalTarget) {
          const el = (Date.now() - t0) / 1000;
          console.error(
            `  ${solved}/${totalTarget} (${el.toFixed(0)}s, ${(el / solved).toFixed(1)}s/spot) last=${band} ${opener}v${defender} ${board.join("")}`,
          );
        }
        // インクリメンタルに保存(途中終了しても成果を残す)。
        if (solved % 8 === 0) writeBundle(dataDir, outPath, bySpot);
      }
    }
  }
  writeBundle(dataDir, outPath, bySpot);
  console.error(`[genPostflopSolutions] wrote ${bySpot.size} spots -> src/data/postflopSolutions.json`);
}

function writeBundle(dataDir: string, outPath: string, bySpot: Map<string, BundleEntry>): void {
  mkdirSync(dataDir, { recursive: true });
  const entries = [...bySpot.values()].sort((a, b) => a.spotKey.localeCompare(b.spotKey));
  writeFileSync(outPath, JSON.stringify({ model: GTO_POSTFLOP_SOLVER_VERSION, entries }, null, 0));
}

main().catch((err) => {
  console.error("[genPostflopSolutions] failed:", err);
  process.exitCode = 1;
});
