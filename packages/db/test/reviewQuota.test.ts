import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import { getOrCreateUserByAuthId } from "../src/bankroll.js";
import { checkAndConsumeReviewQuota, getReviewQuotaRemaining } from "../src/subscriptions.js";

/**
 * 棋譜解析の無料枠(24時間ローリング1回)ロジックの結合テスト。
 * 実DB(Postgres)が必要。CIの test ジョブで実行される。
 */

const RUN = Date.now();
const authIds: string[] = [];

async function makeUser(tag: string): Promise<string> {
  const authId = `reviewquota-${tag}-${RUN}`;
  authIds.push(authId);
  const u = await getOrCreateUserByAuthId({ authId, email: null, displayName: `RQ-${tag}` });
  return u.id;
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { authId: { in: authIds } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.reviewUsage.deleteMany({ where: { userId: { in: ids } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe("checkAndConsumeReviewQuota (無料プラン)", () => {
  it("初回トナメは許可し消費、同一トナメ再解析は消費せず許可、別トナメは402で拒否", async () => {
    const userId = await makeUser("free");

    const first = await checkAndConsumeReviewQuota(userId, "tourA");
    expect(first.allowed).toBe(true);

    // 同一トナメ再解析 → 許可(冪等・消費しない)
    const again = await checkAndConsumeReviewQuota(userId, "tourA");
    expect(again.allowed).toBe(true);

    // 別トナメ2件目 → 24時間枠を使い切っているため拒否
    const second = await checkAndConsumeReviewQuota(userId, "tourB");
    expect(second.allowed).toBe(false);
    expect(second.nextFreeAt).toBeInstanceOf(Date);

    // 消費行は tourA の1件のみ
    const rows = await prisma.reviewUsage.count({ where: { userId } });
    expect(rows).toBe(1);

    // 残枠確認(消費しない)
    const remaining = await getReviewQuotaRemaining(userId);
    expect(remaining.remaining).toBe(0);
    expect(remaining.nextFreeAt).toBeInstanceOf(Date);
  });
});

describe("checkAndConsumeReviewQuota (サブスク加入者)", () => {
  it("加入者は無制限に許可し、消費しない", async () => {
    const userId = await makeUser("sub");
    await prisma.subscription.create({
      data: { userId, stripeCustomerId: `cus_test_${RUN}`, status: "active" },
    });

    const r1 = await checkAndConsumeReviewQuota(userId, "tourX");
    const r2 = await checkAndConsumeReviewQuota(userId, "tourY");
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);

    const rows = await prisma.reviewUsage.count({ where: { userId } });
    expect(rows).toBe(0);

    const remaining = await getReviewQuotaRemaining(userId);
    expect(remaining.allowed).toBe(true);
  });
});
