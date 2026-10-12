import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import { getOrCreateUserByAuthId } from "../src/bankroll.js";
import { searchUsersForAdmin } from "../src/subscriptions.js";
import { isUserBanned, setUserBanned } from "../src/userBan.js";

/** 管理者による利用停止(BAN)。オーナー指示 2026-10-12。 */
const authId = `ban-${Date.now()}`;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { authId } });
  await prisma.$disconnect();
});

describe("user ban", () => {
  it("BAN と解除。管理者の検索結果にも出る", async () => {
    const user = await getOrCreateUserByAuthId({ authId, email: null, displayName: "BanTarget" });
    expect(await isUserBanned(user.id)).toBe(false);

    await setUserBanned(user.id, true, "荒らし");
    expect(await isUserBanned(user.id)).toBe(true);
    const { users } = await searchUsersForAdmin(user.id);
    const hit = users.find((u) => u.id === user.id);
    expect(hit?.bannedAt).not.toBeNull();
    expect(hit?.bannedReason).toBe("荒らし");

    await setUserBanned(user.id, false);
    expect(await isUserBanned(user.id)).toBe(false);
  });
});
