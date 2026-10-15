import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import {
  checkPromoCoupon,
  createPromoCoupon,
  deletePromoCoupon,
  describePromoCoupon,
  recordPromoRedemption,
  setPromoCouponActive,
  validatePromoCouponInput,
} from "../src/promoCoupons.js";

/** 管理者が発行するクーポンの判定(使えるプラン・期限・人数・1人1回)。 */
describe("promo coupons (integration, real Postgres)", () => {
  const couponIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.promoCoupon.deleteMany({ where: { id: { in: couponIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const base = {
    note: null,
    percentOff: null,
    durationMonths: null,
    trialDays: null,
    expiresAt: null,
    maxRedemptions: null,
    stripeCouponId: null,
    stripePromotionCodeId: null,
  };
  const uniq = () => Math.random().toString(36).slice(2, 8).toUpperCase();

  it("checks plan, expiry, limit and once-per-user", async () => {
    const [a, b] = await Promise.all([
      prisma.user.create({ data: { displayName: "PromoA", isBot: false } }),
      prisma.user.create({ data: { displayName: "PromoB", isBot: false } }),
    ]);
    userIds.push(a.id, b.id);

    const trial = await createPromoCoupon({ ...base, code: `TRY${uniq()}`, plan: "silver", kind: "trial", trialDays: 3, maxRedemptions: 1 });
    couponIds.push(trial.id);
    expect(describePromoCoupon(trial)).toBe("シルバー 3日間無料");

    expect(await checkPromoCoupon(trial.code, "platinum", a.id)).toEqual({ ok: false, reason: "wrong_plan" });
    const ok = await checkPromoCoupon(trial.code.toLowerCase(), "silver", a.id);
    expect(ok.ok).toBe(true);

    await recordPromoRedemption({ couponId: trial.id, userId: a.id, stripeSubscriptionId: "sub_test" });
    await recordPromoRedemption({ couponId: trial.id, userId: a.id, stripeSubscriptionId: "sub_test" });
    expect(await checkPromoCoupon(trial.code, "silver", a.id)).toEqual({ ok: false, reason: "used_up" });

    await setPromoCouponActive(trial.id, false);
    expect(await checkPromoCoupon(trial.code, "silver", b.id)).toEqual({ ok: false, reason: "inactive" });
    // 使った人がいるコードは消さない。
    expect(await deletePromoCoupon(trial.id)).toBe("has_redemptions");

    const pct = await createPromoCoupon({ ...base, code: `OFF${uniq()}`, plan: null, kind: "percent", percentOff: 50, durationMonths: 3 });
    couponIds.push(pct.id);
    expect(describePromoCoupon(pct)).toBe("全プラン 最初の3ヶ月 50%OFF");
    await recordPromoRedemption({ couponId: pct.id, userId: a.id, stripeSubscriptionId: null });
    expect(await checkPromoCoupon(pct.code, "gold", a.id)).toEqual({ ok: false, reason: "already_used" });
    expect((await checkPromoCoupon(pct.code, "gold", b.id)).ok).toBe(true);

    const old = await createPromoCoupon({ ...base, code: `OLD${uniq()}`, plan: null, kind: "percent", percentOff: 100, durationMonths: 1, expiresAt: new Date(Date.now() - 1000) });
    couponIds.push(old.id);
    expect(describePromoCoupon(old)).toBe("全プラン 初月無料");
    expect(await checkPromoCoupon(old.code, "gold", b.id)).toEqual({ ok: false, reason: "expired" });

    expect(await checkPromoCoupon("NOPE0000", "gold", b.id)).toEqual({ ok: false, reason: "not_found" });
  });

  it("validates the input", () => {
    const input = { code: "GOOD1234", note: null, plan: null, kind: "percent" as const, percentOff: 30, durationMonths: 1, trialDays: null, expiresAt: null, maxRedemptions: null };
    expect(validatePromoCouponInput(input)).toBeNull();
    expect(validatePromoCouponInput({ ...input, percentOff: 0 })).toBe("invalid_percent");
    expect(validatePromoCouponInput({ ...input, durationMonths: 0 })).toBe("invalid_months");
    expect(validatePromoCouponInput({ ...input, code: "a" })).toBe("invalid_code");
    expect(validatePromoCouponInput({ ...input, kind: "trial", trialDays: null })).toBe("invalid_days");
    expect(validatePromoCouponInput({ ...input, expiresAt: new Date(Date.now() - 1) })).toBe("invalid_expiry");
  });
});
