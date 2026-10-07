import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import { effectiveGeoLevel, getAdminGeoAccess, getGeoAccess, getItmCount, setGeoAccessOverride } from "../src/geoAccess.js";

/**
 * GEO データベースの利用条件(実Postgres): インマネ(賞金が出て終えた)回数が 10 回でプリフロップ、20 回でポストフロップ以降。
 * SNG と MTT の両方を数え、賞金なし・未終了のエントリーは数えない。
 */
describe("geoAccess (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const tournamentIds: string[] = [];

  afterAll(async () => {
    await prisma.tournamentEntry.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
    await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function enter(userId: string, gameType: "sng" | "mtt", finishPosition: number | null, payout: number) {
    const t = await prisma.tournament.create({
      data: { seatCount: 6, startingStack: 20_000, status: "finished", gameType, buyIn: 1_000, finishedAt: new Date() },
    });
    tournamentIds.push(t.id);
    await prisma.tournamentEntry.create({ data: { tournamentId: t.id, userId, seatIndex: 0, finishPosition, payout } });
  }

  it("賞金が出て終えたエントリーだけを SNG・MTT 合わせて数え、10 回でプリフロップ、20 回でポストフロップ以降を解放する", async () => {
    const user = await prisma.user.create({ data: { displayName: "GeoAccessUser", isBot: false } });
    userIds.push(user.id);

    for (let i = 0; i < 5; i++) await enter(user.id, "sng", 1, 4_000);
    for (let i = 0; i < 4; i++) await enter(user.id, "mtt", 3, 1_500);
    await enter(user.id, "sng", 4, 0); // 入賞なし
    await enter(user.id, "mtt", null, 0); // 未終了

    expect(await getItmCount(user.id)).toBe(9);
    expect(await getGeoAccess(user.id)).toMatchObject({ itmCount: 9, level: "none", unlocked: false, postflopUnlocked: false });

    await enter(user.id, "mtt", 2, 3_000);
    expect(await getGeoAccess(user.id)).toMatchObject({ itmCount: 10, level: "preflop", unlocked: true, postflopUnlocked: false });

    for (let i = 0; i < 9; i++) await enter(user.id, "sng", 2, 2_000);
    expect(await getGeoAccess(user.id)).toMatchObject({ itmCount: 19, level: "preflop" });
    await enter(user.id, "sng", 1, 4_000);
    expect(await getGeoAccess(user.id)).toMatchObject({
      itmCount: 20,
      required: 10,
      postflopRequired: 20,
      level: "full",
      unlocked: true,
      postflopUnlocked: true,
    });
  });

  it("管理者の個別設定は緩める方向にだけ効き、null で回数どおりに戻る", async () => {
    expect(effectiveGeoLevel(0, null)).toBe("none");
    expect(effectiveGeoLevel(0, "preflop")).toBe("preflop");
    expect(effectiveGeoLevel(3, "full")).toBe("full");
    expect(effectiveGeoLevel(12, "preflop")).toBe("preflop");
    expect(effectiveGeoLevel(25, "preflop")).toBe("full"); // 回数で得た段階は取り上げない

    const user = await prisma.user.create({ data: { displayName: "GeoOverrideUser", isBot: false } });
    userIds.push(user.id);
    await enter(user.id, "sng", 1, 4_000);
    expect(await getGeoAccess(user.id)).toMatchObject({ itmCount: 1, level: "none" });

    await setGeoAccessOverride(user.id, "full");
    expect(await getGeoAccess(user.id)).toMatchObject({ itmCount: 1, level: "full", unlocked: true, postflopUnlocked: true });
    expect((await getAdminGeoAccess([user.id])).get(user.id)).toEqual({ itmCount: 1, override: "full", level: "full" });

    await setGeoAccessOverride(user.id, "preflop");
    expect(await getGeoAccess(user.id)).toMatchObject({ level: "preflop", postflopUnlocked: false });

    await setGeoAccessOverride(user.id, null);
    expect(await getGeoAccess(user.id)).toMatchObject({ level: "none", unlocked: false });
  });
});
