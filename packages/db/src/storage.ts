import { prisma } from "./client.js";

/**
 * DB容量の見える化と掃除(管理画面の「DB容量」)。
 *
 * Supabase は容量でプランが決まるので、どのテーブルがどれだけ増えているかを常に見えるようにする。
 * 大きさはテーブル本体+索引+TOAST の合計(`pg_total_relation_size`)。行数は統計の推定値(`reltuples`)で、
 * 数え上げ(COUNT)をしないので大きいテーブルでも一瞬で返る。
 */
export interface StorageTable {
  table: string;
  bytes: number;
  /** 統計上の推定行数(VACUUM/ANALYZE 前は -1 のことがある)。 */
  rows: number;
}

export interface StorageReport {
  databaseBytes: number;
  tables: StorageTable[];
  /** 記録したハンド1件あたりの平均(ハンド関連テーブルの合計 ÷ ハンド数)。 */
  bytesPerHand: number | null;
  hands: number;
}

/** ハンドを記録するたびに増えるテーブル。 */
const PER_HAND_TABLES = new Set(["Hand", "HandSeat", "HandAction", "HandPot", "GeoDecision", "DecisionFact"]);

export async function getStorageReport(): Promise<StorageReport> {
  const [tables, db, hands] = await Promise.all([
    prisma.$queryRaw<{ table: string; bytes: bigint; rows: number }[]>`
      SELECT c.relname AS "table", pg_total_relation_size(c.oid) AS bytes, c.reltuples::float8 AS rows
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema() AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC`,
    prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`,
    prisma.hand.count(),
  ]);
  const list = tables.map((t) => ({ table: t.table, bytes: Number(t.bytes), rows: Math.round(t.rows) }));
  const perHandBytes = list.filter((t) => PER_HAND_TABLES.has(t.table)).reduce((a, t) => a + t.bytes, 0);
  return {
    databaseBytes: Number(db[0]?.bytes ?? 0),
    tables: list,
    bytesPerHand: hands > 0 ? Math.round(perHandBytes / hands) : null,
    hands,
  };
}

/** 対応済みのエラー報告を、この日数を過ぎたら消す(未対応は残す)。 */
export const RESOLVED_ERROR_REPORT_RETENTION_DAYS = 90;

export async function pruneResolvedErrorReports(now: Date = new Date()): Promise<number> {
  const before = new Date(now.getTime() - RESOLVED_ERROR_REPORT_RETENTION_DAYS * 86_400_000);
  const result = await prisma.errorReport.deleteMany({ where: { resolvedAt: { not: null, lt: before } } });
  return result.count;
}
