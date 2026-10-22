import { afterAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { getOrCreateUserByAuthId, prisma } from "@meta-geo/db";
import { applyCancelAtPeriodEnd } from "../src/subscriptionReconciler.js";

/** アプリ内のサブスク解除: 期間末で止める・取り消せる・何度押しても同じ(実DB + 偽の Stripe)。 */

const RUN = Date.now();
const authId = `cancel-${RUN}`;
const periodEnd = Math.floor(Date.now() / 1000) + 10 * 86400;

function fakeStripe(sub: { id: string; customer: string; status: string; cancel_at_period_end: boolean; cancel_at: number | null }) {
  const updates: boolean[] = [];
  const stripe = {
    subscriptions: {
      retrieve: async () => ({ ...sub, current_period_end: periodEnd, items: { data: [] }, metadata: {} }),
      update: async (_id: string, p: { cancel_at_period_end: boolean }) => {
        updates.push(p.cancel_at_period_end);
        sub.cancel_at_period_end = p.cancel_at_period_end;
        sub.cancel_at = p.cancel_at_period_end ? periodEnd : null;
        return { ...sub, current_period_end: periodEnd, items: { data: [] }, metadata: {} };
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, updates };
}

afterAll(async () => {
  const u = await prisma.user.findMany({ where: { authId }, select: { id: true } });
  await prisma.subscription.deleteMany({ where: { userId: { in: u.map((x) => x.id) } } });
  await prisma.user.deleteMany({ where: { authId } });
});

describe("applyCancelAtPeriodEnd", () => {
  it("解除は期間末の予定になり、契約は期限まで有効のまま。取り消しもできる", async () => {
    const user = await getOrCreateUserByAuthId({ authId, email: null, displayName: "CX" });
    const row = { stripeCustomerId: `cus_cx_${RUN}`, stripeSubscriptionId: `sub_cx_${RUN}`, currentPeriodEnd: new Date(periodEnd * 1000) };
    await prisma.subscription.create({ data: { userId: user.id, ...row, status: "active" } });
    const { stripe, updates } = fakeStripe({ id: row.stripeSubscriptionId, customer: row.stripeCustomerId, status: "active", cancel_at_period_end: false, cancel_at: null });

    expect(await applyCancelAtPeriodEnd(stripe, row, null)).toMatchObject({ cancelAtPeriodEnd: false });
    const cancelled = await applyCancelAtPeriodEnd(stripe, row, false);
    expect(cancelled.cancelAtPeriodEnd).toBe(true);
    expect(cancelled.periodEnd).toBe(new Date(periodEnd * 1000).toISOString());
    await applyCancelAtPeriodEnd(stripe, row, false); // 二度押し
    expect(updates).toEqual([true]);
    const db = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(db?.status).toBe("active");

    expect((await applyCancelAtPeriodEnd(stripe, row, true)).cancelAtPeriodEnd).toBe(false);
    expect(updates).toEqual([true, false]);
  });
});
