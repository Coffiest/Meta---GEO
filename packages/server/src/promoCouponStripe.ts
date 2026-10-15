import type Stripe from "stripe";
import type { PlanId, PromoCouponInput } from "@meta-geo/db";
import { resolvePriceId } from "./stripePlans.js";

/**
 * 管理者が発行するクーポン(packages/db/src/promoCoupons.ts)と Stripe の対応。
 *
 * - 割引(percent): クーポンごとに Stripe のクーポン(○% を○ヶ月 = duration "repeating")と、同じコードの
 *   プロモーションコードを作る。プランを決めたときは、そのプランの商品だけに効くようにする(applies_to)。
 *   入力の期限・人数の上限も Stripe のプロモーションコードに持たせる(DB 側でも確かめる)。
 * - 無料体験(trial): Stripe には何も作らない。決済を作るときに体験の日数として付ける(subscriptionApi)。
 */
export async function createPromoStripeObjects(
  stripe: Stripe,
  input: PromoCouponInput,
): Promise<{ stripeCouponId: string | null; stripePromotionCodeId: string | null }> {
  if (input.kind !== "percent") return { stripeCouponId: null, stripePromotionCodeId: null };
  const products = input.plan ? [await productOfPlan(stripe, input.plan)] : null;
  const coupon = await stripe.coupons.create({
    name: `Poker ART ${input.code}`.slice(0, 40),
    percent_off: input.percentOff!,
    duration: "repeating",
    duration_in_months: input.durationMonths!,
    ...(products ? { applies_to: { products } } : {}),
    metadata: { kind: "promo", code: input.code },
  });
  const promo = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code: input.code,
    ...(input.expiresAt ? { expires_at: Math.floor(input.expiresAt.getTime() / 1000) } : {}),
    ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
    metadata: { kind: "promo" },
  });
  return { stripeCouponId: coupon.id, stripePromotionCodeId: promo.id };
}

async function productOfPlan(stripe: Stripe, plan: PlanId): Promise<string> {
  const price = await stripe.prices.retrieve(await resolvePriceId(stripe, plan));
  return typeof price.product === "string" ? price.product : price.product.id;
}

export async function setPromoStripeActive(stripe: Stripe, promotionCodeId: string | null, active: boolean): Promise<void> {
  if (!promotionCodeId) return;
  await stripe.promotionCodes.update(promotionCodeId, { active });
}
