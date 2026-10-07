import { afterEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { clearPriceCache, lookupKeyOf, planOfSubscription, resolvePriceId } from "../src/stripePlans.js";

function subWith(price: Partial<Stripe.Price>): Stripe.Subscription {
  return { items: { data: [{ price: { id: "price_x", lookup_key: null, metadata: {}, ...price } }] } } as unknown as Stripe.Subscription;
}

afterEach(() => {
  clearPriceCache();
  vi.unstubAllEnvs();
});

describe("planOfSubscription", () => {
  it("lookup_key からプランを決める", () => {
    expect(planOfSubscription(subWith({ lookup_key: lookupKeyOf("gold") }))).toBe("gold");
    expect(planOfSubscription(subWith({ lookup_key: lookupKeyOf("platinum") }))).toBe("platinum");
  });
  it("metadata.plan でも決まる", () => {
    expect(planOfSubscription(subWith({ metadata: { plan: "platinum" } }))).toBe("platinum");
  });
  it("旧来の ¥980 の価格(STRIPE_PRICE_ID)はシルバー", () => {
    vi.stubEnv("STRIPE_PRICE_ID", "price_legacy");
    expect(planOfSubscription(subWith({ id: "price_legacy" }))).toBe("silver");
  });
  it("分からない価格は null(今の値のまま)", () => {
    expect(planOfSubscription(subWith({ id: "price_unknown" }))).toBeNull();
  });
});

describe("resolvePriceId", () => {
  it("env の価格があればそれを使い、Stripe を呼ばない", async () => {
    vi.stubEnv("STRIPE_PRICE_ID_GOLD", "price_gold_env");
    const stripe = { prices: { list: vi.fn(), create: vi.fn() } } as unknown as Stripe;
    expect(await resolvePriceId(stripe, "gold")).toBe("price_gold_env");
    expect(stripe.prices.list).not.toHaveBeenCalled();
  });
  it("lookup_key の価格が無ければ月額で作り、2回目はキャッシュを使う", async () => {
    vi.stubEnv("STRIPE_PRICE_ID_PLATINUM", "");
    const list = vi.fn().mockResolvedValue({ data: [] });
    const create = vi.fn().mockResolvedValue({ id: "price_new" });
    const stripe = { prices: { list, create } } as unknown as Stripe;
    expect(await resolvePriceId(stripe, "platinum")).toBe("price_new");
    expect(await resolvePriceId(stripe, "platinum")).toBe("price_new");
    expect(list).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toMatchObject({ currency: "jpy", unit_amount: 1890, recurring: { interval: "month" } });
  });
});
