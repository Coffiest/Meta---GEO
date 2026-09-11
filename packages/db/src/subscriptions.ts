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
/** 招待特典のクーポンだけで有効になっている状態を表す擬似ステータス。 */
const REFERRAL_STATUS = "referral";

export interface SubscriptionStatus {
  active: boolean;
  status: string | null;
  currentPeriodEnd: Date | null;
}

/** ユーザーのサブスク状態を返す。未加入(レコード無し)ならactive=falseを返す。
 * 有効と見なすのは次の3つのOR:
 *  - Stripe由来のstatus(active/trialing)。Webhookが失効を同期するため期限判定しない
 *  - status="comp"(管理者による無料付与)。currentPeriodEndまでの期限付き
 *  - 招待特典のクーポン(PremiumCoupon)。招待1件につき1ヶ月ぶん積み上がる期限付き
 * 期限は「より遅い方」を返す(契約と特典が併存しうるため)。 */
export async function getSubscriptionStatusForUser(userId: string): Promise<SubscriptionStatus> {
  const [sub, coupon] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId } }),
    prisma.premiumCoupon.findUnique({ where: { userId } }),
  ]);
  const now = new Date();
  const couponActive = coupon != null && coupon.expiresAt > now;

  if (!sub) {
    return couponActive
      ? { active: true, status: REFERRAL_STATUS, currentPeriodEnd: coupon!.expiresAt }
      : { active: false, status: null, currentPeriodEnd: null };
  }

  const compActive = sub.status === "comp" && sub.currentPeriodEnd != null && sub.currentPeriodEnd > now;
  const subActive = ACTIVE_STATUSES.has(sub.status) || compActive;
  const ends: Date[] = [];
  if (subActive && sub.currentPeriodEnd) ends.push(sub.currentPeriodEnd);
  if (couponActive) ends.push(coupon!.expiresAt);

  return {
    active: subActive || couponActive,
    // 契約が生きていればその状態を優先し、特典だけで有効な場合は招待特典であることを示す。
    status: subActive ? sub.status : couponActive ? REFERRAL_STATUS : sub.status,
    currentPeriodEnd: ends.length > 0 ? new Date(Math.max(...ends.map((d) => d.getTime()))) : sub.currentPeriodEnd,
  };
}

/** 招待特典による無料アクセスの状態(ホームの招待カード表示用)。 */
export interface PremiumCouponStatus {
  /** いま特典で無料アクセスできるか。 */
  active: boolean;
  /** 特典の期限(未付与ならnull)。 */
  expiresAt: Date | null;
  /** 累計で付与された月数。 */
  monthsGranted: number;
}

export async function getPremiumCouponStatus(userId: string): Promise<PremiumCouponStatus> {
  const coupon = await prisma.premiumCoupon.findUnique({ where: { userId } });
  if (!coupon) return { active: false, expiresAt: null, monthsGranted: 0 };
  return {
    active: coupon.expiresAt > new Date(),
    expiresAt: coupon.expiresAt,
    monthsGranted: coupon.monthsGranted,
  };
}

/**
 * 招待特典として棋譜解析プランの無料期間を積み上げる。
 * すでに有効な期限があればその終了日から延長する(招待するほど後ろに伸びる)。
 * 期限切れ/未付与なら今日から起算する。
 */
export async function extendPremiumCoupon(userId: string, months: number): Promise<Date> {
  const existing = await prisma.premiumCoupon.findUnique({ where: { userId } });
  const now = new Date();
  const base = existing && existing.expiresAt > now ? existing.expiresAt : now;
  const expiresAt = new Date(base);
  expiresAt.setMonth(expiresAt.getMonth() + months);

  await prisma.premiumCoupon.upsert({
    where: { userId },
    create: { userId, expiresAt, monthsGranted: months },
    update: { expiresAt, monthsGranted: { increment: months } },
  });
  return expiresAt;
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

// ---- 管理者用: 無料付与(comp)とユーザー検索 ----

export type CompDurationUnit = "week" | "month";

function compPeriodEnd(unit: CompDurationUnit, amount: number, from = new Date()): Date {
  const end = new Date(from);
  if (unit === "week") end.setDate(end.getDate() + amount * 7);
  else end.setMonth(end.getMonth() + amount);
  return end;
}

/**
 * 管理者が任意ユーザーへ棋譜解析プランを無料付与する。status="comp" + currentPeriodEnd で
 * 期限管理し、期限が過ぎると getSubscriptionStatusForUser が自動的に非activeへ戻す。
 * Stripe未連携ユーザーには合成customerId(comp_userId)で行を作る(既存行があればstatusのみ更新)。
 */
export async function grantCompSubscription(params: {
  userId: string;
  unit: CompDurationUnit;
  amount: number;
}): Promise<{ currentPeriodEnd: Date }> {
  if (!Number.isFinite(params.amount) || params.amount <= 0 || params.amount > 120) {
    throw new Error("amount must be between 1 and 120");
  }
  const end = compPeriodEnd(params.unit, Math.floor(params.amount));
  await prisma.subscription.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      stripeCustomerId: `comp_${params.userId}`,
      status: "comp",
      currentPeriodEnd: end,
    },
    update: { status: "comp", currentPeriodEnd: end },
  });
  return { currentPeriodEnd: end };
}

/** 管理者による無料付与(comp)の取り消し。Stripe由来のサブスクには触れない。 */
export async function revokeCompSubscription(userId: string): Promise<boolean> {
  const result = await prisma.subscription.updateMany({
    where: { userId, status: "comp" },
    data: { status: "canceled", currentPeriodEnd: new Date() },
  });
  return result.count > 0;
}

export interface AdminUserSearchResult {
  id: string;
  displayName: string;
  email: string | null;
  createdAt: Date;
  subscription: { status: string; currentPeriodEnd: Date | null; active: boolean } | null;
}

/** 管理者画面用: プレイヤー名・メールアドレス・ユーザーIDの部分一致で検索する(Bot除外・最大20件)。 */
export async function searchUsersForAdmin(query: string): Promise<AdminUserSearchResult[]> {
  const q = query.trim();
  const users = await prisma.user.findMany({
    where: {
      isBot: false,
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { id: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      displayName: true,
      email: true,
      createdAt: true,
      subscription: { select: { status: true, currentPeriodEnd: true } },
    },
  });
  const now = new Date();
  return users.map((u) => ({
    ...u,
    subscription: u.subscription
      ? {
          ...u.subscription,
          active:
            ACTIVE_STATUSES.has(u.subscription.status) ||
            (u.subscription.status === "comp" &&
              u.subscription.currentPeriodEnd != null &&
              u.subscription.currentPeriodEnd > now),
        }
      : null,
  }));
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
