import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import {
  getOrCreateReferralCode,
  getReferralSummary,
  grantReferralReward,
  nextReferralTier,
  normalizeReferralCode,
  redeemReferralCode,
  referralTierFor,
} from "../src/referral.js";
import { getSubscriptionStatusForUser } from "../src/subscriptions.js";

describe("referral tiers (pure)", () => {
  it("has no title until the first invite lands, then climbs by threshold", () => {
    expect(referralTierFor(0)).toBeNull();
    expect(referralTierFor(1)).toBe("scout");
    expect(referralTierFor(2)).toBe("scout");
    expect(referralTierFor(3)).toBe("recruiter");
    expect(referralTierFor(5)).toBe("ambassador");
    expect(referralTierFor(10)).toBe("legend");
    expect(referralTierFor(999)).toBe("legend");
  });

  it("points at the next threshold, and at nothing once the top title is reached", () => {
    expect(nextReferralTier(0)).toEqual({ key: "scout", minInvites: 1 });
    expect(nextReferralTier(1)).toEqual({ key: "recruiter", minInvites: 3 });
    expect(nextReferralTier(9)).toEqual({ key: "legend", minInvites: 10 });
    expect(nextReferralTier(10)).toBeNull();
  });

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

  it("lands an invite, counts it towards the inviter's title, and records who invited whom", async () => {
    const inviter = await createUser("Inviter");
    const invitee = await createUser("Invitee");
    const code = await getOrCreateReferralCode(inviter.id);

    const result = await redeemReferralCode(invitee.id, code.toLowerCase());
    expect(result).toEqual({ ok: true, inviterDisplayName: inviter.displayName, rewardMonths: 1 });

    const inviterSummary = await getReferralSummary(inviter.id);
    expect(inviterSummary.invitedCount).toBe(1);
    expect(inviterSummary.tier).toBe("scout");
    expect(inviterSummary.nextTier).toEqual({ key: "recruiter", minInvites: 3 });
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

  it("gives the inviter one free month of 棋譜解析 per invite, stacking the expiry", async () => {
    const inviter = await createUser("RewardInviter");
    const code = await getOrCreateReferralCode(inviter.id);

    // 招待が成立する前は特典なし = 棋譜解析は無料枠のみ。
    expect(await getSubscriptionStatusForUser(inviter.id)).toEqual({
      active: false,
      status: null,
      currentPeriodEnd: null,
    });

    const first = await createUser("RewardInvitee1");
    await redeemReferralCode(first.id, code);

    const afterFirst = await getSubscriptionStatusForUser(inviter.id);
    expect(afterFirst.active).toBe(true);
    expect(afterFirst.status).toBe("referral");
    const firstExpiry = afterFirst.currentPeriodEnd!;
    // 期限は概ね1ヶ月後(28〜31日先)。
    const daysFromNow = (firstExpiry.getTime() - Date.now()) / 86_400_000;
    expect(daysFromNow).toBeGreaterThan(27);
    expect(daysFromNow).toBeLessThan(32);

    const second = await createUser("RewardInvitee2");
    await redeemReferralCode(second.id, code);

    const summary = await getReferralSummary(inviter.id);
    expect(summary.invitedCount).toBe(2);
    expect(summary.reward).toMatchObject({ monthsPerInvite: 1, monthsGranted: 2, active: true });
    // 2件目は1件目の期限からさらに1ヶ月伸びる(今日から起算し直さない)。
    expect(summary.reward.expiresAt!.getTime()).toBeGreaterThan(firstExpiry.getTime());

    // 招待された側には特典は付かない(付与は招待した人のみ)。
    expect((await getSubscriptionStatusForUser(first.id)).active).toBe(false);
  });

  it("never grants the same invite's reward twice", async () => {
    const inviter = await createUser("DoubleGrantInviter");
    const invitee = await createUser("DoubleGrantInvitee");
    const code = await getOrCreateReferralCode(inviter.id);
    await redeemReferralCode(invitee.id, code);

    const referral = await prisma.referral.findUniqueOrThrow({ where: { inviteeUserId: invitee.id } });
    expect(referral.rewardGrantedAt).toBeInstanceOf(Date);

    // 再付与を試みても弾かれる(冪等キーは Referral.rewardGrantedAt)。
    expect(await grantReferralReward(referral.id, inviter.id)).toBeNull();
    const coupon = await prisma.premiumCoupon.findUniqueOrThrow({ where: { userId: inviter.id } });
    expect(coupon.monthsGranted).toBe(1);
  });
});
