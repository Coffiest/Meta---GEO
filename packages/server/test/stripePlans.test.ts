import { afterEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { planAtLeast, parsePlan } from "@meta-geo/db";
import { clearPriceCache, lookupKeyOf, planOfSubscription, resolvePriceId } from "../src/stripePlans.js";

/** プランと Stripe の価格の対応(偽の Stripe)。 */

function subWithPrice(price: Partial<Stripe.Price>): Stripe.Subscription {
  return { items: { data: [{ price }] } } as unknown as Stripe.Subscription;
}

afterEach(() => {
  clearPriceCache();
  delete process.env["STRIPE_PRICE_ID_GOLD"];
});

describe("plans", () => {
  it("parsePlan / planAtLeast", () => {
    expect(parsePlan("gold")).toBe("gold");
    expect(parsePlan("diamond")).toBeNull();
    expect(planAtLeast("platinum", "gold")).toBe(true);
    expect(planAtLeast("silver", "gold")).toBe(false);
    expect(planAtLeast(null, "silver")).toBe(false);
  });

  it("planOfSubscription: lookup_key → metadata → env の順", () => {
    expect(planOfSubscription(subWithPrice({ id: "p1", lookup_key: lookupKeyOf("platinum"), metadata: {} }))).toBe("platinum");
    expect(planOfSubscription(subWithPrice({ id: "p2", lookup_key: null, metadata: { plan: "gold" } }))).toBe("gold");
    process.env["STRIPE_PRICE_ID_GOLD"] = "price_env_gold";
    expect(planOfSubscription(subWithPrice({ id: "price_env_gold", lookup_key: null, metadata: {} }))).toBe("gold");
    expect(planOfSubscription(subWithPrice({ id: "unknown", lookup_key: null, metadata: {} }))).toBeNull();
  });

  it("resolvePriceId: 無ければ1回だけ作り、以後はキャッシュ", async () => {
    let created = 0;
    const stripe = {
      prices: {
        list: async () => ({ data: [] }),
        create: async (p: { unit_amount: number; lookup_key: string }) => {
          created++;
          expect(p.unit_amount).toBe(1890);
          expect(p.lookup_key).toBe(lookupKeyOf("platinum"));
          return { id: "price_new" };
        },
      },
    } as unknown as Stripe;
    expect(await resolvePriceId(stripe, "platinum")).toBe("price_new");
    expect(await resolvePriceId(stripe, "platinum")).toBe("price_new");
    expect(created).toBe(1);
  });

  it("resolvePriceId: env があればそれを使う", async () => {
    process.env["STRIPE_PRICE_ID_GOLD"] = "price_env_gold";
    expect(await resolvePriceId({} as Stripe, "gold")).toBe("price_env_gold");
  });
});
