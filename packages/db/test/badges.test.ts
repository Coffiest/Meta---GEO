import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import { getBadgeCollection } from "../src/badges.js";
import { getOrCreateReferralCode, redeemReferralCode } from "../src/referral.js";

describe("badge collection (integration, real Postgres)", () => {
  const createdUserIds: string[] = [];

  async function createUser(name: string) {
    const user = await prisma.user.create({ data: { displayName: `BadgeTest-${name}`, isBot: true } });
    createdUserIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await prisma.referral.deleteMany({ where: { OR: [{ inviterUserId: userId }, { inviteeUserId: userId }] } });
    }
    for (const userId of createdUserIds) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("starts empty for a brand-new player, and exposes every tier as a locked badge", async () => {
    const user = await createUser("Fresh");
    const collection = await getBadgeCollection(user.id);

    expect(collection.achievedCount).toBe(0);
    // tournaments 5 + wins 3 + itm 3 + hands 3 + rating 3 + invites 4 + rank 3
    expect(collection.totalCount).toBe(24);
    expect(collection.badges.every((b) => !b.achieved)).toBe(true);

    const tiers = (key: string) => collection.badges.filter((b) => b.key === key).map((b) => b.target);
    expect(tiers("tournaments")).toEqual([1, 10, 50, 100, 500]);
    expect(tiers("rank")).toEqual([100, 10, 1]);

    // 未プレイでも現在値は返す(進捗バーの分母になる)。偏差値の初期値は50。
    expect(collection.badges.find((b) => b.key === "hands")?.current).toBe(0);
    expect(collection.badges.find((b) => b.key === "rating")?.current).toBe(50);
  });

  it("unlocks the first invite badge as soon as one invite lands", async () => {
    const inviter = await createUser("Inviter");
    const invitee = await createUser("Invitee");
    const code = await getOrCreateReferralCode(inviter.id);
    expect((await redeemReferralCode(invitee.id, code)).ok).toBe(true);

    const collection = await getBadgeCollection(inviter.id);
    const inviteBadges = collection.badges.filter((b) => b.key === "invites").sort((a, b) => a.tier - b.tier);
    expect(inviteBadges[0]?.achieved).toBe(true); // 1人
    expect(inviteBadges[1]?.achieved).toBe(false); // 3人
    expect(inviteBadges[1]?.current).toBe(1);
    expect(collection.achievedCount).toBe(1);
  });

  it("never awards a TOP-N rank badge while the ranked field is smaller than the threshold", async () => {
    const user = await createUser("Unranked");
    const collection = await getBadgeCollection(user.id);
    const rankBadges = collection.badges.filter((b) => b.key === "rank");
    expect(rankBadges.every((b) => !b.achieved)).toBe(true);
  });
});
