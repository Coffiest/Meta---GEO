import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import { getOrCreateUserByAuthId } from "../src/bankroll.js";
import { searchUsersForAdmin } from "../src/subscriptions.js";

/** 管理者画面: 招待コードでプレイヤーを検索でき、結果に招待コードが載る(オーナー指示 2026-10-12)。 */
const RUN = Date.now();
const authId = `admin-ref-${RUN}`;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { authId } });
  await prisma.$disconnect();
});

describe("searchUsersForAdmin by referral code", () => {
  it("招待コード(小文字・ハイフン混じりでも)で見つかる", async () => {
    const user = await getOrCreateUserByAuthId({ authId, email: null, displayName: "AR" });
    const code = `Z${RUN.toString(36).toUpperCase()}`.slice(0, 8);
    await prisma.user.update({ where: { id: user.id }, data: { referralCode: code } });
    const q = `${code.slice(0, 4).toLowerCase()}-${code.slice(4).toLowerCase()}`;
    const { users } = await searchUsersForAdmin(q);
    const hit = users.find((u) => u.id === user.id);
    expect(hit?.referralCode).toBe(code);
  });
});
