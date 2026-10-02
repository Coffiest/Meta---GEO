import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import { getEliteFrames, getEliteStats } from "../src/eliteTier.js";
import { invalidateRankedEntries } from "../src/rankedEntries.js";

/**
 * High Roller / Super High Roller の資格に使う成績(実Postgres)。
 * 収支 = 賞金 − 参加費、ROI(%) = (賞金 ÷ 参加費 − 1) × 100 で、成績画面と同じ値になること。
 * 自動で卓を埋めるプレイヤーは集計の対象外で、枠は常に無し。
 */
describe("eliteTier (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const tournamentIds: string[] = [];

  afterAll(async () => {
    await prisma.tournamentEntry.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
    await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    invalidateRankedEntries();
  });

  it("収支と ROI を成績画面と同じ式で求め、資格に応じた枠を返す", async () => {
    const [winner, bot] = await Promise.all([
      prisma.user.create({ data: { displayName: "EliteWinner", isBot: false } }),
      prisma.user.create({ data: { displayName: "EliteBot", isBot: true } }),
    ]);
    userIds.push(winner.id, bot.id);
    // 参加費 20,000 の卓で 15 回優勝(賞金 80,000)、5 回は入賞なし。
    for (let i = 0; i < 20; i++) {
      const t = await prisma.tournament.create({
        data: { seatCount: 6, startingStack: 20_000, status: "finished", gameType: "sng", buyIn: 20_000, finishedAt: new Date() },
      });
      tournamentIds.push(t.id);
      const won = i < 15;
      await prisma.tournamentEntry.createMany({
        data: [
          { tournamentId: t.id, userId: winner.id, seatIndex: 0, finishPosition: won ? 1 : 4, payout: won ? 80_000 : 0 },
          { tournamentId: t.id, userId: bot.id, seatIndex: 1, finishPosition: won ? 2 : 1, payout: won ? 40_000 : 80_000 },
        ],
      });
    }
    invalidateRankedEntries();

    const stats = await getEliteStats(winner.id);
    // 賞金 1,200,000 − 参加費 400,000 = +800,000、ROI = 1,200,000 ÷ 400,000 − 1 = +200%
    expect(stats.profit).toBe(800_000);
    expect(stats.roiPct).toBeCloseTo(200, 6);
    expect(stats.rating).not.toBeNull();

    const frames = await getEliteFrames([winner.id, bot.id, "no-such-user"]);
    expect(frames.get(bot.id)).toBeNull();
    expect(frames.get("no-such-user")).toBeNull();
    expect(["silver", "gold"]).toContain(frames.get(winner.id));
  });
});
