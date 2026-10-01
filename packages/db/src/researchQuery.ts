import { Prisma } from "@prisma/client";
import { prisma } from "./client.js";

/**
 * データベースタブの「データ研究」の集計(DecisionFact の GROUP BY)。
 *
 * - 軸(x)と指標(y)は**許可リスト**からだけ選べる。SQL の列名・式はここで固定し、
 *   値(ユーザーID・期間など)だけをパラメータで渡す(SQL インジェクションの余地を作らない)
 * - 集計の対象は人間の決定だけ(DecisionFact には人間の行しか作らない)。応答にも画面にも、種別を示す情報は一切出さない
 * - 件数が少ない帯は値を伏せ、件数だけ返す(個人の推測や、ばらつきの大きい値の誤読を防ぐ)
 */

export type ResearchScope = "me" | "all";

/** 軸: 帯の列(または CASE 式)と、帯の並び順。 */
export const RESEARCH_DIMENSIONS = {
  thinkBucket: { sql: `"thinkBucket"`, order: ["0-2s", "2-5s", "5-10s", "10-20s", "20s+", "timebank", "timeout", "unknown"] },
  winProbBucket: { sql: `"winProbBucket"`, order: ["<5%", "5-15%", "15-30%", "30-50%", "50%+", "unknown"] },
  itmProbBucket: { sql: `"itmProbBucket"`, order: ["<20%", "20-40%", "40-60%", "60-80%", "80%+", "unknown"] },
  bubbleStage: { sql: `"bubbleStage"`, order: ["early", "nearBubble", "bubble", "itm", "unknown"] },
  stackBucket: { sql: `"stackBucket"`, order: ["<10bb", "10-20bb", "20-40bb", "40-80bb", "80bb+"] },
  prevBigPot: { sql: `"prevBigPot"`, order: ["bigWin", "none", "bigLoss", "first"] },
  sinceBigPot: {
    sql: `CASE WHEN "handsSinceBigPot" IS NULL THEN 'none'
      WHEN "handsSinceBigPot" = 1 THEN "lastBigPotKind" || ':1'
      WHEN "handsSinceBigPot" <= 3 THEN "lastBigPotKind" || ':2-3'
      WHEN "handsSinceBigPot" <= 10 THEN "lastBigPotKind" || ':4-10'
      ELSE "lastBigPotKind" || ':11+' END`,
    order: ["win:1", "win:2-3", "win:4-10", "win:11+", "none", "loss:11+", "loss:4-10", "loss:2-3", "loss:1"],
  },
  lossStreak: {
    sql: `CASE WHEN "lossStreak" >= 3 THEN '3+' ELSE "lossStreak"::text END`,
    order: ["0", "1", "2", "3+"],
  },
  tournamentPhase: {
    sql: `CASE WHEN "handIndexInTournament" <= 10 THEN '1-10'
      WHEN "handIndexInTournament" <= 30 THEN '11-30'
      WHEN "handIndexInTournament" <= 60 THEN '31-60' ELSE '61+' END`,
    order: ["1-10", "11-30", "31-60", "61+"],
  },
  street: { sql: `"street"`, order: ["preflop", "flop", "turn", "river"] },
  position: { sql: `"position"`, order: ["UTG", "UTG1", "UTG2", "LJ", "HJ", "CO", "BTN", "BTN(SB)", "SB", "BB"] },
  betSizeBucket: { sql: `"betSizeBucket"`, order: ["<33%", "33-50%", "50-75%", "75-100%", "100%+", "allIn", "none"] },
  boardTexture: { sql: `"boardTexture"`, order: [] as string[] },
  spot: { sql: `"spot"`, order: [] as string[] },
  madeHand: { sql: `"madeHand"`, order: [] as string[] },
  gameType: { sql: `"gameType"`, order: ["sng", "mtt"] },
  playersActive: {
    sql: `CASE WHEN "playersActive" >= 4 THEN '4+' ELSE "playersActive"::text END`,
    order: ["2", "3", "4+"],
  },
} as const;

export type ResearchDimension = keyof typeof RESEARCH_DIMENSIONS;

/** 指標: 集計式と、ハンド単位(そのプレイヤーのそのハンドの最初の行だけを数える)かどうか。 */
export const RESEARCH_METRICS = {
  foldRate: { sql: `AVG(CASE WHEN "actionClass" = 'fold' THEN 1.0 ELSE 0 END)`, handLevel: false },
  passiveRate: { sql: `AVG(CASE WHEN "actionClass" = 'passive' THEN 1.0 ELSE 0 END)`, handLevel: false },
  aggressiveRate: { sql: `AVG(CASE WHEN "actionClass" = 'aggressive' THEN 1.0 ELSE 0 END)`, handLevel: false },
  allInRate: { sql: `AVG(CASE WHEN "kind" = 'allIn' THEN 1.0 ELSE 0 END)`, handLevel: false },
  avgThinkSec: { sql: `AVG("thinkMs") / 1000.0`, handLevel: false },
  medianThinkSec: { sql: `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "thinkMs") / 1000.0`, handLevel: false },
  timeoutRate: { sql: `AVG(CASE WHEN "timedOut" THEN 1.0 ELSE 0 END)`, handLevel: false },
  vpip: { sql: `AVG(CASE WHEN "handVpip" THEN 1.0 ELSE 0 END)`, handLevel: true },
  pfr: { sql: `AVG(CASE WHEN "handPfr" THEN 1.0 ELSE 0 END)`, handLevel: true },
  avgResultBb: { sql: `AVG("handResultBb")`, handLevel: true },
  showdownRate: { sql: `AVG(CASE WHEN "wentToShowdown" THEN 1.0 ELSE 0 END)`, handLevel: true },
  winRate: { sql: `AVG(CASE WHEN "wonHand" THEN 1.0 ELSE 0 END)`, handLevel: true },
} as const;

export type ResearchMetric = keyof typeof RESEARCH_METRICS;

export interface ResearchFilters {
  street?: string | undefined;
  position?: string | undefined;
  gameType?: string | undefined;
  /** 直近何日か(未指定なら全期間)。 */
  days?: number | undefined;
  /** ベットに直面していたか。 */
  facingBet?: boolean | undefined;
}

export interface ResearchCrosstabParams {
  dimension: ResearchDimension;
  metric: ResearchMetric;
  scope: ResearchScope;
  userId: string;
  filters?: ResearchFilters | undefined;
}

export interface ResearchCell {
  key: string;
  n: number;
  /** 件数が少ない帯は null(値を伏せる)。 */
  value: number | null;
}

export interface ResearchCrosstabResult {
  dimension: ResearchDimension;
  metric: ResearchMetric;
  scope: ResearchScope;
  buckets: ResearchCell[];
  overall: ResearchCell;
  minSample: number;
}

/** 値を出すのに必要な件数(全プレイヤー / 自分)。 */
export const RESEARCH_MIN_SAMPLE: Record<ResearchScope, number> = { all: 30, me: 10 };

const ALLOWED_STREETS = new Set(["preflop", "flop", "turn", "river"]);
const ALLOWED_GAME_TYPES = new Set(["sng", "mtt"]);
const ALLOWED_POSITIONS = new Set(RESEARCH_DIMENSIONS.position.order as readonly string[]);

export function isResearchDimension(x: unknown): x is ResearchDimension {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(RESEARCH_DIMENSIONS, x);
}
export function isResearchMetric(x: unknown): x is ResearchMetric {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(RESEARCH_METRICS, x);
}

/** WHERE 句(値はすべてパラメータ)。 */
export function researchWhereSql(p: ResearchCrosstabParams): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`true`];
  if (RESEARCH_METRICS[p.metric].handLevel) parts.push(Prisma.sql`"firstInHand" = true`);
  if (p.metric === "avgThinkSec" || p.metric === "medianThinkSec") parts.push(Prisma.sql`"thinkMs" IS NOT NULL`);
  if (p.scope === "me") parts.push(Prisma.sql`"userId" = ${p.userId}`);
  const f = p.filters ?? {};
  if (f.street && ALLOWED_STREETS.has(f.street)) parts.push(Prisma.sql`"street" = ${f.street}`);
  if (f.gameType && ALLOWED_GAME_TYPES.has(f.gameType)) parts.push(Prisma.sql`"gameType" = ${f.gameType}`);
  if (f.position && ALLOWED_POSITIONS.has(f.position)) parts.push(Prisma.sql`"position" = ${f.position}`);
  if (typeof f.days === "number" && f.days > 0 && f.days <= 3650) {
    parts.push(Prisma.sql`"createdAt" >= ${new Date(Date.now() - f.days * 86400000)}`);
  }
  if (f.facingBet === true) parts.push(Prisma.sql`"facingBb" IS NOT NULL`);
  if (f.facingBet === false) parts.push(Prisma.sql`"facingBb" IS NULL`);
  return Prisma.join(parts, " AND ");
}

const cache = new Map<string, { at: number; data: ResearchCrosstabResult }>();
const CACHE_MS = 5 * 60 * 1000;

/** 軸 × 指標のクロス集計。 */
export async function researchCrosstab(p: ResearchCrosstabParams): Promise<ResearchCrosstabResult> {
  const key = JSON.stringify({ ...p, userId: p.scope === "me" ? p.userId : "" });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const dim = RESEARCH_DIMENSIONS[p.dimension];
  const metric = RESEARCH_METRICS[p.metric];
  const where = researchWhereSql(p);
  const dimSql = Prisma.raw(dim.sql);
  const metricSql = Prisma.raw(metric.sql);

  const rows = await prisma.$queryRaw<{ bucket: string | null; n: number; value: number | null }[]>(
    Prisma.sql`SELECT ${dimSql} AS bucket, COUNT(*)::int AS n, (${metricSql})::float8 AS value
      FROM "DecisionFact" WHERE ${where} GROUP BY 1`
  );
  const total = await prisma.$queryRaw<{ n: number; value: number | null }[]>(
    Prisma.sql`SELECT COUNT(*)::int AS n, (${metricSql})::float8 AS value FROM "DecisionFact" WHERE ${where}`
  );

  const min = RESEARCH_MIN_SAMPLE[p.scope];
  const order = dim.order as readonly string[];
  const buckets = rows
    .filter((r) => r.bucket !== null)
    .map((r) => ({ key: r.bucket!, n: r.n, value: r.n >= min ? r.value : null }))
    .sort((a, b) => {
      const ia = order.indexOf(a.key);
      const ib = order.indexOf(b.key);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return b.n - a.n;
    });
  const t = total[0] ?? { n: 0, value: null };
  const data: ResearchCrosstabResult = {
    dimension: p.dimension,
    metric: p.metric,
    scope: p.scope,
    buckets,
    overall: { key: "overall", n: t.n, value: t.n >= min ? t.value : null },
    minSample: min,
  };
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return data;
}

/** 研究データの件数(画面の見出しに出す)。人間の行のみ。 */
export async function researchSampleCount(scope: ResearchScope, userId: string): Promise<{ decisions: number; hands: number }> {
  const where = scope === "me" ? { userId } : {};
  const [decisions, hands] = await Promise.all([
    prisma.decisionFact.count({ where }),
    prisma.decisionFact.count({ where: { ...where, firstInHand: true } }),
  ]);
  return { decisions, hands };
}
