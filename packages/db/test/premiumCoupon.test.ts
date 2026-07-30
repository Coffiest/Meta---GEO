import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import {
  checkAndConsumeReviewQuota,
  extendPremiumCoupon,
  getPremiumCouponStatus,
  getSubscriptionStatusForUser,
} from "../src/subscriptions.js";

/**
 * 招待特典クーポン(PremiumCoupon)と棋譜解析の課金ゲートの結合テスト。実DB(Postgres)が必要。
 * 特典はStripe契約とは別テーブルで持ち、どちらか一方でも有効なら棋譜解析を使い放題にする
 * ——という「ORで判定し、期限は遅い方を返す」挙動をここで固定する。
 */

const RUN = Date.now();
const userIds: string[] = [];

async function makeUser(tag: string): Promise<string> {
  const user = await prisma.user.create({ data: { displayName: `Coupon-${tag}-${RUN}` } });
  userIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  await prisma.reviewUsage.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.premiumCoupon.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("extendPremiumCoupon", () => {
  it("stacks months onto a still-valid expiry instead of restarting from today", async () => {
    const userId = await makeUser("stack");
    const first = await extendPremiumCoupon(userId, 1);
    const second = await extendPremiumCoupon(userId, 1);

    // 2ヶ月ぶん = 1件目の期限からさらに1ヶ月先。
    expect(second.getTime()).toBeGreaterThan(first.getTime());
    const monthsFromNow = (second.getTime() - Date.now()) / 86_400_000;
    expect(monthsFromNow).toBeGreaterThan(55);

    expect(await getPremiumCouponStatus(userId)).toMatchObject({ active: true, monthsGranted: 2 });
  });

  it("restarts from today once the previous coupon has expired", async () => {
    const userId = await makeUser("expired");
    await extendPremiumCoupon(userId, 1);
    // 期限切れの状態を作る。
    const past = new Date(Date.now() - 86_400_000);
    await prisma.premiumCoupon.update({ where: { userId }, data: { expiresAt: past } });
    expect(await getPremiumCouponStatus(userId)).toMatchObject({ active: false, monthsGranted: 1 });
    expect((await getSubscriptionStatusForUser(userId)).active).toBe(false);

    const renewed = await extendPremiumCoupon(userId, 1);
    // 過去の期限に足すのではなく、今日から1ヶ月。
    expect(renewed.getTime()).toBeGreaterThan(Date.now());
    const daysFromNow = (renewed.getTime() - Date.now()) / 86_400_000;
    expect(daysFromNow).toBeLessThan(32);
    expect(await getPremiumCouponStatus(userId)).toMatchObject({ active: true, monthsGranted: 2 });
  });
});

describe("getSubscriptionStatusForUser (契約と特典の併存)", () => {
  it("unlocks 棋譜解析 with a coupon alone and never consumes the free quota", async () => {
    const userId = await makeUser("gate");
    await extendPremiumCoupon(userId, 1);

    const status = await getSubscriptionStatusForUser(userId);
    expect(status.active).toBe(true);
    expect(status.status).toBe("referral");

    // 加入者と同じ扱い = 何件解析しても無料枠を消費しない。
    expect((await checkAndConsumeReviewQuota(userId, "tour1")).allowed).toBe(true);
    expect((await checkAndConsumeReviewQuota(userId, "tour2")).allowed).toBe(true);
    expect(await prisma.reviewUsage.count({ where: { userId } })).toBe(0);
  });

  it("keeps the Stripe status visible and reports the later of the two expiries", async () => {
    const userId = await makeUser("both");
    const stripeEnd = new Date(Date.now() + 5 * 86_400_000);
    await prisma.subscription.create({
      data: { userId, stripeCustomerId: `cus_coupon_${RUN}`, status: "active", currentPeriodEnd: stripeEnd },
    });
    const couponEnd = await extendPremiumCoupon(userId, 1);

    const status = await getSubscriptionStatusForUser(userId);
    expect(status.active).toBe(true);
    // 契約が生きているならStripe側の状態を優先して見せる。
    expect(status.status).toBe("active");
    // 期限は遅い方(この場合はクーポン)。
    expect(status.currentPeriodEnd?.getTime()).toBe(couponEnd.getTime());
  });

  it("still honours the coupon when the Stripe subscription is canceled", async () => {
    const userId = await makeUser("canceled");
    await prisma.subscription.create({
      data: { userId, stripeCustomerId: `cus_canceled_${RUN}`, status: "canceled", currentPeriodEnd: new Date() },
    });
    const couponEnd = await extendPremiumCoupon(userId, 1);

    const status = await getSubscriptionStatusForUser(userId);
    expect(status.active).toBe(true);
    expect(status.status).toBe("referral");
    expect(status.currentPeriodEnd?.getTime()).toBe(couponEnd.getTime());
  });
});
