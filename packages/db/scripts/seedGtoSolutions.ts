/**
 * プリコンピュートした6-maxプリフロップNash(BBアンティ)を GtoSolution テーブルへ保存(upsert)する。
 * バンドルJSON(src/data/preflopNash.json)を読み、(スタック×ポジション)ごとに1行を spotKey で冪等に投入する。
 *
 *   実行: DATABASE_URL=... pnpm --filter @meta-geo/db exec tsx scripts/seedGtoSolutions.ts
 *   デプロイ時にも migrate 後に自動実行される(.github/workflows/deploy.yml)。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { prisma } from "../src/client.js";
import { spotKeyOf } from "../src/solverSpot.js";

interface PosData {
  jamFreq: number;
  jam: Record<string, number>;
}
interface StackData {
  s: number;
  positions: Record<string, PosData>;
}
interface NashData {
  model: string;
  samples: number;
  ante: string;
  stacks: StackData[];
}

const BET_TREE = "pushfold-nash-bbante-v1";
const ACTION_LINE = "rfi";

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, "..", "src", "data", "preflopNash.json"), "utf8");
  const data = JSON.parse(raw) as NashData;
  if (data.stacks.length === 0) {
    console.error("[seedGtoSolutions] no data in preflopNash.json — nothing to seed");
    return;
  }

  let count = 0;
  for (const stack of data.stacks) {
    const effStackBucket = `${stack.s}bb`;
    for (const [heroPos, pos] of Object.entries(stack.positions)) {
      const spotKey = spotKeyOf({
        street: "preflop",
        effStackBucket,
        heroPos,
        boardCanon: "",
        actionLine: ACTION_LINE,
        betTree: BET_TREE,
      });
      const solution = {
        actions: [
          { action: "allIn", freq: pos.jamFreq },
          { action: "fold", freq: 1 - pos.jamFreq },
        ],
        jam: pos.jam,
      };
      await prisma.gtoSolution.upsert({
        where: { spotKey },
        create: {
          spotKey,
          street: "preflop",
          effStackBucket,
          heroPos,
          boardCanon: "",
          actionLine: ACTION_LINE,
          betTree: BET_TREE,
          solution,
          exploitability: 0,
          solverVersion: `preflop-nash-bbante-${data.samples}`,
        },
        update: { solution, solverVersion: `preflop-nash-bbante-${data.samples}` },
      });
      count++;
    }
  }
  console.error(`[seedGtoSolutions] upserted ${count} GtoSolution rows (${data.stacks.length} stacks x positions)`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[seedGtoSolutions] failed:", err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
