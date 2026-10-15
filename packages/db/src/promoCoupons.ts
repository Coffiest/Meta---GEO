import { randomInt } from "node:crypto";
import { prisma } from "./client.js";
import { isPartnerCodeTaken } from "./partners.js";
import { parsePlan, type PlanId } from "./plans.js";

/**
 * 管理者が自由に発行するクーポン(オーナー指示 2026-10-15)。料金のシートのコード入力欄で使う。
 *
 * - 割引(percent): 「プラチナ 初月30%OFF」「最初の3ヶ月 50%OFF」「初月無料(100%)」。
 *   Stripe のクーポン(○% を○ヶ月)とプロモーションコードを発行時に作り、決済に付ける。
 * - 無料体験(trial): 「シルバー3日間無料」「プラチナ1週間無料」。Stripe のプロモーションコードでは
 *   体験を表せないので、決済を作るときに体験の日数として付ける(コードは DB だけで管理)。
 * - どのプランで使えるか・入力できる期限・使える人数の上限を決められる。1人が同じコードを使えるのは1回。
 * - ここは DB だけ。Stripe のクーポンを作る・止めるのはサーバー(promoCouponStripe)が行う。
 */

export type PromoCouponKind = "percent" | "trial";

export interface PromoCouponRow {
  id: string;
  code: string;
  note: string | null;
  plan: PlanId | null;
  kind: PromoCouponKind;
  percentOff: number | null;
  durationMonths: number | null;
  trialDays: number | null;
  expiresAt: Date | null;
  maxRedemptions: number | null;
  active: boolean;
  stripeCouponId: string | null;
  stripePromotionCodeId: string | null;
  createdAt: Date;
  /** 使って加入した人数。 */
  redeemed: number;
}

/** 読み間違えやすい I/O/0/1 を除いた文字。 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizePromoCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** 4〜20文字の大文字英数字(Stripe のプロモーションコードに使える形)。 */
export function isValidPromoCode(code: string): boolean {
  return /^[A-Z0-9]{4,20}$/.test(code);
}

/** コードの指定が無いときに作る("PA" + 6文字)。 */
export function generatePromoCode(): string {
  let body = "";
  for (let i = 0; i < 6; i++) body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `PA${body}`;
}

/** インフルエンサーのコードとも重ならないこと(料金のシートの入力欄は1つなので、どちらのコードかを一意に決める)。 */
export async function isPromoCodeTaken(code: string): Promise<boolean> {
  // isPartnerCodeTaken はクーポンの表も見る。
  return isPartnerCodeTaken(code);
}

/** 発行の入力。範囲の外は呼び出し側(API)で 400 にする。 */
export interface PromoCouponInput {
  code: string;
  note: string | null;
  plan: PlanId | null;
  kind: PromoCouponKind;
  percentOff: number | null;
  durationMonths: number | null;
  trialDays: number | null;
  expiresAt: Date | null;
  maxRedemptions: number | null;
}

/** 入力の検査。問題があればエラーの種類を返す。 */
export function validatePromoCouponInput(input: PromoCouponInput): string | null {
  if (!isValidPromoCode(input.code)) return "invalid_code";
  if (input.kind === "percent") {
    if (!Number.isInteger(input.percentOff) || input.percentOff! < 1 || input.percentOff! > 100) return "invalid_percent";
    if (!Number.isInteger(input.durationMonths) || input.durationMonths! < 1 || input.durationMonths! > 36) return "invalid_months";
  } else if (input.kind === "trial") {
    if (!Number.isInteger(input.trialDays) || input.trialDays! < 1 || input.trialDays! > 365) return "invalid_days";
  } else {
    return "invalid_kind";
  }
  if (input.maxRedemptions !== null && (!Number.isInteger(input.maxRedemptions) || input.maxRedemptions < 1)) return "invalid_max";
  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) return "invalid_expiry";
  return null;
}

type DbCoupon = Awaited<ReturnType<typeof prisma.promoCoupon.findFirstOrThrow>> & { _count?: { redemptions: number } };

function toRow(c: DbCoupon): PromoCouponRow {
  return {
    id: c.id,
    code: c.code,
    note: c.note,
    plan: parsePlan(c.plan),
    kind: c.kind === "trial" ? "trial" : "percent",
    percentOff: c.percentOff,
    durationMonths: c.durationMonths,
    trialDays: c.trialDays,
    expiresAt: c.expiresAt,
    maxRedemptions: c.maxRedemptions,
    active: c.active,
    stripeCouponId: c.stripeCouponId,
    stripePromotionCodeId: c.stripePromotionCodeId,
    createdAt: c.createdAt,
    redeemed: c._count?.redemptions ?? 0,
  };
}

export async function createPromoCoupon(
  input: PromoCouponInput & { stripeCouponId: string | null; stripePromotionCodeId: string | null },
): Promise<PromoCouponRow> {
  const c = await prisma.promoCoupon.create({ data: input, include: { _count: { select: { redemptions: true } } } });
  return toRow(c);
}

/** 一覧(新しい順)。件数は管理者が手で発行する分だけなので全件でよい。 */
export async function listPromoCoupons(): Promise<PromoCouponRow[]> {
  const rows = await prisma.promoCoupon.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { redemptions: true } } },
  });
  return rows.map(toRow);
}

export async function getPromoCoupon(id: string): Promise<PromoCouponRow | null> {
  const c = await prisma.promoCoupon.findUnique({ where: { id }, include: { _count: { select: { redemptions: true } } } });
  return c ? toRow(c) : null;
}

export async function getPromoCouponByCode(code: string): Promise<PromoCouponRow | null> {
  const c = await prisma.promoCoupon.findUnique({
    where: { code: normalizePromoCode(code) },
    include: { _count: { select: { redemptions: true } } },
  });
  return c ? toRow(c) : null;
}

export async function setPromoCouponActive(id: string, active: boolean): Promise<void> {
  await prisma.promoCoupon.update({ where: { id }, data: { active } });
}

/**
 * 削除。使って加入した人がいるコードは消さない(何で割引したかの記録になる。失効のまま残す)。
 */
export async function deletePromoCoupon(id: string): Promise<"deleted" | "has_redemptions" | "not_found"> {
  const c = await getPromoCoupon(id);
  if (!c) return "not_found";
  if (c.redeemed > 0) return "has_redemptions";
  await prisma.promoCoupon.delete({ where: { id } });
  return "deleted";
}

export type PromoCheckResult =
  | { ok: true; coupon: PromoCouponRow }
  | { ok: false; reason: "not_found" | "inactive" | "expired" | "wrong_plan" | "used_up" | "already_used" };

/** 決済を作る前の確認。そのコードを、この人がこのプランで今使えるか。 */
export async function checkPromoCoupon(code: string, plan: PlanId, userId: string, now: Date = new Date()): Promise<PromoCheckResult> {
  const coupon = await getPromoCouponByCode(code);
  if (!coupon) return { ok: false, reason: "not_found" };
  if (!coupon.active) return { ok: false, reason: "inactive" };
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (coupon.plan && coupon.plan !== plan) return { ok: false, reason: "wrong_plan" };
  if (coupon.maxRedemptions !== null && coupon.redeemed >= coupon.maxRedemptions) return { ok: false, reason: "used_up" };
  const used = await prisma.promoCouponRedemption.findUnique({
    where: { couponId_userId: { couponId: coupon.id, userId } },
    select: { id: true },
  });
  if (used) return { ok: false, reason: "already_used" };
  return { ok: true, coupon };
}

/** 加入が確定したときに記録する(何度呼んでも1行)。 */
export async function recordPromoRedemption(params: {
  couponId: string;
  userId: string;
  stripeSubscriptionId: string | null;
}): Promise<void> {
  await prisma.promoCouponRedemption.upsert({
    where: { couponId_userId: { couponId: params.couponId, userId: params.userId } },
    create: params,
    update: {},
    select: { id: true },
  });
}

/** 管理画面に出す説明(例「プラチナ 最初の3ヶ月 50%OFF」「シルバー 3日間無料」)。 */
export function describePromoCoupon(c: Pick<PromoCouponRow, "plan" | "kind" | "percentOff" | "durationMonths" | "trialDays">): string {
  const planLabel = c.plan === "silver" ? "シルバー" : c.plan === "gold" ? "ゴールド" : c.plan === "platinum" ? "プラチナ" : "全プラン";
  if (c.kind === "trial") return `${planLabel} ${c.trialDays}日間無料`;
  const months = c.durationMonths === 1 ? "初月" : `最初の${c.durationMonths}ヶ月`;
  return c.percentOff === 100 ? `${planLabel} ${months}無料` : `${planLabel} ${months} ${c.percentOff}%OFF`;
}
