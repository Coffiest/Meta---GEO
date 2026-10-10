import { afterEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  PARTNER_COUPON_ID,
  createPartnerPromotionCode,
  ensurePartnerCoupon,
  resetPartnerCouponCache,
} from "../src/partnerStripe.js";

/** インフルエンサーのコードと Stripe の対応(偽の Stripe)。 */

afterEach(() => resetPartnerCouponCache());

function fakeStripe(opts: { couponExists: boolean }) {
  const calls = { couponCreate: [] as unknown[], promoCreate: [] as unknown[], retrieve: 0 };
  const stripe = {
    coupons: {
      retrieve: async () => {
        calls.retrieve++;
        if (!opts.couponExists) throw Object.assign(new Error("No such coupon"), { statusCode: 404 });
        return { id: PARTNER_COUPON_ID };
      },
      create: async (p: unknown) => {
        calls.couponCreate.push(p);
        return { id: PARTNER_COUPON_ID };
      },
    },
    promotionCodes: {
      create: async (p: unknown) => {
        calls.promoCreate.push(p);
        return { id: "promo_1" };
      },
    },
  } as unknown as Stripe;
  return { stripe, calls };
}

describe("partner coupon", () => {
  it("無ければ「1ヶ月30%OFF」で1回だけ作る(無料体験の ¥0 の請求で使い切られないように repeating)", async () => {
    const { stripe, calls } = fakeStripe({ couponExists: false });
    await ensurePartnerCoupon(stripe);
    await ensurePartnerCoupon(stripe);
    expect(calls.retrieve).toBe(1);
    expect(calls.couponCreate).toEqual([
      expect.objectContaining({ id: PARTNER_COUPON_ID, percent_off: 30, duration: "repeating", duration_in_months: 1 }),
    ]);
  });

  it("あれば作らない", async () => {
    const { stripe, calls } = fakeStripe({ couponExists: true });
    await ensurePartnerCoupon(stripe);
    expect(calls.couponCreate).toHaveLength(0);
  });

  it("プロモーションコードは有料会員になったことが無い人だけに限る", async () => {
    const { stripe, calls } = fakeStripe({ couponExists: true });
    const id = await createPartnerPromotionCode(stripe, { code: "HIKARU30", partnerRef: "HIKARU30" });
    expect(id).toBe("promo_1");
    expect(calls.promoCreate).toEqual([
      expect.objectContaining({
        coupon: PARTNER_COUPON_ID,
        code: "HIKARU30",
        restrictions: { first_time_transaction: true },
      }),
    ]);
  });
});
