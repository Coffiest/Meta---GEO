/**
 * SNS運用の保存層。
 *
 * 判定・整形のロジックは packages/marketing に置いてあり、ここはその結果を残して
 * 時系列で追えるようにするだけ。ロジックとストレージを分けているのは、
 * 閾値を変えたときに「過去の判定を作り直す」ことができるようにするため。
 */
import {
  analyzeSentiment,
  analyzePost,
  dedupeKeyOf,
  type TrendItem as CollectedTrend,
} from "@meta-geo/marketing";
import { prisma } from "./client.js";

/** RSSの日時文字列を Date にする。壊れていれば null(保存はする)。 */
function parseDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface SaveTrendsResult {
  /** 新しく保存した件数。 */
  saved: number;
  /** 既に保存済みで飛ばした件数。 */
  skipped: number;
  /** 保存した中で人が見るべきもの(critical / warning)の件数。 */
  needsAttention: number;
}

/**
 * 収集したトレンドを保存する。
 *
 * 保存時にネガティブ判定も済ませて severity を持たせる。読み出しのたびに判定し直すと、
 * 辞書を更新したときに過去の一覧が勝手に変わってしまい、「昨日見たときは無かった」が
 * 起きるため。判定をやり直したいときは rescoreTrendItems を明示的に呼ぶ。
 */
export async function saveTrendItems(items: CollectedTrend[]): Promise<SaveTrendsResult> {
  let saved = 0;
  let skipped = 0;
  let needsAttention = 0;

  for (const item of items) {
    const key = dedupeKeyOf(item);
    const existing = await prisma.trendItem.findUnique({ where: { dedupeKey: key }, select: { id: true } });
    if (existing) {
      skipped += 1;
      continue;
    }
    const s = analyzeSentiment(item.title);
    await prisma.trendItem.create({
      data: {
        source: item.source,
        sourceLabel: item.sourceLabel,
        title: item.title,
        link: item.link,
        publishedAt: parseDate(item.publishedAt),
        severity: s.severity,
        severityTerms: s.hits.map((h) => h.term),
        dedupeKey: key,
      },
    });
    saved += 1;
    if (s.needsAttention) needsAttention += 1;
  }
  return { saved, skipped, needsAttention };
}

/** 一覧。既定は新しい順。severity を渡すとその深刻度以上に絞る。 */
export async function listTrendItems(options?: {
  severity?: "critical" | "warning" | "info";
  onlyUnreviewed?: boolean;
  limit?: number;
}) {
  const rank = { critical: ["critical"], warning: ["critical", "warning"], info: ["critical", "warning", "info"] };
  return prisma.trendItem.findMany({
    where: {
      ...(options?.severity ? { severity: { in: rank[options.severity] } } : {}),
      ...(options?.onlyUnreviewed ? { reviewedAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(options?.limit ?? 50, 200),
  });
}

/** 運営が確認済みにする。 */
export async function markTrendReviewed(id: string): Promise<void> {
  await prisma.trendItem.update({ where: { id }, data: { reviewedAt: new Date() } });
}

/**
 * 保存済みの判定をやり直す。
 *
 * 辞書を更新したときに使う。過去の一覧が勝手に変わらないよう、明示的に呼んだときだけ動かす。
 */
export async function rescoreTrendItems(limit = 500): Promise<{ updated: number }> {
  const rows = await prisma.trendItem.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, title: true, severity: true },
  });
  let updated = 0;
  for (const r of rows) {
    const s = analyzeSentiment(r.title);
    if (s.severity === r.severity) continue;
    await prisma.trendItem.update({
      where: { id: r.id },
      data: { severity: s.severity, severityTerms: s.hits.map((h) => h.term) },
    });
    updated += 1;
  }
  return { updated };
}

/** ② 原稿を保存する。構造分析はここで済ませて持たせる。 */
export async function saveSocialPost(input: {
  source: string;
  platform?: string | null;
  postedUrl?: string | null;
  postedAt?: Date | null;
}) {
  return prisma.socialPost.create({
    data: {
      source: input.source,
      platform: input.platform ?? null,
      postedUrl: input.postedUrl ?? null,
      postedAt: input.postedAt ?? null,
      structure: analyzePost(input.source) as unknown as object,
    },
  });
}

/** 実績を後から記録する(APIが無くても手入力で運用できるようにする)。 */
export async function recordPostMetrics(
  id: string,
  metrics: { impressions?: number; likes?: number; reposts?: number },
) {
  return prisma.socialPost.update({ where: { id }, data: metrics });
}

export async function listSocialPosts(limit = 50) {
  return prisma.socialPost.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(limit, 200) });
}

/** ①⑦ 監視対象アカウントを登録する(既にあれば名前だけ更新)。 */
export async function upsertSocialAccount(input: {
  platform: string;
  handle: string;
  label: string;
  isOwn?: boolean;
}) {
  const handle = input.handle.replace(/^@/, "");
  return prisma.socialAccount.upsert({
    where: { platform_handle: { platform: input.platform, handle } },
    create: { platform: input.platform, handle, label: input.label, isOwn: input.isOwn ?? false },
    update: { label: input.label, ...(input.isOwn === undefined ? {} : { isOwn: input.isOwn }) },
  });
}

/** ⑦ フォロワー数の記録を1件足す。 */
export async function recordAccountSnapshot(input: {
  accountId: string;
  followers: number;
  following?: number | null;
  posts?: number | null;
}) {
  return prisma.accountSnapshot.create({
    data: {
      accountId: input.accountId,
      followers: input.followers,
      following: input.following ?? null,
      posts: input.posts ?? null,
    },
  });
}

/** 監視対象と直近の推移。ダッシュボードで並べて見るためのまとめ。 */
export async function listAccountsWithTrend(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const accounts = await prisma.socialAccount.findMany({
    orderBy: [{ isOwn: "desc" }, { createdAt: "asc" }],
    include: {
      snapshots: { where: { createdAt: { gte: since } }, orderBy: { createdAt: "asc" } },
    },
  });
  return accounts.map((a) => {
    const first = a.snapshots[0];
    const last = a.snapshots[a.snapshots.length - 1];
    return {
      id: a.id,
      platform: a.platform,
      handle: a.handle,
      label: a.label,
      isOwn: a.isOwn,
      followers: last?.followers ?? null,
      /** 期間内の増減。記録が1件以下なら null(推移が出せない)。 */
      change: first && last && a.snapshots.length > 1 ? last.followers - first.followers : null,
      points: a.snapshots.map((s) => ({ at: s.createdAt, followers: s.followers })),
    };
  });
}
