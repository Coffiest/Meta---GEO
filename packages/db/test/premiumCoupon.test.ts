import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import {
  checkAndConsumeReviewQuota,
  extendPremiumCoupon,
  getPremiumCouponStatus,
  getSubscriptionStatusForUser,
} from "../src/subscriptions.js";
import {
  formatCouponCode,
  getCouponWallet,
  issueCouponForReferral,
  normalizeCouponCode,
  redeemCouponCode,
} from "../src/premiumCoupons.js";

/**
 * 「棋譜解析1ヶ月無料」クーポンと課金ゲートの結合テスト。実DB(Postgres)が必要。
 *
 * ここで固定している仕様:
 *  - 無料アクセス権はStripe契約とは別テーブルで持ち、どちらか一方でも有効なら使い放題
 *    (ORで判定し、期限は遅い方を返す)
 *  - クーポンは発行しただけでは無料期間が始まらず、コードを適用したときに始まる
 *  - コードは1枚1回だけ使える(共有された相手が先に使えばそちらに付く)
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
  await prisma.premiumCouponCode.deleteMany({
    where: { OR: [{ ownerUserId: { in: userIds } }, { redeemedByUserId: { in: userIds } }] },
  });
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

describe("クーポンコードの発行・確認・適用", () => {
  /** 招待を経由せずにクーポンを1枚用意する(コード発行ロジックは共通)。 */
  async function giveCoupon(ownerUserId: string, tag: string): Promise<string> {
    const code = await issueCouponForReferral(`fake-referral-${tag}-${RUN}`, ownerUserId, 1);
    if (!code) throw new Error("failed to issue coupon");
    return code;
  }

  it("formats codes as GEO-XXXX-XXXX and accepts them back in any shape", async () => {
    const owner = await makeUser("codefmt");
    const code = await giveCoupon(owner, "fmt");
    expect(code).toMatch(/^GEO-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    // 区切りなし・小文字・前後空白でも同じコードとして扱う。
    expect(normalizeCouponCode(` ${code.toLowerCase()} `)).toBe(code.replace(/-/g, ""));
    expect(formatCouponCode(code.replace(/-/g, ""))).toBe(code);
  });

  it("keeps the coupon listed and copyable, and starts the free period only when applied", async () => {
    const owner = await makeUser("wallet");
    const code = await giveCoupon(owner, "wallet");

    // 発行直後: 一覧に出るが無料期間はまだ始まっていない。
    const before = await getCouponWallet(owner);
    expect(before.availableCount).toBe(1);
    expect(before.coupons[0]).toMatchObject({ code, months: 1, redeemedAt: null, redeemedByMe: null });
    expect(before.premium.active).toBe(false);
    expect((await getSubscriptionStatusForUser(owner)).active).toBe(false);

    const result = await redeemCouponCode(owner, code);
    if (!result.ok) throw new Error(`expected redeem to succeed, got ${result.reason}`);
    expect(result.months).toBe(1);

    // 適用後: 棋譜解析が使い放題になり、クーポンは使用済みとして残る(履歴を消さない)。
    const after = await getCouponWallet(owner);
    expect(after.availableCount).toBe(0);
    expect(after.coupons[0]?.redeemedAt).toBeInstanceOf(Date);
    expect(after.coupons[0]?.redeemedByMe).toBe(true);
    expect(after.premium.active).toBe(true);

    const status = await getSubscriptionStatusForUser(owner);
    expect(status.active).toBe(true);
    expect(status.status).toBe("referral");
    expect(status.currentPeriodEnd?.getTime()).toBe(result.expiresAt.getTime());
    // 加入者と同じ扱い = 無料枠を消費しない。
    expect((await checkAndConsumeReviewQuota(owner, "tourCoupon")).allowed).toBe(true);
    expect(await prisma.reviewUsage.count({ where: { userId: owner } })).toBe(0);
  });

  it("stacks a second coupon onto the remaining free period", async () => {
    const owner = await makeUser("stack2");
    const firstCode = await giveCoupon(owner, "stack2a");
    const secondCode = await giveCoupon(owner, "stack2b");

    const first = await redeemCouponCode(owner, firstCode);
    const second = await redeemCouponCode(owner, secondCode);
    if (!first.ok || !second.ok) throw new Error("expected both redeems to succeed");

    // 2枚目は1枚目の期限の後ろへ伸びる(今日から起算し直さない)。
    expect(second.expiresAt.getTime()).toBeGreaterThan(first.expiresAt.getTime());
    expect((await getCouponWallet(owner)).premium.monthsGranted).toBe(2);
  });

  it("lets a coupon be used once only, by whoever pastes it first", async () => {
    const owner = await makeUser("shared");
    const friend = await makeUser("friend");
    const code = await giveCoupon(owner, "shared");

    // コードは共有できる。渡した相手が先に使えば、そちらに無料期間が付く。
    const byFriend = await redeemCouponCode(friend, code);
    if (!byFriend.ok) throw new Error("expected the friend's redeem to succeed");
    expect((await getSubscriptionStatusForUser(friend)).active).toBe(true);
    expect((await getSubscriptionStatusForUser(owner)).active).toBe(false);

    // 2回目は誰が使おうとしても弾かれる(1枚1回)。
    expect(await redeemCouponCode(owner, code)).toEqual({ ok: false, reason: "used" });
    expect(await redeemCouponCode(friend, code)).toEqual({ ok: false, reason: "used" });

    // 獲得者の一覧には「他の人が使った」として残る。
    const wallet = await getCouponWallet(owner);
    expect(wallet.availableCount).toBe(0);
    expect(wallet.coupons[0]).toMatchObject({ code, redeemedByMe: false });
  });

  it("rejects codes that do not exist", async () => {
    const userId = await makeUser("badcode");
    expect(await redeemCouponCode(userId, "GEO-ZZZZ-ZZZZ")).toEqual({ ok: false, reason: "invalid" });
    expect(await redeemCouponCode(userId, "")).toEqual({ ok: false, reason: "invalid" });
    expect(await redeemCouponCode(userId, "---")).toEqual({ ok: false, reason: "invalid" });
  });

  it("issues only one coupon per invite, even if asked twice", async () => {
    const owner = await makeUser("idempotent");
    const first = await giveCoupon(owner, "idem");
    const second = await issueCouponForReferral(`fake-referral-idem-${RUN}`, owner, 1);
    expect(second).toBe(first);
    expect(await prisma.premiumCouponCode.count({ where: { ownerUserId: owner } })).toBe(1);
  });
});
