import type Stripe from "stripe";
import {
  getPartnerByPromotionCodeId,
  getStripeCustomerId,
  hasPartnerCharge,
  hasPartnerReferral,
  prisma,
  recordPartnerPayment,
  recordPartnerReferral,
  recordPartnerReversal,
} from "@meta-geo/db";

/**
 * インフルエンサー(ローンチパートナー)のコードと Stripe の対応。仕様は docs/HANDOFF_influencer_partner.md。
 *
 * - クーポンは全員で共通の1つ(30%OFF)。無ければ初回に作る(オーナーが Stripe の管理画面で作らなくてよいように)。
 *   条件を変えるときは id の版を上げる(Stripe のクーポンは割引率・期間を変えられないので、作り直す)。
 * - 期間は「1回だけ(once)」ではなく「1ヶ月(repeating 1)」。7日間の無料体験と重なっても、体験の ¥0 の請求で
 *   割引が使い切られず、最初の有料の請求1回だけが30%OFFになる(月額なので1ヶ月の間に来る有料の請求は1回)。
 * - プロモーションコードはパートナーごと。有料会員になったことが一度も無い人だけが使える
 *   (`first_time_transaction`。既存の会員が解約してコードで入り直す抜け道を塞ぐ。オーナー承認済み)。
 */
export const PARTNER_COUPON_ID = "poker_art_partner_30_first_month_v1";
export const PARTNER_DISCOUNT_PERCENT = 30;

let couponReady = false;

/** パートナー共通のクーポンが Stripe にあることを確かめる(無ければ作る)。 */
export async function ensurePartnerCoupon(stripe: Stripe): Promise<string> {
  if (couponReady) return PARTNER_COUPON_ID;
  try {
    await stripe.coupons.retrieve(PARTNER_COUPON_ID);
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 404) throw err;
    await stripe.coupons.create({
      id: PARTNER_COUPON_ID,
      name: "Poker ART パートナー 初月30%OFF",
      percent_off: PARTNER_DISCOUNT_PERCENT,
      duration: "repeating",
      duration_in_months: 1,
      metadata: { kind: "partner" },
    });
    console.log(`[partnerStripe] created coupon ${PARTNER_COUPON_ID}`);
  }
  couponReady = true;
  return PARTNER_COUPON_ID;
}

/** パートナー1人分のプロモーションコードを作る。同じコードが既に Stripe で有効なら Stripe がエラーを返す。 */
export async function createPartnerPromotionCode(
  stripe: Stripe,
  params: { code: string; partnerRef: string },
): Promise<string> {
  const coupon = await ensurePartnerCoupon(stripe);
  const promo = await stripe.promotionCodes.create({
    coupon,
    code: params.code,
    restrictions: { first_time_transaction: true },
    metadata: { kind: "partner", partnerRef: params.partnerRef },
  });
  return promo.id;
}

export async function setPartnerPromotionCodeActive(stripe: Stripe, promotionCodeId: string, active: boolean): Promise<void> {
  await stripe.promotionCodes.update(promotionCodeId, { active });
}

/** テスト用: クーポンの確認済みの印を捨てる。 */
export function resetPartnerCouponCache(): void {
  couponReady = false;
}

/**
 * 契約にパートナーのコードが使われていれば、その契約を記録する(何度呼んでも1行)。
 * 決済画面の完了(checkout.session.completed)と、最初の入金(invoice.paid)のどちらが先に届いても記録できるように、両方から呼ぶ。
 * 割引は「1ヶ月」なので、最初の入金の時点では契約にまだ割引が付いている。
 *
 * 本人の加入(本人のアカウント・本人のカードと同じ指紋のカード)は selfReferral として記録し、報酬の対象外にする。
 */
export async function attributePartnerSubscription(stripe: Stripe, subscriptionId: string): Promise<boolean> {
  if (await hasPartnerReferral(subscriptionId)) return true;
  // Webhook の中身は受け口の API の版で形が変わるので、SDK の版で取り直す。
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["discounts", "default_payment_method"] });
  const promotionCodeId = promotionCodeOf(subscription);
  if (!promotionCodeId) return false;
  const partner = await getPartnerByPromotionCodeId(promotionCodeId);
  if (!partner) return false;
  const userId = subscription.metadata?.["userId"] ?? null;
  const pm = subscription.default_payment_method;
  const fingerprint = pm && typeof pm === "object" ? pm.card?.fingerprint ?? null : null;
  const selfReferral = await isPartnerSelf(stripe, partner.userId, userId, fingerprint);
  await recordPartnerReferral({ partnerId: partner.id, stripeSubscriptionId: subscriptionId, userId, selfReferral });
  console.log(`[partner] ${partner.code} -> ${subscriptionId}${selfReferral ? " (self)" : ""}`);
  return true;
}

function promotionCodeOf(subscription: Stripe.Subscription): string | null {
  const discounts = [...(subscription.discounts ?? []), subscription.discount].filter(Boolean);
  for (const d of discounts) {
    if (!d || typeof d === "string") continue;
    const promo = d.promotion_code;
    if (typeof promo === "string") return promo;
    if (promo && typeof promo === "object") return promo.id;
  }
  return null;
}

/** 本人の加入か。本人のアカウントそのもの、または本人の Stripe の顧客に登録されたカードと同じカード。 */
async function isPartnerSelf(
  stripe: Stripe,
  partnerUserId: string | null,
  userId: string | null,
  fingerprint: string | null,
): Promise<boolean> {
  if (!partnerUserId) return false;
  if (userId && userId === partnerUserId) return true;
  if (!fingerprint) return false;
  const customerId = await getStripeCustomerId(partnerUserId);
  if (!customerId) return false;
  const cards = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 20 });
  return cards.data.some((c) => c.card?.fingerprint === fingerprint);
}

/** 入金(invoice.paid)を台帳に載せる。コードを使っていない契約には Stripe への問い合わせをしない。 */
export async function recordPartnerInvoicePaid(stripe: Stripe, invoice: Stripe.Invoice, subscriptionId: string): Promise<void> {
  const hasDiscount = Array.isArray(invoice.discounts) && invoice.discounts.length > 0;
  if (!(await hasPartnerReferral(subscriptionId))) {
    if (!hasDiscount) return;
    if (!(await attributePartnerSubscription(stripe, subscriptionId))) return;
  }
  if (!invoice.id) return;
  const fresh = await stripe.invoices.retrieve(invoice.id);
  const charge = typeof fresh.charge === "string" ? fresh.charge : fresh.charge?.id ?? null;
  const paidAt = fresh.status_transitions?.paid_at;
  const row = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: subscriptionId }, select: { plan: true } });
  const result = await recordPartnerPayment({
    stripeSubscriptionId: subscriptionId,
    stripeInvoiceId: invoice.id,
    stripeChargeId: charge,
    amount: fresh.amount_paid,
    plan: row?.plan ?? null,
    occurredAt: paidAt ? new Date(paidAt * 1000) : new Date(),
  });
  if (result === "recorded") console.log(`[partner] payment ${invoice.id} (${fresh.amount_paid} JPY)`);
}

/** 返金(charge.refunded)を、元の入金を打ち消す行として載せる。台帳に無い入金なら何もしない。 */
export async function recordPartnerRefunds(stripe: Stripe, chargeId: string): Promise<void> {
  if (!(await hasPartnerCharge(chargeId))) return;
  const refunds = await stripe.refunds.list({ charge: chargeId, limit: 100 });
  for (const r of refunds.data) {
    if (r.status !== "succeeded") continue;
    await recordPartnerReversal({
      kind: "refund",
      sourceId: r.id,
      stripeChargeId: chargeId,
      amount: r.amount,
      occurredAt: new Date(r.created * 1000),
    });
  }
}

/** チャージバック(charge.dispute.created)。カード会社が利用者に返したお金の分を打ち消す。 */
export async function recordPartnerDispute(dispute: Stripe.Dispute): Promise<void> {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId || !(await hasPartnerCharge(chargeId))) return;
  await recordPartnerReversal({
    kind: "dispute",
    sourceId: dispute.id,
    stripeChargeId: chargeId,
    amount: dispute.amount,
    occurredAt: new Date(dispute.created * 1000),
  });
}

export type WebhookEventsStatus =
  | { state: "unknown" }
  | { state: "ok"; added: string[] }
  | { state: "no_endpoint" }
  | { state: "error"; message: string };

let webhookEventsStatus: WebhookEventsStatus = { state: "unknown" };

/** 管理者画面に出す、Webhook の通知の準備の状況(サーバー起動時に確かめた結果)。 */
export function getWebhookEventsStatus(): WebhookEventsStatus {
  return webhookEventsStatus;
}

/** このサーバーの Webhook の受け口(Stripe に登録された送信先のうち、URL がこのパスのもの)。 */
const WEBHOOK_PATH = "/api/subscriptions/webhook";

/**
 * Stripe の Webhook の送信先に、このサーバーが処理する通知(返金・チャージバックを含む)が全部選ばれているか確かめ、
 * 足りなければ足す(足すだけで、外さない)。オーナーが Stripe の管理画面で操作しなくても、
 * インフルエンサーへの報酬から返金分が差し引かれるようにするため。サーバーの起動時に1回だけ呼ぶ。
 */
export async function ensureWebhookEvents(stripe: Stripe, required: Iterable<string>): Promise<WebhookEventsStatus> {
  try {
    const list = await stripe.webhookEndpoints.list({ limit: 100 });
    const endpoints = list.data.filter((e) => e.url.includes(WEBHOOK_PATH) && e.status === "enabled");
    if (endpoints.length === 0) {
      webhookEventsStatus = { state: "no_endpoint" };
      console.warn("[partnerStripe] no Stripe webhook endpoint for", WEBHOOK_PATH);
      return webhookEventsStatus;
    }
    const added = new Set<string>();
    for (const endpoint of endpoints) {
      if (endpoint.enabled_events.includes("*")) continue;
      const missing = [...required].filter((e) => !endpoint.enabled_events.includes(e));
      if (missing.length === 0) continue;
      await stripe.webhookEndpoints.update(endpoint.id, {
        enabled_events: [...endpoint.enabled_events, ...missing] as Stripe.WebhookEndpointUpdateParams.EnabledEvent[],
      });
      missing.forEach((e) => added.add(e));
      console.log(`[partnerStripe] webhook ${endpoint.id}: added ${missing.join(", ")}`);
    }
    webhookEventsStatus = { state: "ok", added: [...added] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    webhookEventsStatus = { state: "error", message: message.slice(0, 200) };
    console.error("[partnerStripe] ensureWebhookEvents failed:", err);
  }
  return webhookEventsStatus;
}
