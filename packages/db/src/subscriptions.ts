import { prisma } from "./client.js";

/**
 * 棋譜解析(トーナメント単位のGTO解析)の課金状態。
 * 無料プランは24時間ローリングで1回まで解析でき、それ以降は月額サブスク(使い放題)に
 * 加入すると無制限になる。Stripeのsubscriptionと stripeCustomerId/stripeSubscriptionId で
 * 対応させ、Webhookで status を同期する。
 */

const FREE_REVIEW_LIMIT = 1;
const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export interface SubscriptionStatus {
  active: boolean;
  status: string | null;
  currentPeriodEnd: Date | null;
}

/** ユーザーのサブスク状態を返す。未加入(レコード無し)ならactive=falseを返す。 */
export async function getSubscriptionStatusForUser(userId: string): Promise<SubscriptionStatus> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) return { active: false, status: null, currentPeriodEnd: null };
  return {
    active: ACTIVE_STATUSES.has(sub.status),
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd,
  };
}

/** StripeのCustomerIdを取得(Subscription行のみ・Stripe側の作成は呼び出し元)。 */
export async function getStripeCustomerId(userId: string): Promise<string | null> {
  const sub = await prisma.subscription.findUnique({ where: { userId }, select: { stripeCustomerId: true } });
  return sub?.stripeCustomerId ?? null;
}

/** Checkout Session作成前に、まだSubscription行が無いユーザー向けにStripe CustomerIdを登録する。 */
export async function attachStripeCustomerId(params: { userId: string; stripeCustomerId: string }): Promise<void> {
  await prisma.subscription.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      stripeCustomerId: params.stripeCustomerId,
      status: "incomplete",
    },
    update: { stripeCustomerId: params.stripeCustomerId },
  });
}

/** Stripe Webhookからのイベントでサブスク状態を同期する。stripeCustomerIdをキーに該当ユーザーを特定する。 */
export async function upsertSubscriptionFromStripeEvent(params: {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: Date | null;
}): Promise<void> {
  await prisma.subscription.updateMany({
    where: { stripeCustomerId: params.stripeCustomerId },
    data: {
      stripeSubscriptionId: params.stripeSubscriptionId,
      status: params.status,
      currentPeriodEnd: params.currentPeriodEnd,
    },
  });
}

export interface ReviewQuotaCheck {
  /** 今回の解析を許可するか(サブスク加入者は常にtrue) */
  allowed: boolean;
  /** 残り無料解析回数 */
  remaining: number;
  limit: number;
  /** 無料枠を使い切っている場合、次に無料解析できる時刻。加入者/残枠ありならnull。 */
  nextFreeAt: Date | null;
}

async function recentReviewTimes(userId: string): Promise<Date[]> {
  const since = new Date(Date.now() - ROLLING_WINDOW_MS);
  const rows = await prisma.reviewUsage.findMany({
    where: { userId, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return rows.map((r) => r.createdAt);
}

/**
 * 棋譜解析の無料枠を判定し、許可される場合は消費(行を作成)する。
 * - サブスク加入者は常にallowed(消費しない)。
 * - 同一トナメを既に解析済みなら再解析は無料(消費しない・冪等)。
 * - 直近24時間の解析件数が上限に達していれば拒否(nextFreeAt=最古の解析+24h)。
 */
export async function checkAndConsumeReviewQuota(userId: string, tournamentId: string): Promise<ReviewQuotaCheck> {
  const { active } = await getSubscriptionStatusForUser(userId);
  if (active) return { allowed: true, remaining: FREE_REVIEW_LIMIT, limit: FREE_REVIEW_LIMIT, nextFreeAt: null };

  const existing = await prisma.reviewUsage.findUnique({
    where: { userId_tournamentId: { userId, tournamentId } },
  });
  if (existing) return { allowed: true, remaining: 0, limit: FREE_REVIEW_LIMIT, nextFreeAt: null };

  const recent = await recentReviewTimes(userId);
  if (recent.length >= FREE_REVIEW_LIMIT) {
    const oldest = recent[0]!;
    return {
      allowed: false,
      remaining: 0,
      limit: FREE_REVIEW_LIMIT,
      nextFreeAt: new Date(oldest.getTime() + ROLLING_WINDOW_MS),
    };
  }

  await prisma.reviewUsage.create({ data: { userId, tournamentId } });
  return {
    allowed: true,
    remaining: Math.max(0, FREE_REVIEW_LIMIT - (recent.length + 1)),
    limit: FREE_REVIEW_LIMIT,
    nextFreeAt: null,
  };
}

/** 消費せずに残り無料枠を確認する(ステータス表示用)。 */
export async function getReviewQuotaRemaining(userId: string): Promise<ReviewQuotaCheck> {
  const { active } = await getSubscriptionStatusForUser(userId);
  if (active) return { allowed: true, remaining: FREE_REVIEW_LIMIT, limit: FREE_REVIEW_LIMIT, nextFreeAt: null };

  const recent = await recentReviewTimes(userId);
  const remaining = Math.max(0, FREE_REVIEW_LIMIT - recent.length);
  const nextFreeAt = remaining > 0 || recent.length === 0 ? null : new Date(recent[0]!.getTime() + ROLLING_WINDOW_MS);
  return { allowed: remaining > 0, remaining, limit: FREE_REVIEW_LIMIT, nextFreeAt };
}
