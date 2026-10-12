import { afterAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { getOrCreateUserByAuthId, getSubscriptionStatusForUser, prisma } from "@meta-geo/db";
import { resolvePendingCheckout } from "../src/subscriptionApi.js";
import { lookupKeyOf } from "../src/stripePlans.js";

/**
 * 決済で始まった契約を、Webhook を待たずに反映する(実DB + 偽の Stripe)。
 * オーナー指摘: インフルエンサーのコードで加入したのに、会員にならない(Webhook 頼みで反映が遅れる/失敗する)。
 */

const RUN = Date.now();
const authIds: string[] = [];

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { authId: { in: authIds } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.subscription.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

function fakeStripe(customer: string, subId: string) {
  const sub = {
    id: subId,
    customer,
    status: "active",
    metadata: {},
    discounts: [],
    discount: null,
    default_payment_method: null,
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    items: { data: [{ price: { id: "price_gold", lookup_key: lookupKeyOf("gold"), metadata: {} } }] },
  };
  let listCalls = 0;
  const stripe = {
    subscriptions: {
      list: async () => {
        listCalls++;
        return { data: [sub] };
      },
      retrieve: async () => ({ ...sub }),
    },
  } as unknown as Stripe;
  return { stripe, listCalls: () => listCalls };
}

describe("resolvePendingCheckout", () => {
  it("決済画面へ進んだまま反映されていない人は、Stripe の契約を見て会員にする", async () => {
    const authId = `checkout-return-${RUN}`;
    authIds.push(authId);
    const user = await getOrCreateUserByAuthId({ authId, email: null, displayName: "CR" });
    const customer = `cus_cr_${RUN}`;
    await prisma.subscription.create({ data: { userId: user.id, stripeCustomerId: customer, status: "incomplete" } });
    expect((await getSubscriptionStatusForUser(user.id)).active).toBe(false);

    const { stripe, listCalls } = fakeStripe(customer, `sub_cr_${RUN}`);
    await resolvePendingCheckout(stripe, user.id);
    const status = await getSubscriptionStatusForUser(user.id);
    expect(status.active).toBe(true);
    expect(status.plan).toBe("gold");

    // 反映済みなら、もう Stripe に問い合わせない。
    await resolvePendingCheckout(stripe, user.id);
    expect(listCalls()).toBe(1);
  });
});
