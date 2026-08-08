import { afterAll, describe, expect, it } from "vitest";
import { HandEngine } from "@meta-geo/engine";
import { prisma } from "../src/client.js";
import { recordHand } from "../src/recordHand.js";
import { getGeoPositionStats } from "../src/geoTree.js";

/**
 * ポジション別の集まり具合を測る診断(getGeoPositionStats)の検証。
 *
 * 「GEOのプリフロップがUTGばかりで、後ろのポジションが集まらない」という症状は、
 * 母集団の偏りなのか、木構造・卓人数による見え方の問題なのかで対処がまったく変わる。
 * その切り分けに使う計測なので、数字自体が信用できなければ意味がない。
 *
 * ここでは「1ハンドで6人全員が必ず1回ずつ意思決定する」形のハンドを作り、
 * 6つのポジションすべてがちょうど1ハンドずつ数えられることを確かめる。
 */
describe("getGeoPositionStats (integration, real Postgres)", () => {
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];

  afterAll(async () => {
    for (const tournamentId of createdTournamentIds) {
      await prisma.geoDecision.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.handAction.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.handSeat.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.handPot.deleteMany({ where: { hand: { tournamentId } } });
      await prisma.hand.deleteMany({ where: { tournamentId } });
      await prisma.tournamentEntry.deleteMany({ where: { tournamentId } });
      await prisma.tournament.delete({ where: { id: tournamentId } });
    }
    for (const userId of createdUserIds) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it("counts one hand for every position that actually acted", async () => {
    // 他テストのデータと混ざるので、seed前後の差分で検証する。
    const before = await getGeoPositionStats();
    const handsAt = (stats: Awaited<ReturnType<typeof getGeoPositionStats>>, pos: string) =>
      stats.preflop.find((r) => r.position === pos && r.playerCount === 6)?.hands ?? 0;

    const users = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        prisma.user.create({ data: { displayName: `GeoPosTest-${i}`, isBot: false } }),
      ),
    );
    createdUserIds.push(...users.map((u) => u.id));

    const tournament = await prisma.tournament.create({
      data: { seatCount: 6, startingStack: 20_000, status: "running", gameType: "sng" },
    });
    createdTournamentIds.push(tournament.id);
    await prisma.tournamentEntry.createMany({
      data: users.map((u, i) => ({ tournamentId: tournament.id, userId: u.id, seatIndex: i })),
    });

    // BTN=0, SB=1, BB=2 → UTG=3, HJ=4, CO=5。
    const hand = new HandEngine({
      seats: users.map((u, i) => ({ seatIndex: i, playerId: u.id, stack: 20_000 })),
      seatCount: 6,
      buttonFixedPos: 0,
      smallBlindSeat: 1,
      bigBlindSeat: 2,
      smallBlind: 100,
      bigBlind: 200,
      bbAnte: 0,
    });
    // UTGがオープンし、以降は全員フォールド。BBも「レイズに直面して降りる」ので必ず1回行動する
    // (全員フォールドで回るとBBは行動せずに勝つため、6ポジション揃わない)。
    hand.applyAction(3, { kind: "raise", toAmount: 440 });
    for (const seatIndex of [4, 5, 0, 1, 2]) hand.applyAction(seatIndex, { kind: "fold" });

    await recordHand({
      tournamentId: tournament.id,
      handNumber: 1,
      buttonFixedPos: 0,
      levelSmallBlind: 100,
      levelBigBlind: 200,
      levelAnte: 0,
      seats: users.map((u, i) => ({
        seatIndex: i,
        userId: u.id,
        startingStack: 20_000,
        isSmallBlind: i === 1,
        isBigBlind: i === 2,
      })),
      hand,
    });

    const after = await getGeoPositionStats();

    // 6人全員が1回ずつ行動したので、6ポジションすべてがちょうど1ハンドぶん増える。
    // ここが均等に増えないなら、診断の数え方そのものにポジション依存の抜けがある。
    for (const pos of ["UTG", "HJ", "CO", "BTN", "SB", "BB"]) {
      expect(handsAt(after, pos) - handsAt(before, pos), `position ${pos}`).toBe(1);
    }

    // 母数側も辻褄が合うこと(素通りで0を比べているだけではないことの確認)。
    expect(after.totalHands).toBe(before.totalHands + 1);
    expect(after.seats.human).toBe(before.seats.human + 6);
    const preflopRows = (s: Awaited<ReturnType<typeof getGeoPositionStats>>) =>
      s.byStreet.find((x) => x.street === "preflop")?.rows ?? 0;
    expect(preflopRows(after) - preflopRows(before)).toBe(6);
  }, 60_000);
});
