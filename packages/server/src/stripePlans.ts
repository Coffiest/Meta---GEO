import type Stripe from "stripe";
import { PLAN_IDS, PLAN_PRICE_JPY, parsePlan, type PlanId } from "@meta-geo/db";

/**
 * プランと Stripe の価格の対応。
 *
 * - シルバーは今までの ¥980 の価格(env `STRIPE_PRICE_ID`)をそのまま使う(既存の加入者がそのままシルバーになる)。
 * - ゴールド・プラチナは Stripe に lookup_key(`poker_art_<plan>_monthly_v1`)の価格が無ければ、初回に自動で作る
 *   (オーナーが Stripe の管理画面で商品を作らなくてよいように)。金額を変えるときは lookup_key の版を上げる
 *   (Stripe の価格は金額を変えられないので、新しい価格を作り直す)。
 * - env `STRIPE_PRICE_ID_GOLD` / `STRIPE_PRICE_ID_PLATINUM` があればそちらを優先する。
 */
const LOOKUP_VERSION = "v1";

const PLAN_NAME: Record<PlanId, string> = {
  silver: "Poker ART シルバー",
  gold: "Poker ART ゴールド",
  platinum: "Poker ART プラチナ",
};

export function lookupKeyOf(plan: PlanId): string {
  return `poker_art_${plan}_monthly_${LOOKUP_VERSION}`;
}

function envPriceId(plan: PlanId): string | undefined {
  if (plan === "silver") return process.env["STRIPE_PRICE_ID"] || undefined;
  if (plan === "gold") return process.env["STRIPE_PRICE_ID_GOLD"] || undefined;
  return process.env["STRIPE_PRICE_ID_PLATINUM"] || undefined;
}

const priceCache = new Map<PlanId, string>();

/** プランの価格 ID(無ければ Stripe に作る)。 */
export async function resolvePriceId(stripe: Stripe, plan: PlanId): Promise<string> {
  const fromEnv = envPriceId(plan);
  if (fromEnv) return fromEnv;
  const cached = priceCache.get(plan);
  if (cached) return cached;
  const lookupKey = lookupKeyOf(plan);
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  let priceId = found.data[0]?.id;
  if (!priceId) {
    const price = await stripe.prices.create({
      currency: "jpy",
      unit_amount: PLAN_PRICE_JPY[plan],
      recurring: { interval: "month" },
      lookup_key: lookupKey,
      metadata: { plan },
      product_data: { name: PLAN_NAME[plan], metadata: { plan } },
    });
    priceId = price.id;
    console.log(`[stripePlans] created price ${priceId} for ${plan}`);
  }
  priceCache.set(plan, priceId);
  return priceId;
}

/**
 * 契約(Stripe のサブスク)がどのプランか。価格の lookup_key / metadata / env の価格 ID で決める。
 * どれにも当たらなければ null(呼び出し側は今の値のままにする)。
 */
export function planOfSubscription(subscription: Stripe.Subscription): PlanId | null {
  const price = subscription.items?.data?.[0]?.price;
  if (!price) return null;
  for (const plan of PLAN_IDS) {
    if (price.lookup_key && price.lookup_key.startsWith(`poker_art_${plan}_`)) return plan;
  }
  const fromMeta = parsePlan(price.metadata?.["plan"]);
  if (fromMeta) return fromMeta;
  for (const plan of PLAN_IDS) {
    if (envPriceId(plan) === price.id) return plan;
  }
  return null;
}

/** テスト用: 価格のキャッシュを捨てる。 */
export function clearPriceCache(): void {
  priceCache.clear();
}
