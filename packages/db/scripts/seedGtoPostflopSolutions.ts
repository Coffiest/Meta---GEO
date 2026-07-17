/**
 * 事前計算したSRPポストフロップ解のバンドル(src/data/postflopSolutions.json)を
 * GtoSolution テーブルへ spotKey で冪等に upsert する。
 *
 *   実行: DATABASE_URL=... pnpm --filter @meta-geo/db exec tsx scripts/seedGtoPostflopSolutions.ts
 *   デプロイ時にも migrate 後に自動実行される(.github/workflows/deploy.yml)。
 *
 * バンドルが未生成/空でも失敗しない(スキップ)。生成は scripts/genPostflopSolutions.ts。
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { prisma } from "../src/client.js";
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

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, "..", "src", "data", "postflopSolutions.json");
  if (!existsSync(path)) {
    console.error("[seedGtoPostflopSolutions] no bundle (postflopSolutions.json) — nothing to seed");
    return;
  }
  const data = JSON.parse(readFileSync(path, "utf8")) as { entries?: BundleEntry[] };
  const entries = data.entries ?? [];
  if (entries.length === 0) {
    console.error("[seedGtoPostflopSolutions] bundle empty — nothing to seed");
    return;
  }

  // 直列だとデータ増加につれてseed時間が線形に伸びるため、チャンク単位で並列upsertする。
  const CONCURRENCY = 16;
  let count = 0;
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const chunk = entries.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map((e) =>
        prisma.gtoSolution.upsert({
          where: { spotKey: e.spotKey },
          create: {
            spotKey: e.spotKey,
            street: e.street,
            effStackBucket: e.effStackBucket,
            heroPos: e.heroPos,
            boardCanon: e.boardCanon,
            actionLine: e.actionLine,
            betTree: e.betTree,
            solution: e.solution as object,
            exploitability: 0,
            solverVersion: GTO_POSTFLOP_SOLVER_VERSION,
          },
          update: { solution: e.solution as object, solverVersion: GTO_POSTFLOP_SOLVER_VERSION },
        }),
      ),
    );
    count += chunk.length;
  }
  console.error(`[seedGtoPostflopSolutions] upserted ${count} postflop GtoSolution rows`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[seedGtoPostflopSolutions] failed:", err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
