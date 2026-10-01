import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import { getOrCreateUserByAuthId } from "../src/bankroll.js";
import {
  STRIPE_RENEWAL_GRACE_MS,
  getSubscriptionStatusForUser,
  isStripeSubscriptionActive,
  listSubscriptionsToReconcile,
  subscriptionNeedsReconcile,
} from "../src/subscriptions.js";

/**
 * 棋譜解析プランの期限切れ(Webhook が届かなくても、期限+猶予を過ぎたら使えなくなる)。
 * 実DB(Postgres)が必要。
 */

const RUN = Date.now();
const authIds: string[] = [];
const HOUR = 60 * 60 * 1000;

async function makeUser(tag: string): Promise<string> {
  const authId = `subexpiry-${tag}-${RUN}`;
  authIds.push(authId);
  return (await getOrCreateUserByAuthId({ authId, email: null, displayName: `SE-${tag}` })).id;
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { authId: { in: authIds } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.subscription.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("isStripeSubscriptionActive", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  it("期限内は有効、期限+猶予を過ぎたら無効", () => {
    expect(isStripeSubscriptionActive({ status: "active", currentPeriodEnd: new Date(now.getTime() + HOUR) }, now)).toBe(true);
    expect(
      isStripeSubscriptionActive({ status: "active", currentPeriodEnd: new Date(now.getTime() - STRIPE_RENEWAL_GRACE_MS / 2) }, now),
    ).toBe(true);
    expect(
      isStripeSubscriptionActive({ status: "active", currentPeriodEnd: new Date(now.getTime() - STRIPE_RENEWAL_GRACE_MS - 1) }, now),
    ).toBe(false);
  });
  it("支払い遅延・解約済みは期限内でも無効", () => {
    const future = new Date(now.getTime() + 24 * HOUR);
    expect(isStripeSubscriptionActive({ status: "past_due", currentPeriodEnd: future }, now)).toBe(false);
    expect(isStripeSubscriptionActive({ status: "canceled", currentPeriodEnd: future }, now)).toBe(false);
  });
});

describe("期限切れの契約 (integration, real Postgres)", () => {
  it("Webhook が届かず status=active のままでも、期限を過ぎたら無効になり、照合の対象に入る", async () => {
    const userId = await makeUser("expired");
    const subId = `sub_expired_${RUN}`;
    await prisma.subscription.create({
      data: {
        userId,
        stripeCustomerId: `cus_expired_${RUN}`,
        stripeSubscriptionId: subId,
        status: "active",
        currentPeriodEnd: new Date(Date.now() - 3 * 24 * HOUR),
      },
    });
    const status = await getSubscriptionStatusForUser(userId);
    expect(status.active).toBe(false);
    expect(await subscriptionNeedsReconcile(userId)).toBe(subId);
    const due = await listSubscriptionsToReconcile(new Date(), 1000);
    expect(due.some((d) => d.stripeSubscriptionId === subId)).toBe(true);
  });

  it("期限内の契約は有効で、照合の対象に入らない。支払い遅延は期限内でも対象", async () => {
    const okUser = await makeUser("ok");
    await prisma.subscription.create({
      data: {
        userId: okUser,
        stripeCustomerId: `cus_ok_${RUN}`,
        stripeSubscriptionId: `sub_ok_${RUN}`,
        status: "active",
        currentPeriodEnd: new Date(Date.now() + 10 * 24 * HOUR),
      },
    });
    expect((await getSubscriptionStatusForUser(okUser)).active).toBe(true);
    expect(await subscriptionNeedsReconcile(okUser)).toBeNull();

    const lateUser = await makeUser("late");
    await prisma.subscription.create({
      data: {
        userId: lateUser,
        stripeCustomerId: `cus_late_${RUN}`,
        stripeSubscriptionId: `sub_late_${RUN}`,
        status: "past_due",
        currentPeriodEnd: new Date(Date.now() + 10 * 24 * HOUR),
      },
    });
    expect((await getSubscriptionStatusForUser(lateUser)).active).toBe(false);
    expect(await subscriptionNeedsReconcile(lateUser)).toBe(`sub_late_${RUN}`);
  });

  it("解約済みは照合しない", async () => {
    const userId = await makeUser("canceled");
    await prisma.subscription.create({
      data: {
        userId,
        stripeCustomerId: `cus_canceled_${RUN}`,
        stripeSubscriptionId: `sub_canceled_${RUN}`,
        status: "canceled",
        currentPeriodEnd: new Date(Date.now() - 24 * HOUR),
      },
    });
    expect(await subscriptionNeedsReconcile(userId)).toBeNull();
  });
});
