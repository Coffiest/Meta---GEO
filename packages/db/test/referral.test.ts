import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import {
  getOrCreateReferralCode,
  getReferralSummary,
  grantReferralReward,
  normalizeReferralCode,
  redeemReferralCode,
} from "../src/referral.js";
import { getSubscriptionStatusForUser } from "../src/subscriptions.js";
import { formatCouponCode, getCouponWallet } from "../src/premiumCoupons.js";

describe("referral codes (pure)", () => {
  it("normalizes hand-typed codes (case, spaces, separators)", () => {
    expect(normalizeReferralCode(" k7q-mx2a ")).toBe("K7QMX2A");
    expect(normalizeReferralCode("――")).toBe("");
  });
});

describe("referral codes and redemption (integration, real Postgres)", () => {
  const createdUserIds: string[] = [];

  async function createUser(name: string, isBot = false) {
    const user = await prisma.user.create({ data: { displayName: `ReferralTest-${name}`, isBot } });
    createdUserIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await prisma.premiumCouponCode.deleteMany({
        where: { OR: [{ ownerUserId: userId }, { redeemedByUserId: userId }] },
      });
      await prisma.referral.deleteMany({ where: { OR: [{ inviterUserId: userId }, { inviteeUserId: userId }] } });
      await prisma.premiumCoupon.deleteMany({ where: { userId } });
    }
    for (const userId of createdUserIds) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("issues a code once and returns the same one afterwards", async () => {
    const user = await createUser("Issuer");
    const first = await getOrCreateReferralCode(user.id);
    expect(first).toHaveLength(8);
    expect(first).toMatch(/^[A-HJ-NP-Z2-9]+$/); // 紛らわしいI/O/0/1は使わない
    expect(await getOrCreateReferralCode(user.id)).toBe(first);
  });

  it("lands an invite, counts it for the inviter, and records who invited whom", async () => {
    const inviter = await createUser("Inviter");
    const invitee = await createUser("Invitee");
    const code = await getOrCreateReferralCode(inviter.id);

    const result = await redeemReferralCode(invitee.id, code.toLowerCase());
    expect(result).toEqual({ ok: true, inviterDisplayName: inviter.displayName, rewardMonths: 1 });

    const inviterSummary = await getReferralSummary(inviter.id);
    expect(inviterSummary.invitedCount).toBe(1);
    expect(inviterSummary.invitees[0]?.displayName).toBe(invitee.displayName);
    expect(inviterSummary.invitedByDisplayName).toBeNull();

    const inviteeSummary = await getReferralSummary(invitee.id);
    expect(inviteeSummary.invitedByDisplayName).toBe(inviter.displayName);
    expect(inviteeSummary.invitedCount).toBe(0);
  });

  it("rejects a second redemption, your own code, and codes that don't exist", async () => {
    const inviter = await createUser("RejectInviter");
    const other = await createUser("RejectOther");
    const invitee = await createUser("RejectInvitee");
    const inviterCode = await getOrCreateReferralCode(inviter.id);
    const otherCode = await getOrCreateReferralCode(other.id);

    expect(await redeemReferralCode(invitee.id, inviterCode)).toEqual({
      ok: true,
      inviterDisplayName: inviter.displayName,
      rewardMonths: 1,
    });
    // 2回目は別のコードでも受け付けない(招待は生涯1回だけ)。
    expect(await redeemReferralCode(invitee.id, otherCode)).toEqual({ ok: false, reason: "already" });

    const selfUser = await createUser("SelfRedeemer");
    const selfCode = await getOrCreateReferralCode(selfUser.id);
    expect(await redeemReferralCode(selfUser.id, selfCode)).toEqual({ ok: false, reason: "self" });
    expect(await redeemReferralCode(selfUser.id, "ZZZZZZZZ")).toEqual({ ok: false, reason: "invalid" });
    expect(await redeemReferralCode(selfUser.id, "")).toEqual({ ok: false, reason: "invalid" });
  });

  it("never lets a BOT's code count as an invite", async () => {
    const bot = await createUser("Bot", true);
    const human = await createUser("HumanRedeemer");
    const botCode = await getOrCreateReferralCode(bot.id);
    expect(await redeemReferralCode(human.id, botCode)).toEqual({ ok: false, reason: "invalid" });
  });

  it("issues one 1-month coupon per invite, and starts no free period until it is used", async () => {
    const inviter = await createUser("RewardInviter");
    const code = await getOrCreateReferralCode(inviter.id);

    const first = await createUser("RewardInvitee1");
    await redeemReferralCode(first.id, code);

    const wallet = await getCouponWallet(inviter.id);
    expect(wallet.availableCount).toBe(1);
    expect(wallet.coupons[0]).toMatchObject({ months: 1, redeemedAt: null, redeemedByMe: null });
    expect(wallet.coupons[0]!.code).toMatch(/^GEO-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    // 発行しただけでは無料期間は始まらない(使うタイミングは本人が選ぶ)。
    expect(wallet.premium.active).toBe(false);
    expect((await getSubscriptionStatusForUser(inviter.id)).active).toBe(false);

    const second = await createUser("RewardInvitee2");
    await redeemReferralCode(second.id, code);

    const summary = await getReferralSummary(inviter.id);
    expect(summary.invitedCount).toBe(2);
    expect(summary.reward).toEqual({ monthsPerInvite: 1, couponsEarned: 2, couponsAvailable: 2 });

    // 招待された側にはクーポンは出ない(発行は招待した人のみ)。
    expect((await getCouponWallet(first.id)).availableCount).toBe(0);
  });

  it("never issues two coupons for the same invite", async () => {
    const inviter = await createUser("DoubleGrantInviter");
    const invitee = await createUser("DoubleGrantInvitee");
    const code = await getOrCreateReferralCode(inviter.id);
    await redeemReferralCode(invitee.id, code);

    const referral = await prisma.referral.findUniqueOrThrow({ where: { inviteeUserId: invitee.id } });
    const issued = await prisma.premiumCouponCode.findUniqueOrThrow({ where: { referralId: referral.id } });

    // 再発行を試みても既存のコードが返るだけ(冪等キーは PremiumCouponCode.referralId)。
    expect(await grantReferralReward(referral.id, inviter.id)).toBe(formatCouponCode(issued.code));
    expect(await prisma.premiumCouponCode.count({ where: { ownerUserId: inviter.id } })).toBe(1);
  });
});
