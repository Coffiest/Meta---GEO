import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import { GEO_ITM_REQUIRED, getGeoAccess, getItmCount } from "../src/geoAccess.js";

/**
 * GEO データベースの利用条件(実Postgres): インマネ(賞金が出て終えた)回数が 20 回以上。
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

  it("賞金が出て終えたエントリーだけを SNG・MTT 合わせて数え、20 回で解放する", async () => {
    const user = await prisma.user.create({ data: { displayName: "GeoAccessUser", isBot: false } });
    userIds.push(user.id);

    for (let i = 0; i < 12; i++) await enter(user.id, "sng", 1, 4_000);
    for (let i = 0; i < 7; i++) await enter(user.id, "mtt", 3, 1_500);
    await enter(user.id, "sng", 4, 0); // 入賞なし
    await enter(user.id, "mtt", null, 0); // 未終了

    expect(await getItmCount(user.id)).toBe(19);
    expect(await getGeoAccess(user.id)).toEqual({ itmCount: 19, required: GEO_ITM_REQUIRED, unlocked: false });

    await enter(user.id, "mtt", 2, 3_000);
    expect(await getGeoAccess(user.id)).toEqual({ itmCount: 20, required: GEO_ITM_REQUIRED, unlocked: true });
  });
});
