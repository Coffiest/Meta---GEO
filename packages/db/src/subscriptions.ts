import { prisma } from "./client.js";

/**
 * GEO戦略DB(レンジ分析)の課金状態。無料プランは1日あたりの閲覧回数制限付きで、
 * サブスク未加入でも一定回数まではGEO APIを利用できる(checkAndIncrementDailyGeoView)。
 */

const FREE_DAILY_VIEW_LIMIT = 5;
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

/** StripeのCustomerIdを取得。無ければ作成する(userId+stripeCustomerIdの対応付けのみ、Stripe側の作成は呼び出し元で行う)。 */
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

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface DailyViewCheck {
  /** 今回の閲覧を許可するか(サブスク加入者は常にtrue) */
  allowed: boolean;
  /** 本日の残り無料閲覧回数(サブスク加入者はlimitと同じ値を返さず、常にFREE_DAILY_VIEW_LIMITを返す) */
  remaining: number;
  limit: number;
}

/**
 * サブスク未加入ユーザーの無料枠を判定し、許可される場合は当日のカウントをインクリメントする。
 * サブスク加入者は常にallowed=trueで、カウントは消費しない。
 */
export async function checkAndIncrementDailyGeoView(userId: string): Promise<DailyViewCheck> {
  const { active } = await getSubscriptionStatusForUser(userId);
  if (active) return { allowed: true, remaining: FREE_DAILY_VIEW_LIMIT, limit: FREE_DAILY_VIEW_LIMIT };

  const date = todayDateString();
  const usage = await prisma.geoViewUsage.findUnique({ where: { userId_date: { userId, date } } });
  const currentCount = usage?.count ?? 0;

  if (currentCount >= FREE_DAILY_VIEW_LIMIT) {
    return { allowed: false, remaining: 0, limit: FREE_DAILY_VIEW_LIMIT };
  }

  await prisma.geoViewUsage.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, count: 1 },
    update: { count: currentCount + 1 },
  });

  return { allowed: true, remaining: FREE_DAILY_VIEW_LIMIT - (currentCount + 1), limit: FREE_DAILY_VIEW_LIMIT };
}

/** 本日の残り無料閲覧回数を消費せずに確認する(ステータス表示用)。 */
export async function getDailyGeoViewRemaining(userId: string): Promise<DailyViewCheck> {
  const { active } = await getSubscriptionStatusForUser(userId);
  if (active) return { allowed: true, remaining: FREE_DAILY_VIEW_LIMIT, limit: FREE_DAILY_VIEW_LIMIT };

  const date = todayDateString();
  const usage = await prisma.geoViewUsage.findUnique({ where: { userId_date: { userId, date } } });
  const currentCount = usage?.count ?? 0;
  const remaining = Math.max(0, FREE_DAILY_VIEW_LIMIT - currentCount);
  return { allowed: remaining > 0, remaining, limit: FREE_DAILY_VIEW_LIMIT };
}
