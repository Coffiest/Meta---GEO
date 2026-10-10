import { Prisma } from "@prisma/client";
import { prisma } from "./client.js";

/**
 * インフルエンサー(ローンチパートナー)への報酬の台帳。仕様は docs/HANDOFF_influencer_partner.md。
 *
 * - 報酬 = 入金額(割引後・税込)の 80%。コードで始まった契約の**最初の3回分の入金**だけ。
 * - 2027年3月末(日本時間)までに始まった契約が対象。本人の加入(本人のアカウント・本人と同じカード)は対象外。
 * - 行は書き換えない。返金・チャージバックは**マイナスの行**で打ち消す(支払いの証明に使うため)。
 * - 月末締め・翌月末払い。締めた月の合計が ¥3,000 未満なら繰り越す。
 *
 * Supabase の転送量のきまり(CLAUDE.md): 大きな行を読み戻さない。必ず select を付ける。
 */

export const PARTNER_COMMISSION_RATE = 0.8;
export const PARTNER_PAYMENTS_COVERED = 3;
export const PARTNER_MIN_PAYOUT_JPY = 3000;
/** ローンチパートナー特別レートの期限。この時刻より後に始まった契約は対象外(2027-03-31 24:00 JST)。 */
export const PARTNER_PROGRAM_DEADLINE = new Date("2027-03-31T15:00:00.000Z");

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本時間の、その月の1日 0:00(UTC の Date)。締めの境目に使う。 */
export function startOfMonthJst(at: Date): Date {
  const jst = new Date(at.getTime() + JST_OFFSET_MS);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1) - JST_OFFSET_MS);
}

/** 日本時間の "2026-11" 形式。 */
export function monthKeyJst(at: Date): string {
  const jst = new Date(at.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 入金1件の報酬(円未満は切り捨て)。 */
export function commissionOf(amount: number): number {
  return Math.floor(amount * PARTNER_COMMISSION_RATE);
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** 決済画面でパートナーのコードが使われた契約を記録する。何度呼んでも1行(最初の記録が残る)。 */
export async function recordPartnerReferral(params: {
  partnerId: string;
  stripeSubscriptionId: string;
  userId: string | null;
  selfReferral: boolean;
}): Promise<void> {
  try {
    await prisma.partnerReferral.create({ data: params, select: { id: true } });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
}

export async function hasPartnerReferral(stripeSubscriptionId: string): Promise<boolean> {
  const row = await prisma.partnerReferral.findUnique({ where: { stripeSubscriptionId }, select: { id: true } });
  return row !== null;
}

/** その支払い(Stripe の charge)が台帳に載っているか。返金の通知のたびに Stripe へ問い合わせないための確認。 */
export async function hasPartnerCharge(stripeChargeId: string): Promise<boolean> {
  const row = await prisma.partnerLedger.findFirst({ where: { stripeChargeId, kind: "payment" }, select: { id: true } });
  return row !== null;
}

export type PartnerPaymentResult = "recorded" | "not_referred" | "zero" | "beyond_covered" | "duplicate";

/**
 * 入金(Stripe の請求書の支払い)を台帳に載せる。コードで始まった契約の最初の3回分だけ。¥0 の請求(無料体験)は数えない。
 * 同じ請求書は2回載せない(Webhook の再送)。
 */
export async function recordPartnerPayment(params: {
  stripeSubscriptionId: string;
  stripeInvoiceId: string;
  stripeChargeId: string | null;
  amount: number;
  plan: string | null;
  occurredAt: Date;
}): Promise<PartnerPaymentResult> {
  const referral = await prisma.partnerReferral.findUnique({
    where: { stripeSubscriptionId: params.stripeSubscriptionId },
    select: { id: true, partnerId: true, selfReferral: true, createdAt: true },
  });
  if (!referral) return "not_referred";
  if (params.amount <= 0) return "zero";
  const existing = await prisma.partnerLedger.findUnique({ where: { sourceId: params.stripeInvoiceId }, select: { id: true } });
  if (existing) return "duplicate";
  const paid = await prisma.partnerLedger.count({ where: { referralId: referral.id, kind: "payment" } });
  if (paid >= PARTNER_PAYMENTS_COVERED) return "beyond_covered";

  const voidReason = referral.selfReferral ? "self" : referral.createdAt > PARTNER_PROGRAM_DEADLINE ? "expired" : null;
  try {
    await prisma.partnerLedger.create({
      data: {
        partnerId: referral.partnerId,
        referralId: referral.id,
        kind: "payment",
        sourceId: params.stripeInvoiceId,
        stripeInvoiceId: params.stripeInvoiceId,
        stripeChargeId: params.stripeChargeId,
        paymentIndex: paid + 1,
        plan: params.plan,
        amount: params.amount,
        commission: voidReason ? 0 : commissionOf(params.amount),
        voidReason,
        occurredAt: params.occurredAt,
      },
      select: { id: true },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return "duplicate";
    throw err;
  }
  return "recorded";
}

/**
 * 返金・チャージバックを、元の入金を打ち消すマイナスの行として載せる。元の入金が台帳に無ければ何もしない。
 * 報酬の打ち消しは、元の報酬の残りを超えない(全額返金でちょうど 0 になる)。
 */
export async function recordPartnerReversal(params: {
  kind: "refund" | "dispute";
  sourceId: string;
  stripeChargeId: string;
  amount: number;
  occurredAt: Date;
}): Promise<boolean> {
  if (params.amount <= 0) return false;
  const payment = await prisma.partnerLedger.findFirst({
    where: { stripeChargeId: params.stripeChargeId, kind: "payment" },
    select: { id: true, partnerId: true, referralId: true, stripeInvoiceId: true, paymentIndex: true, plan: true, commission: true },
  });
  if (!payment) return false;
  const reversed = await prisma.partnerLedger.aggregate({
    where: { stripeChargeId: params.stripeChargeId, kind: { in: ["refund", "dispute"] } },
    _sum: { commission: true },
  });
  const remaining = payment.commission + (reversed._sum.commission ?? 0);
  const commission = -Math.max(0, Math.min(remaining, Math.ceil(params.amount * PARTNER_COMMISSION_RATE)));
  try {
    await prisma.partnerLedger.create({
      data: {
        partnerId: payment.partnerId,
        referralId: payment.referralId,
        kind: params.kind,
        sourceId: params.sourceId,
        stripeInvoiceId: payment.stripeInvoiceId,
        stripeChargeId: params.stripeChargeId,
        paymentIndex: payment.paymentIndex,
        plan: payment.plan,
        amount: -params.amount,
        commission,
        voidReason: null,
        occurredAt: params.occurredAt,
      },
      select: { id: true },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
  return true;
}

export interface PartnerBalance {
  partnerId: string;
  /** 加入者の数(本人の加入を除く)。 */
  referrals: number;
  /** 今月(締め前)の報酬。来月末に払う。 */
  accruing: number;
  /** 締めた月の未払いの合計。¥3,000 以上なら今月末に払う。 */
  payable: number;
  paidTotal: number;
}

/** パートナーごとの残高。集計はDBで行い、小さな結果だけを読む。 */
export async function partnerBalances(now = new Date(), onlyPartnerId?: string): Promise<PartnerBalance[]> {
  const cutoff = startOfMonthJst(now);
  const only = onlyPartnerId ? { partnerId: onlyPartnerId } : {};
  const [referrals, accruing, payable, paid] = await Promise.all([
    prisma.partnerReferral.groupBy({ by: ["partnerId"], where: { ...only, selfReferral: false }, _count: { _all: true } }),
    prisma.partnerLedger.groupBy({
      by: ["partnerId"],
      where: { ...only, payoutId: null, occurredAt: { gte: cutoff } },
      _sum: { commission: true },
    }),
    prisma.partnerLedger.groupBy({
      by: ["partnerId"],
      where: { ...only, payoutId: null, occurredAt: { lt: cutoff } },
      _sum: { commission: true },
    }),
    prisma.partnerPayout.groupBy({ by: ["partnerId"], where: only, _sum: { amount: true } }),
  ]);
  const ids = new Set<string>([
    ...referrals.map((r) => r.partnerId),
    ...accruing.map((r) => r.partnerId),
    ...payable.map((r) => r.partnerId),
    ...paid.map((r) => r.partnerId),
  ]);
  return [...ids].map((partnerId) => ({
    partnerId,
    referrals: referrals.find((r) => r.partnerId === partnerId)?._count._all ?? 0,
    accruing: accruing.find((r) => r.partnerId === partnerId)?._sum.commission ?? 0,
    payable: payable.find((r) => r.partnerId === partnerId)?._sum.commission ?? 0,
    paidTotal: paid.find((r) => r.partnerId === partnerId)?._sum.amount ?? 0,
  }));
}

export type MarkPaidResult = { ok: true; payoutId: string; amount: number } | { ok: false; reason: "below_minimum"; amount: number };

/**
 * 締めた月の未払いの行をまとめて「振込済み」にする(振り込んだあとに管理者が押す)。¥3,000 未満なら何もしない。
 */
export async function markPartnerPaid(partnerId: string, now = new Date(), note: string | null = null): Promise<MarkPaidResult> {
  const closedBefore = startOfMonthJst(now);
  return prisma.$transaction(async (tx) => {
    const where = { partnerId, payoutId: null, occurredAt: { lt: closedBefore } };
    const sum = await tx.partnerLedger.aggregate({ where, _sum: { commission: true } });
    const amount = sum._sum.commission ?? 0;
    if (amount < PARTNER_MIN_PAYOUT_JPY) return { ok: false as const, reason: "below_minimum" as const, amount };
    const payout = await tx.partnerPayout.create({ data: { partnerId, amount, closedBefore, note }, select: { id: true } });
    await tx.partnerLedger.updateMany({ where, data: { payoutId: payout.id } });
    return { ok: true as const, payoutId: payout.id, amount };
  });
}

export interface PartnerLedgerRow {
  id: string;
  kind: string;
  stripeInvoiceId: string | null;
  paymentIndex: number;
  plan: string | null;
  amount: number;
  commission: number;
  voidReason: string | null;
  occurredAt: Date;
  payoutId: string | null;
  referralId: string;
}

/** 1人分の台帳(新しい順)。明細ページと CSV に使う。 */
export async function partnerLedgerRows(partnerId: string, limit = 2000): Promise<PartnerLedgerRow[]> {
  return prisma.partnerLedger.findMany({
    where: { partnerId },
    orderBy: { occurredAt: "desc" },
    take: limit,
    select: {
      id: true,
      kind: true,
      stripeInvoiceId: true,
      paymentIndex: true,
      plan: true,
      amount: true,
      commission: true,
      voidReason: true,
      occurredAt: true,
      payoutId: true,
      referralId: true,
    },
  });
}

export async function partnerPayouts(partnerId: string): Promise<{ id: string; amount: number; closedBefore: Date; paidAt: Date }[]> {
  return prisma.partnerPayout.findMany({
    where: { partnerId },
    orderBy: { paidAt: "desc" },
    select: { id: true, amount: true, closedBefore: true, paidAt: true },
  });
}
