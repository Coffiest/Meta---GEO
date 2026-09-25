import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import { getRankedEntries, invalidateRankedEntries } from "../src/rankedEntries.js";

describe("ranked entries shared cache (integration, real Postgres)", () => {
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];

  afterAll(async () => {
    for (const tournamentId of createdTournamentIds) {
      await prisma.bankrollTransaction.deleteMany({ where: { tournamentId } });
      await prisma.tournamentEntry.deleteMany({ where: { tournamentId } });
      await prisma.tournament.delete({ where: { id: tournamentId } }).catch(() => {});
    }
    for (const userId of createdUserIds) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("serves repeated calls from one fetch, and picks up new results after invalidation", async () => {
    invalidateRankedEntries();
    const before = await getRankedEntries();

    const user = await prisma.user.create({ data: { displayName: `RankedCacheTest-${Date.now()}` } });
    createdUserIds.push(user.id);
    const tournament = await prisma.tournament.create({
      data: { seatCount: 6, startingStack: 20000, buyIn: 500, gameType: "sng", status: "finished" },
    });
    createdTournamentIds.push(tournament.id);
    await prisma.tournamentEntry.create({
      data: { tournamentId: tournament.id, userId: user.id, seatIndex: 0, finishPosition: 1, payout: 4000 },
    });

    // キャッシュが生きている間は、DBに増えた行がまだ見えない(=同じフェッチを使い回している)。
    expect((await getRankedEntries()).length).toBe(before.length);

    // 着順確定時に呼ばれる破棄を通すと、最新の行が見えるようになる。
    invalidateRankedEntries();
    const after = await getRankedEntries();
    expect(after.length).toBe(before.length + 1);

    const row = after.find((r) => r.userId === user.id);
    expect(row).toBeDefined();
    expect(row!.buyIn).toBe(500);
    expect(row!.payout).toBe(4000);
    expect(row!.displayName).toBe(user.displayName);
  });

  it("excludes bots (ranking is for real players only)", async () => {
    const bot = await prisma.user.create({ data: { displayName: `RankedCacheBot-${Date.now()}`, isBot: true } });
    createdUserIds.push(bot.id);
    const tournament = await prisma.tournament.create({
      data: { seatCount: 6, startingStack: 20000, buyIn: 500, gameType: "sng", status: "finished" },
    });
    createdTournamentIds.push(tournament.id);
    await prisma.tournamentEntry.create({
      data: { tournamentId: tournament.id, userId: bot.id, seatIndex: 1, finishPosition: 2, payout: 2000 },
    });

    invalidateRankedEntries();
    const rows = await getRankedEntries();
    expect(rows.some((r) => r.userId === bot.id)).toBe(false);
  });
});
