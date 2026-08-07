/**
 * 既存ハンドを GeoDecision(GEO集計用の事前展開テーブル)へ埋め直すバックフィル。
 *
 * 冪等: ハンド単位で delete → insert するため、何度実行しても結果は同じ。
 * 途中で止まっても、もう一度流せば続きから埋まる(既に埋めたハンドは同じ内容で作り直される)。
 *
 * 使い方:
 *   pnpm --filter @meta-geo/db exec tsx scripts/backfillGeoDecisions.ts
 *   ONLY_MISSING=1 を付けると、まだ1行も無いハンドだけを対象にする(再開が速い)。
 */
import { prisma } from "../src/client.js";
import { rebuildGeoDecisionsForHand } from "../src/geoTree.js";

const BATCH_SIZE = 200;

async function main(): Promise<void> {
  const onlyMissing = process.env["ONLY_MISSING"] === "1";

  // 対象は「人間が最低1人着席したハンド」だけ(GEOの集計対象と同じ条件)。
  const where = {
    seats: { some: { user: { isBot: false } } },
    ...(onlyMissing ? { decisions: { none: {} } } : {}),
  };

  const total = await prisma.hand.count({ where });
  console.log(`[backfill] target hands: ${total}${onlyMissing ? " (missing only)" : ""}`);

  let processed = 0;
  let rowsWritten = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.hand.findMany({
      where,
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });
    if (batch.length === 0) break;

    for (const h of batch) {
      rowsWritten += await rebuildGeoDecisionsForHand(h.id);
      processed += 1;
    }
    cursor = batch[batch.length - 1]!.id;
    console.log(`[backfill] ${processed}/${total} hands, ${rowsWritten} decision rows`);
  }

  console.log(`[backfill] done. hands=${processed} rows=${rowsWritten}`);
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
