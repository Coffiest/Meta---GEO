import type Stripe from "stripe";

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
