import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import { getOrCreateUserByAuthId } from "../src/bankroll.js";
import { claimTrialFingerprint, isTrialEligible, markTrialUsed, parsePlan, planAtLeast } from "../src/plans.js";
import { getSubscriptionStatusForUser, grantCompSubscription } from "../src/subscriptions.js";

/**
 * 3つのプラン(シルバー / ゴールド / プラチナ)と無料体験(全プランを通して1人1回・同じカードの2回目は弾く)。
 * 実DB(Postgres)が必要。
 */

const RUN = Date.now();
const authIds: string[] = [];
const fingerprints: string[] = [];

async function makeUser(tag: string): Promise<string> {
  const authId = `plans-${tag}-${RUN}`;
  authIds.push(authId);
  return (await getOrCreateUserByAuthId({ authId, email: null, displayName: `PL-${tag}` })).id;
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { authId: { in: authIds } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.trialFingerprint.deleteMany({ where: { fingerprint: { in: fingerprints } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("parsePlan / planAtLeast", () => {
  it("3つのプラン名だけを受け付ける", () => {
    expect(parsePlan("silver")).toBe("silver");
    expect(parsePlan("gold")).toBe("gold");
    expect(parsePlan("platinum")).toBe("platinum");
    expect(parsePlan("free")).toBeNull();
    expect(parsePlan(undefined)).toBeNull();
  });
  it("上位のプランは下位の条件を満たし、未加入は何も満たさない", () => {
    expect(planAtLeast("platinum", "gold")).toBe(true);
    expect(planAtLeast("gold", "gold")).toBe(true);
    expect(planAtLeast("silver", "gold")).toBe(false);
    expect(planAtLeast(null, "silver")).toBe(false);
  });
});

describe("プランと無料体験 (integration, real Postgres)", () => {
  it("無料体験は1人1回(2回目の記録で最初の時刻は変わらない)", async () => {
    const userId = await makeUser("trial");
    expect(await isTrialEligible(userId)).toBe(true);
    const first = new Date("2026-10-01T00:00:00Z");
    await markTrialUsed(userId, first);
    await markTrialUsed(userId, new Date("2026-10-05T00:00:00Z"));
    expect(await isTrialEligible(userId)).toBe(false);
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { trialUsedAt: true } });
    expect(row?.trialUsedAt?.toISOString()).toBe(first.toISOString());
  });

  it("同じカードは別の人の体験に使えない(同じ人の再送は通す)", async () => {
    const a = await makeUser("card-a");
    const b = await makeUser("card-b");
    const fp = `fp_${RUN}`;
    fingerprints.push(fp);
    expect(await claimTrialFingerprint(fp, a)).toBe(true);
    expect(await claimTrialFingerprint(fp, a)).toBe(true);
    expect(await claimTrialFingerprint(fp, b)).toBe(false);
  });

  it("未加入は plan=null、無料付与は選んだプラン(省略時シルバー)", async () => {
    const userId = await makeUser("comp");
    expect((await getSubscriptionStatusForUser(userId)).plan).toBeNull();
    await grantCompSubscription({ userId, unit: "week", amount: 1 });
    expect((await getSubscriptionStatusForUser(userId)).plan).toBe("silver");
    await grantCompSubscription({ userId, unit: "week", amount: 1, plan: "platinum" });
    expect((await getSubscriptionStatusForUser(userId)).plan).toBe("platinum");
  });

  it("期限切れの契約は plan=null", async () => {
    const userId = await makeUser("expired");
    await prisma.subscription.create({
      data: {
        userId,
        stripeCustomerId: `cus_plans_${RUN}`,
        status: "comp",
        plan: "gold",
        currentPeriodEnd: new Date(Date.now() - 60_000),
      },
    });
    expect((await getSubscriptionStatusForUser(userId)).plan).toBeNull();
  });
});
