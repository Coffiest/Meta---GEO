import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import {
  getOrCreateReferralCode,
  getReferralSummary,
  grantReferralReward,
  normalizeReferralCode,
  redeemReferralCode,
  settlePendingReferrals,
  REFERRAL_MONTHLY_CAP,
  REFERRAL_QUALIFY_TOURNAMENTS,
} from "../src/referral.js";
import { getSubscriptionStatusForUser } from "../src/subscriptions.js";
import { formatCouponCode, getCouponWallet, redeemCouponCode } from "../src/premiumCoupons.js";

describe("referral codes (pure)", () => {
  it("normalizes hand-typed codes (case, spaces, separators)", () => {
    expect(normalizeReferralCode(" k7q-mx2a ")).toBe("K7QMX2A");
    expect(normalizeReferralCode("――")).toBe("");
  });
});

describe("referral codes and redemption (integration, real Postgres)", () => {
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];

  /**
   * 招待された人がトーナメントを1回遊び終えたことにする。
   * actions = そのトーナメントでの自分の操作の数。timedOut なら全部時間切れ(数えない)。
   */
  async function playTournament(userId: string, actions = 6, timedOut = false) {
    const t = await prisma.tournament.create({
      data: { payouts: [100], seatCount: 6, startingStack: 1500, status: "finished", finishedAt: new Date() },
    });
    createdTournamentIds.push(t.id);
    await prisma.tournamentEntry.create({ data: { tournamentId: t.id, userId, seatIndex: 0, finishPosition: 3 } });
    const hand = await prisma.hand.create({
      data: {
        tournamentId: t.id,
        handNumber: 1,
        levelSmallBlind: 10,
        levelBigBlind: 20,
        levelAnte: 0,
        buttonFixedPos: 0,
        board: [],
        potTotal: 30,
        wonByFold: true,
      },
    });
    await prisma.handSeat.create({
      data: { handId: hand.id, userId, seatIndex: 0, startingStack: 1500, holeCards: [], resultStackDelta: 0 },
    });
    await prisma.handAction.createMany({
      data: [
        { handId: hand.id, sequenceNumber: 0, seatIndex: 0, street: "preflop", kind: "postBlind", potBefore: 0 },
        ...Array.from({ length: actions }, (_, i) => ({
          handId: hand.id,
          sequenceNumber: i + 1,
          seatIndex: 0,
          street: "preflop",
          kind: "call",
          potBefore: 30,
          timedOut,
        })),
      ],
    });
  }

  async function qualify(userId: string) {
    for (let i = 0; i < REFERRAL_QUALIFY_TOURNAMENTS; i++) await playTournament(userId);
  }

  async function createUser(name: string, isBot = false) {
    const user = await prisma.user.create({ data: { displayName: `ReferralTest-${name}`, isBot } });
    createdUserIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    for (const tournamentId of createdTournamentIds) {
      const hands = await prisma.hand.findMany({ where: { tournamentId }, select: { id: true } });
      const handIds = hands.map((h) => h.id);
      await prisma.handAction.deleteMany({ where: { handId: { in: handIds } } });
      await prisma.handSeat.deleteMany({ where: { handId: { in: handIds } } });
      await prisma.hand.deleteMany({ where: { tournamentId } });
      await prisma.tournamentEntry.deleteMany({ where: { tournamentId } });
      await prisma.tournament.delete({ where: { id: tournamentId } }).catch(() => {});
    }
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
    expect(result).toEqual({ ok: true, inviterDisplayName: inviter.displayName, status: "pending" });

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
      status: "pending",
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

  it("issues a 1-week coupon only after the invitee has really played, and starts no free period until it is used", async () => {
    const inviter = await createUser("RewardInviter");
    const code = await getOrCreateReferralCode(inviter.id);

    const first = await createUser("RewardInvitee1");
    await redeemReferralCode(first.id, code);

    // 成立しただけでは発行しない。
    let summary = await getReferralSummary(inviter.id);
    expect(summary.reward.couponsEarned).toBe(0);
    expect(summary.invitees[0]).toMatchObject({ status: "pending", progress: 0 });

    // 放置して時間切れで飛んだだけ・操作が少なすぎるトーナメントは数えない。
    await playTournament(first.id, 10, true);
    await playTournament(first.id, 2);
    await playTournament(first.id);
    summary = await getReferralSummary(inviter.id);
    expect(summary.reward.couponsEarned).toBe(0);
    expect(summary.invitees[0]).toMatchObject({ status: "pending", progress: 1 });

    for (let i = 1; i < REFERRAL_QUALIFY_TOURNAMENTS; i++) await playTournament(first.id);
    summary = await getReferralSummary(inviter.id);
    expect(summary.invitees[0]).toMatchObject({ status: "rewarded", progress: REFERRAL_QUALIFY_TOURNAMENTS });
    expect(summary.reward).toMatchObject({ daysPerInvite: 7, couponsEarned: 1, couponsAvailable: 1 });

    const wallet = await getCouponWallet(inviter.id);
    expect(wallet.coupons[0]).toMatchObject({ days: 7, redeemedAt: null, redeemedByMe: null });
    expect(wallet.coupons[0]!.code).toMatch(/^GEO-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    // 発行しただけでは無料期間は始まらない(使うタイミングは本人が選ぶ)。
    expect(wallet.premium.active).toBe(false);
    expect((await getSubscriptionStatusForUser(inviter.id)).active).toBe(false);

    // 使うと1週間だけ無料になる。
    const used = await redeemCouponCode(inviter.id, wallet.coupons[0]!.code);
    expect(used.ok).toBe(true);
    if (used.ok) {
      const days = (used.expiresAt.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThan(7.1);
    }

    // 招待された側にはクーポンは出ない(発行は招待した人のみ)。
    expect((await getCouponWallet(first.id)).availableCount).toBe(0);
  });

  it("issues at most the monthly cap; the rest wait instead of disappearing", async () => {
    const inviter = await createUser("CapInviter");
    const code = await getOrCreateReferralCode(inviter.id);
    const invitees = [];
    for (let i = 0; i <= REFERRAL_MONTHLY_CAP; i++) {
      const u = await createUser(`CapInvitee${i}`);
      await redeemReferralCode(u.id, code);
      await qualify(u.id);
      invitees.push(u);
    }
    expect(await settlePendingReferrals(inviter.id)).toBe(REFERRAL_MONTHLY_CAP);
    expect(await settlePendingReferrals(inviter.id)).toBe(0);
    const statuses = await prisma.referral.findMany({ where: { inviterUserId: inviter.id }, select: { status: true } });
    expect(statuses.filter((r) => r.status === "pending")).toHaveLength(1);

    // 30日経って枠が空けば、待っていた分が発行される。
    await prisma.referral.updateMany({
      where: { inviterUserId: inviter.id, status: "rewarded" },
      data: { rewardedAt: new Date(Date.now() - 31 * 86_400_000) },
    });
    expect(await settlePendingReferrals(inviter.id)).toBe(1);
  });

  it("never rewards an invite from the inviter's own network", async () => {
    const inviter = await createUser("NetInviter");
    const code = await getOrCreateReferralCode(inviter.id);
    // 招待した人が招待カードを開いた接続元を覚える。
    await getReferralSummary(inviter.id, { ipHash: "home-net" });

    const sock = await createUser("NetSock");
    expect(await redeemReferralCode(sock.id, code, { ipHash: "home-net" })).toMatchObject({ ok: true, status: "ineligible" });

    // 別の場所から来た1人目は待ち、同じ接続元から来た2人目は対象外。
    const a = await createUser("NetA");
    const b = await createUser("NetB");
    expect(await redeemReferralCode(a.id, code, { ipHash: "cafe" })).toMatchObject({ status: "pending" });
    expect(await redeemReferralCode(b.id, code, { ipHash: "cafe" })).toMatchObject({ status: "ineligible" });

    await qualify(sock.id);
    await qualify(b.id);
    expect(await settlePendingReferrals(inviter.id)).toBe(0);
    await qualify(a.id);
    expect(await settlePendingReferrals(inviter.id)).toBe(1);
  });

  it("never issues two coupons for the same invite", async () => {
    const inviter = await createUser("DoubleGrantInviter");
    const invitee = await createUser("DoubleGrantInvitee");
    const code = await getOrCreateReferralCode(inviter.id);
    await redeemReferralCode(invitee.id, code);
    await qualify(invitee.id);
    await settlePendingReferrals(inviter.id);

    const referral = await prisma.referral.findUniqueOrThrow({ where: { inviteeUserId: invitee.id } });
    const issued = await prisma.premiumCouponCode.findUniqueOrThrow({ where: { referralId: referral.id } });

    // 再発行を試みても既存のコードが返るだけ(冪等キーは PremiumCouponCode.referralId)。
    expect(await grantReferralReward(referral.id, inviter.id)).toBe(formatCouponCode(issued.code));
    expect(await prisma.premiumCouponCode.count({ where: { ownerUserId: inviter.id } })).toBe(1);
  });
});
