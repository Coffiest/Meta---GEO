/**
 * 並列実行した genPostflopSolutions.ts の shard ファイル(OUT_PATH指定)群を
 * src/data/postflopSolutions.json へ spotKey 単位でマージする(冪等)。
 *
 *   実行例:
 *     pnpm --filter @meta-geo/db exec tsx scripts/mergePostflopSolutions.ts \
 *       src/data/shards/*.json
 *
 * 引数を省略すると src/data/shards/*.json を対象にする。マージ後、shard は削除しない
 * (再実行しても spotKey が重複するだけで安全)。
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GTO_POSTFLOP_SOLVER_VERSION } from "../src/gtoPostflop.js";

interface BundleEntry {
  spotKey: string;
  street: string;
  effStackBucket: string;
  heroPos: string;
  boardCanon: string;
  actionLine: string;
  betTree: string;
  solution: unknown;
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const dataDir = join(here, "..", "src", "data");
  const outPath = join(dataDir, "postflopSolutions.json");
  const shardDir = join(dataDir, "shards");

  const argPaths = process.argv.slice(2);
  const shardPaths =
    argPaths.length > 0
      ? argPaths.map((p) => join(process.cwd(), p))
      : existsSync(shardDir)
        ? readdirSync(shardDir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => join(shardDir, f))
        : [];

  const bySpot = new Map<string, BundleEntry>();
  if (existsSync(outPath)) {
    const prev = JSON.parse(readFileSync(outPath, "utf8")) as { entries?: BundleEntry[] };
    for (const e of prev.entries ?? []) bySpot.set(e.spotKey, e);
  }
  const before = bySpot.size;

  for (const p of shardPaths) {
    if (!existsSync(p)) {
      console.error(`[mergePostflopSolutions] skip missing: ${p}`);
      continue;
    }
    const shard = JSON.parse(readFileSync(p, "utf8")) as { entries?: BundleEntry[] };
    for (const e of shard.entries ?? []) bySpot.set(e.spotKey, e);
    console.error(`[mergePostflopSolutions] merged ${p} (${shard.entries?.length ?? 0} entries)`);
  }

  mkdirSync(dataDir, { recursive: true });
  const entries = [...bySpot.values()].sort((a, b) => a.spotKey.localeCompare(b.spotKey));
  writeFileSync(outPath, JSON.stringify({ model: GTO_POSTFLOP_SOLVER_VERSION, entries }, null, 0));
  console.error(`[mergePostflopSolutions] total ${before} -> ${bySpot.size} spots -> ${outPath}`);
}

main();
