import { describe, expect, it } from "vitest";
import { withAdminPlan } from "../src/subscriptions.js";

/** 管理者が付与したプランは、Stripe の契約とは別に持ち、高い方が効く。 */
describe("withAdminPlan", () => {
  const now = new Date("2026-10-07T00:00:00Z");
  const later = new Date("2026-11-07T00:00:00Z");
  const free = { active: false, status: null, currentPeriodEnd: null, plan: null } as const;
  const silverPaid = { active: true, status: "active", currentPeriodEnd: later, plan: "silver" } as const;

  it("未加入の人に付与すると有効になる", () => {
    expect(withAdminPlan(free, { adminPlan: "gold", adminPlanUntil: later }, now)).toMatchObject({ active: true, plan: "gold", status: "admin" });
  });
  it("支払い中のシルバーにプラチナを付与すると、プラチナが効き、状態は支払い中のまま", () => {
    expect(withAdminPlan(silverPaid, { adminPlan: "platinum", adminPlanUntil: later }, now)).toMatchObject({ plan: "platinum", status: "active" });
  });
  it("低いプランの付与・期限切れの付与は効かない", () => {
    expect(withAdminPlan({ ...silverPaid, plan: "gold" }, { adminPlan: "silver", adminPlanUntil: later }, now).plan).toBe("gold");
    expect(withAdminPlan(free, { adminPlan: "gold", adminPlanUntil: now }, now).active).toBe(false);
  });
});
