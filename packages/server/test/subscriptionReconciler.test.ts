import { afterAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { getOrCreateUserByAuthId, getSubscriptionStatusForUser, prisma } from "@meta-geo/db";
import { cancelForPaymentFailure, reconcileSubscription } from "../src/subscriptionReconciler.js";

/**
 * 期限が来た契約の照合(実DB + 偽の Stripe)。
 * - 更新(引き落とし成功)済みなら新しい期限を取り込んで有効のまま
 * - 引き落としに失敗(past_due)していれば即解約し、未払いの請求を無効化する
 */

const RUN = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const authIds: string[] = [];

interface FakeSub { id: string; customer: string; status: Stripe.Subscription.Status; current_period_end: number; latest_invoice: string | null }

function fakeStripe(subs: Map<string, FakeSub>, invoices: Map<string, { status: string }>) {
  const calls = { canceled: [] as string[], voided: [] as string[] };
  const stripe = {
    subscriptions: {
      retrieve: async (id: string) => {
        const s = subs.get(id);
        if (!s) throw Object.assign(new Error("No such subscription"), { code: "resource_missing" });
        return { ...s };
      },
      cancel: async (id: string) => {
        calls.canceled.push(id);
        const s = subs.get(id)!;
        s.status = "canceled";
        return { ...s };
      },
    },
    invoices: {
      retrieve: async (id: string) => ({ id, ...invoices.get(id)! }),
      voidInvoice: async (id: string) => {
        calls.voided.push(id);
        invoices.get(id)!.status = "void";
        return { id };
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, calls };
}

async function makeSubscriber(tag: string, status: string, periodEnd: Date) {
  const authId = `reconcile-${tag}-${RUN}`;
  authIds.push(authId);
  const user = await getOrCreateUserByAuthId({ authId, email: null, displayName: `RC-${tag}` });
  const customer = `cus_${tag}_${RUN}`;
  const subId = `sub_${tag}_${RUN}`;
  await prisma.subscription.create({
    data: { userId: user.id, stripeCustomerId: customer, stripeSubscriptionId: subId, status, currentPeriodEnd: periodEnd },
  });
  return { userId: user.id, customer, subId };
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { authId: { in: authIds } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.subscription.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("reconcileSubscription", () => {
  it("更新済み → 新しい期限で有効 / 引き落とし失敗 → 自動解約 / Stripe に無い → 解約済み", async () => {
    const past = new Date(Date.now() - 2 * DAY);
    const renewed = await makeSubscriber("renewed", "active", past);
    const failed = await makeSubscriber("failed", "active", past);
    const missing = await makeSubscriber("missing", "active", past);

    const nextEnd = Math.floor((Date.now() + 28 * DAY) / 1000);
    const subs = new Map<string, FakeSub>([
      [renewed.subId, { id: renewed.subId, customer: renewed.customer, status: "active", current_period_end: nextEnd, latest_invoice: "in_ok" }],
      [failed.subId, { id: failed.subId, customer: failed.customer, status: "past_due", current_period_end: nextEnd, latest_invoice: `in_failed_${RUN}` }],
    ]);
    const invoices = new Map([["in_ok", { status: "paid" }], [`in_failed_${RUN}`, { status: "open" }]]);
    const { stripe, calls } = fakeStripe(subs, invoices);

    // 期限切れの3件は、照合前でもすでに使えない(Webhook が届いていなくても)。
    expect((await getSubscriptionStatusForUser(renewed.userId)).active).toBe(false);

    // 他のテストの行に触れないよう、この3件だけを照合する(一覧の抽出は db 側のテストで確かめている)。
    for (const s of [renewed, failed, missing]) await reconcileSubscription(stripe, s.customer, s.subId);

    const r = await getSubscriptionStatusForUser(renewed.userId);
    expect(r.active).toBe(true);
    expect(r.currentPeriodEnd?.getTime()).toBe(nextEnd * 1000);

    const f = await getSubscriptionStatusForUser(failed.userId);
    expect(f).toMatchObject({ active: false, status: "canceled" });
    expect(calls.canceled).toEqual([failed.subId]);
    expect(calls.voided).toEqual([`in_failed_${RUN}`]);

    const m = await prisma.subscription.findUniqueOrThrow({ where: { userId: missing.userId } });
    expect(m.status).toBe("canceled");
  });

  it("引き落とし失敗の通知で即解約する(何度届いても同じ結果)", async () => {
    const future = new Date(Date.now() + 3 * DAY);
    const s = await makeSubscriber("webhook", "active", future);
    const subs = new Map<string, FakeSub>([
      [s.subId, { id: s.subId, customer: s.customer, status: "past_due", current_period_end: Math.floor(future.getTime() / 1000), latest_invoice: "in_x" }],
    ]);
    const invoices = new Map([["in_x", { status: "open" }]]);
    const { stripe, calls } = fakeStripe(subs, invoices);

    await cancelForPaymentFailure(stripe, s.subId, "in_x");
    await cancelForPaymentFailure(stripe, s.subId, "in_x");

    expect(calls.canceled).toEqual([s.subId]);
    expect(calls.voided).toEqual(["in_x"]);
    expect((await getSubscriptionStatusForUser(s.userId)).active).toBe(false);
  });
});
