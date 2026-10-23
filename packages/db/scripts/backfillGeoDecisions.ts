/**
 * 既存ハンドを GeoDecision(GEO集計用の事前展開テーブル)へ埋め直すバックフィル。
 *
 * 実処理は `backfillGeoDecisions`(packages/db/src/geoTree.ts)に置いてあり、管理APIの
 * /api/admin/geo-backfill と同じ関数を呼ぶ。このスクリプトはCLIから叩くための薄い入口。
 *
 * 使い方:
 *   pnpm --filter @meta-geo/db exec tsx scripts/backfillGeoDecisions.ts
 *   SKIP=n で先頭 n ハンドを飛ばして続きから、CONCURRENCY=n で n ハンドずつ並べて作り直す。
 *   ONLY_MISSING=1 を付けると、まだ1行も無いハンドだけを対象にする(中断からの再開が速い)。
 */
import { prisma } from "../src/client.js";
import { backfillGeoDecisions } from "../src/geoTree.js";

async function main(): Promise<void> {
  const onlyMissing = process.env["ONLY_MISSING"] === "1";
  console.log(`[backfill] start${onlyMissing ? " (missing only)" : ""}`);

  const skip = Number(process.env["SKIP"] ?? 0) || 0;
  const concurrency = Number(process.env["CONCURRENCY"] ?? 1) || 1;
  const result = await backfillGeoDecisions({
    onlyMissing,
    skip,
    concurrency,
    onProgress: ({ total, processed, rows }) => {
      console.log(`[backfill] ${processed}/${total} hands, ${rows} decision rows`);
    },
  });

  console.log(`[backfill] done. hands=${result.processed}/${result.total} rows=${result.rows}`);
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
