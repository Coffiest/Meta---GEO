import type { Prisma } from "@prisma/client";
import { prisma } from "./client.js";
import { parsePlan, planAtLeast, type PlanId } from "./plans.js";

/**
 * 棋譜解析(トーナメント単位のGTO解析)の課金状態。
 * 無料プランは24時間ローリングで1回まで解析でき、それ以降は月額サブスク(使い放題)に
 * 加入すると無制限になる。Stripeのsubscriptionと stripeCustomerId/stripeSubscriptionId で
 * 対応させ、Webhookで status を同期する。
 */

const FREE_REVIEW_LIMIT = 1;
const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set(["active", "trialing"]);
/**
 * Stripe 由来の契約を、記録上の期限(currentPeriodEnd)を過ぎてもこの時間だけは有効と見なす。
 * 更新(引き落とし)の直後は Webhook や照合ジョブで新しい期限が届くまで少し遅れるため、その間に
 * 払っている人の利用を止めないための猶予。これを過ぎたら、Stripe 側の状態に関わらず無効にする
 * (Webhook の取りこぼしで、期限切れの契約が永久に有効のまま残る不具合の対策)。
 */
export const STRIPE_RENEWAL_GRACE_MS = 60 * 60 * 1000;
/** 解約済み・確定した状態。照合ジョブの対象から外す。 */
const TERMINAL_STATUSES = ["canceled", "incomplete_expired", "comp", "referral"];

/** Stripe 由来の契約がいま有効か(状態が有効で、かつ期限+猶予を過ぎていない)。 */
export function isStripeSubscriptionActive(
  sub: { status: string; currentPeriodEnd: Date | null },
  now: Date = new Date(),
): boolean {
  if (!ACTIVE_STATUSES.has(sub.status)) return false;
  // 期限が未同期(null)の行は、照合ジョブが Stripe から期限を取り直すまで有効のまま扱う。
  if (sub.currentPeriodEnd == null) return true;
  return sub.currentPeriodEnd.getTime() + STRIPE_RENEWAL_GRACE_MS > now.getTime();
}
/** 招待特典のクーポンだけで有効になっている状態を表す擬似ステータス。 */
const REFERRAL_STATUS = "referral";

export interface SubscriptionStatus {
  active: boolean;
  status: string | null;
  currentPeriodEnd: Date | null;
  /** いま使えるプラン。未加入・期限切れは null。招待特典のクーポンだけで有効な間はシルバー。 */
  plan: PlanId | null;
}

/** ユーザーのサブスク状態を返す。未加入(レコード無し)ならactive=falseを返す。
 * 有効と見なすのは次の3つのOR:
 *  - Stripe由来のstatus(active/trialing)。期限(+猶予)を過ぎたら、Webhookが届いていなくても無効
 *  - status="comp"(管理者による無料付与)。currentPeriodEndまでの期限付き
 *  - 招待特典のクーポン(PremiumCoupon)。招待1件につき1ヶ月ぶん積み上がる期限付き
 * 期限は「より遅い方」を返す(契約と特典が併存しうるため)。 */
export async function getSubscriptionStatusForUser(userId: string): Promise<SubscriptionStatus> {
  const [base, user] = await Promise.all([
    baseSubscriptionStatus(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { adminPlan: true, adminPlanUntil: true } }),
  ]);
  return withAdminPlan(base, user);
}

/** 管理者の付与(adminPlan)を重ねる。付与の方が高いプランなら付与のプランにし、未加入なら有効にする。 */
export function withAdminPlan(
  base: SubscriptionStatus,
  user: { adminPlan: string | null; adminPlanUntil: Date | null } | null,
  now = new Date()
): SubscriptionStatus {
  const plan = parsePlan(user?.adminPlan);
  if (!plan || !user?.adminPlanUntil || user.adminPlanUntil <= now) return base;
  if (base.active && planAtLeast(base.plan, plan)) return base;
  return {
    active: true,
    status: base.active ? base.status : ADMIN_STATUS,
    currentPeriodEnd: base.active ? base.currentPeriodEnd : user.adminPlanUntil,
    plan,
  };
}

/** 管理者の付与で有効になっている状態。 */
export const ADMIN_STATUS = "admin";

async function baseSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const [sub, coupon] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId } }),
    prisma.premiumCoupon.findUnique({ where: { userId } }),
  ]);
  const now = new Date();
  const couponActive = coupon != null && coupon.expiresAt > now;

  if (!sub) {
    return couponActive
      ? { active: true, status: REFERRAL_STATUS, currentPeriodEnd: coupon!.expiresAt, plan: "silver" }
      : { active: false, status: null, currentPeriodEnd: null, plan: null };
  }

  const compActive = sub.status === "comp" && sub.currentPeriodEnd != null && sub.currentPeriodEnd > now;
  const subActive = isStripeSubscriptionActive(sub, now) || compActive;
  const ends: Date[] = [];
  if (subActive && sub.currentPeriodEnd) ends.push(sub.currentPeriodEnd);
  if (couponActive) ends.push(coupon!.expiresAt);

  return {
    active: subActive || couponActive,
    // 契約が生きていればその状態を優先し、特典だけで有効な場合は招待特典であることを示す。
    status: subActive ? sub.status : couponActive ? REFERRAL_STATUS : sub.status,
    currentPeriodEnd: ends.length > 0 ? new Date(Math.max(...ends.map((d) => d.getTime()))) : sub.currentPeriodEnd,
    // 契約が生きていれば契約のプラン、特典だけならシルバー。
    plan: subActive ? (parsePlan(sub.plan) ?? "silver") : couponActive ? "silver" : null,
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
export async function extendPremiumCoupon(userId: string, months: number, days?: number | null): Promise<Date> {
  const existing = await prisma.premiumCoupon.findUnique({ where: { userId } });
  const now = new Date();
  const base = existing && existing.expiresAt > now ? existing.expiresAt : now;
  const expiresAt = new Date(base);
  // 日数の指定があればそちら(招待の特典は1週間)。月数の累計には数えない。
  if (days != null) {
    expiresAt.setDate(expiresAt.getDate() + days);
    months = 0;
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + months);
  }

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
  /** 契約の価格から決めたプラン。分からなければ省略(今の値のまま)。 */
  plan?: PlanId | null;
}): Promise<void> {
  await prisma.subscription.updateMany({
    where: { stripeCustomerId: params.stripeCustomerId },
    data: {
      stripeSubscriptionId: params.stripeSubscriptionId,
      status: params.status,
      currentPeriodEnd: params.currentPeriodEnd,
      ...(params.plan ? { plan: params.plan } : {}),
    },
  });
}

/**
 * Stripe と照合が必要な契約(照合ジョブ用)。
 * - 期限(+猶予なし)を過ぎた、または期限が未同期の、終わっていない契約: 更新されたか・引き落としに失敗したかを確かめる
 * - 支払い遅延(past_due / unpaid): 引き落としに失敗している。自動解約の対象
 */
export async function listSubscriptionsToReconcile(now: Date = new Date(), limit = 100): Promise<
  { userId: string; stripeCustomerId: string; stripeSubscriptionId: string; status: string; currentPeriodEnd: Date | null }[]
> {
  const rows = await prisma.subscription.findMany({
    where: {
      stripeSubscriptionId: { not: null },
      status: { notIn: TERMINAL_STATUSES },
      OR: [
        { currentPeriodEnd: null },
        { currentPeriodEnd: { lte: now } },
        { status: { in: ["past_due", "unpaid"] } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { userId: true, stripeCustomerId: true, stripeSubscriptionId: true, status: true, currentPeriodEnd: true },
  });
  return rows.map((r) => ({ ...r, stripeSubscriptionId: r.stripeSubscriptionId! }));
}

/** 1ユーザーの契約が照合を要するか(状態APIで、その場で照合するかの判定)。 */
export async function subscriptionNeedsReconcile(userId: string, now: Date = new Date()): Promise<string | null> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeSubscriptionId: true, status: true, currentPeriodEnd: true },
  });
  if (!sub?.stripeSubscriptionId || TERMINAL_STATUSES.includes(sub.status)) return null;
  const due =
    sub.currentPeriodEnd == null || sub.currentPeriodEnd <= now || sub.status === "past_due" || sub.status === "unpaid";
  return due ? sub.stripeSubscriptionId : null;
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
 * - サブスク加入者は常にallowed(消費しない)。iOSアプリからでもウェブと同じ(オーナー確定)。
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

export type CompDurationUnit = "day" | "week" | "month";

/** 単位ごとの上限(どれもおよそ10年)。 */
const COMP_MAX: Record<CompDurationUnit, number> = { day: 3650, week: 520, month: 120 };

function compPeriodEnd(unit: CompDurationUnit, amount: number, from = new Date()): Date {
  const end = new Date(from);
  if (unit === "day") end.setDate(end.getDate() + amount);
  else if (unit === "week") end.setDate(end.getDate() + amount * 7);
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
  /** 付与するプラン(省略時はシルバー)。 */
  plan?: PlanId;
}): Promise<{ currentPeriodEnd: Date }> {
  if (!Number.isFinite(params.amount) || params.amount < 1 || params.amount > COMP_MAX[params.unit]) {
    throw new Error(`amount must be between 1 and ${COMP_MAX[params.unit]}`);
  }
  // Stripe の契約(Subscription 行)には触れず、User の adminPlan に持つ(支払い中の人にも付与できる)。
  const end = compPeriodEnd(params.unit, Math.floor(params.amount));
  await prisma.user.update({
    where: { id: params.userId },
    data: { adminPlan: params.plan ?? "silver", adminPlanUntil: end },
  });
  return { currentPeriodEnd: end };
}

/** 管理者による無料付与(comp)の取り消し。Stripe由来のサブスクには触れない。 */
export async function revokeCompSubscription(userId: string): Promise<boolean> {
  const [legacy, admin] = await Promise.all([
    prisma.subscription.updateMany({
      where: { userId, status: "comp" },
      data: { status: "canceled", currentPeriodEnd: new Date() },
    }),
    prisma.user.updateMany({
      where: { id: userId, adminPlan: { not: null } },
      data: { adminPlan: null, adminPlanUntil: null },
    }),
  ]);
  return legacy.count + admin.count > 0;
}

export interface AdminUserSearchResult {
  id: string;
  displayName: string;
  email: string | null;
  createdAt: Date;
  /** 友達招待のコード(メニューの「あなたの招待コード」)。本人が招待カードを開くまでは未発行(null)。 */
  referralCode: string | null;
  /** 利用停止(BAN)した時刻と理由。null = 利用停止していない。 */
  bannedAt: Date | null;
  bannedReason: string | null;
  subscription: {
    status: string;
    currentPeriodEnd: Date | null;
    active: boolean;
    plan: string;
    /** Stripe で支払っている契約か(管理者の無料付与ではない)。 */
    viaStripe: boolean;
    /** Stripe の契約が生きているか(剥奪=即時解約の対象)。 */
    stripeActive: boolean;
    /** 管理者が付与したプランと期限(期限切れなら null)。 */
    adminPlan: string | null;
    adminPlanUntil: Date | null;
  } | null;
}

/** 管理者画面用: プレイヤー名・メールアドレス・ユーザーID・招待コードの部分一致で検索する(Bot除外)。 */
export async function searchUsersForAdmin(
  query: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<{ users: AdminUserSearchResult[]; total: number }> {
  const q = query.trim();
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 20), 1), 500);
  const offset = Math.max(Math.floor(opts.offset ?? 0), 0);
  const where: Prisma.UserWhereInput = {
      isBot: false,
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { id: { contains: q, mode: "insensitive" as const } },
              // 招待コードは大文字英数字だけで保存している(表記の揺れ・ハイフンは吸収する)。
              ...(q.replace(/[^A-Za-z0-9]/g, "").length >= 3
                ? [{ referralCode: { contains: q.toUpperCase().replace(/[^A-Z0-9]/g, "") } }]
                : []),
            ],
          }
        : {}),
  };
  const [users, total] = await Promise.all([prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit,
    select: {
      id: true,
      displayName: true,
      email: true,
      createdAt: true,
      referralCode: true,
      bannedAt: true,
      bannedReason: true,
      adminPlan: true,
      adminPlanUntil: true,
      subscription: { select: { status: true, currentPeriodEnd: true, plan: true, stripeSubscriptionId: true } },
    },
  }), prisma.user.count({ where })]);
  const now = new Date();
  return {
    total,
    users: users.map((u) => {
      const sub = u.subscription;
      const stripeActive = sub != null && sub.status !== "comp" && sub.stripeSubscriptionId != null && isStripeSubscriptionActive(sub, now);
      const compActive = sub != null && sub.status === "comp" && sub.currentPeriodEnd != null && sub.currentPeriodEnd > now;
      const base: SubscriptionStatus =
        sub && (stripeActive || compActive)
          ? { active: true, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd, plan: parsePlan(sub.plan) ?? "silver" }
          : { active: false, status: sub?.status ?? null, currentPeriodEnd: sub?.currentPeriodEnd ?? null, plan: null };
      const adminActive = u.adminPlan != null && u.adminPlanUntil != null && u.adminPlanUntil > now;
      const eff = withAdminPlan(base, u, now);
      const hasAnything = sub != null || adminActive;
      return {
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        createdAt: u.createdAt,
        referralCode: u.referralCode,
        bannedAt: u.bannedAt,
        bannedReason: u.bannedReason,
        subscription: hasAnything
          ? {
              status: eff.status ?? "none",
              currentPeriodEnd: eff.currentPeriodEnd,
              active: eff.active,
              plan: eff.plan ?? "silver",
              viaStripe: stripeActive,
              stripeActive,
              adminPlan: adminActive ? u.adminPlan : null,
              adminPlanUntil: adminActive ? u.adminPlanUntil : null,
            }
          : null,
      };
    }),
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
