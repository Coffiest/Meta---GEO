import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/client.js";
import { deleteAccount, DELETED_USER_DISPLAY_NAME } from "../src/accountDeletion.js";

/**
 * 退会処理の要件は2つあり、どちらも外せない。
 *  1. 本人性(ログイン情報・表示名・個人データ)が確実に消えること
 *  2. GEO DATABASE の実データ = ハンド履歴が **1件も** 消えないこと
 * ここが壊れると「退会したのに残る」か「退会したらGEO統計が変わる」のどちらかになる。
 */
describe("account deletion (integration, real Postgres)", () => {
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];

  afterAll(async () => {
    // 後片付け: ハンド→トーナメント→ユーザーの順に消す(外部キーの向きに合わせる)。
    for (const tid of createdTournamentIds) {
      const hands = await prisma.hand.findMany({ where: { tournamentId: tid }, select: { id: true } });
      const handIds = hands.map((h) => h.id);
      if (handIds.length > 0) {
        await prisma.handAction.deleteMany({ where: { handId: { in: handIds } } });
        await prisma.handPot.deleteMany({ where: { handId: { in: handIds } } });
        await prisma.handSeat.deleteMany({ where: { handId: { in: handIds } } });
        await prisma.hand.deleteMany({ where: { id: { in: handIds } } });
      }
      await prisma.tournamentEntry.deleteMany({ where: { tournamentId: tid } });
      await prisma.tournament.deleteMany({ where: { id: tid } });
    }
    if (createdUserIds.length > 0) {
      await prisma.playerNote.deleteMany({ where: { authorUserId: { in: createdUserIds } } });
      await prisma.pushSubscription.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  /** ハンド履歴(GEOの実データ)を1件持つユーザーを用意する。 */
  async function makeUserWithHandHistory(suffix: string) {
    const user = await prisma.user.create({
      data: {
        authId: `auth-${suffix}`,
        email: `${suffix}@example.test`,
        displayName: `テスト${suffix}`,
        avatarKey: "a1",
        onboarded: true,
        referralCode: `RC${suffix.toUpperCase().slice(0, 6)}`,
      },
    });
    createdUserIds.push(user.id);

    const tournament = await prisma.tournament.create({
      data: { seatCount: 6, startingStack: 10000, status: "finished", gameType: "sng", buyIn: 1000 },
    });
    createdTournamentIds.push(tournament.id);

    const hand = await prisma.hand.create({
      data: {
        tournamentId: tournament.id,
        handNumber: 1,
        buttonFixedPos: 0,
        levelSmallBlind: 100,
        levelBigBlind: 200,
        levelAnte: 200,
        board: [],
        potTotal: 600,
        wonByFold: true,
      },
    });
    await prisma.handSeat.create({
      data: {
        handId: hand.id,
        userId: user.id,
        seatIndex: 0,
        startingStack: 10000,
        holeCards: ["As", "Kd"],
        resultStackDelta: 400,
      },
    });
    return { user, tournament, hand };
  }

  it("個人データは消え、User行は匿名化されるが、ハンド履歴(GEOデータ)は1件も消えない", async () => {
    const suffix = `del${Date.now()}`;
    const { user, hand } = await makeUserWithHandHistory(suffix);

    // 個人データを一通り作る。
    await prisma.pushSubscription.create({
      data: { userId: user.id, endpoint: `https://push.test/${suffix}`, p256dh: "p", auth: "a" },
    });
    await prisma.geoViewUsage.create({ data: { userId: user.id, date: "2026-08-07", count: 3 } });

    const handSeatsBefore = await prisma.handSeat.count({ where: { userId: user.id } });
    const handsBefore = await prisma.hand.count();
    expect(handSeatsBefore).toBe(1);

    const result = await deleteAccount(user.id);
    expect(result.alreadyDeleted).toBe(false);
    expect(result.authId).toBe(`auth-${suffix}`);
    expect(result.keptHandSeats).toBe(1);

    // --- GEOデータ: 1件も消えていないこと ---
    expect(await prisma.handSeat.count({ where: { userId: user.id } })).toBe(handSeatsBefore);
    expect(await prisma.hand.count()).toBe(handsBefore);
    // ハンドの中身(ホールカード)もそのまま = 集計結果が変わらない。
    const seat = await prisma.handSeat.findFirst({ where: { handId: hand.id, userId: user.id } });
    expect(seat?.holeCards).toEqual(["As", "Kd"]);

    // --- 本人性: 消えていること ---
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after).not.toBeNull();
    expect(after!.authId).toBeNull();
    expect(after!.email).toBeNull();
    expect(after!.displayName).toBe(DELETED_USER_DISPLAY_NAME);
    expect(after!.avatarKey).toBeNull();
    expect(after!.onboarded).toBe(false);
    expect(after!.referralCode).toBeNull();
    expect(after!.deletedAt).not.toBeNull();
    // BOT扱いに変えない(GEO集計の対象条件を変えないため)。
    expect(after!.isBot).toBe(false);

    // --- 個人データ: 物理削除されていること ---
    expect(await prisma.pushSubscription.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.geoViewUsage.count({ where: { userId: user.id } })).toBe(0);
  });

  it("二重に実行しても安全(2回目は何もしない)", async () => {
    const suffix = `twice${Date.now()}`;
    const { user } = await makeUserWithHandHistory(suffix);

    const first = await deleteAccount(user.id);
    expect(first.alreadyDeleted).toBe(false);
    const second = await deleteAccount(user.id);
    expect(second.alreadyDeleted).toBe(true);

    // 2回目でもハンド履歴は残ったまま。
    expect(await prisma.handSeat.count({ where: { userId: user.id } })).toBe(1);
  });

  it("自分と相手の双方向のプレイヤーメモが消える", async () => {
    const a = `noteA${Date.now()}`;
    const b = `noteB${Date.now()}`;
    const { user: userA } = await makeUserWithHandHistory(a);
    const { user: userB } = await makeUserWithHandHistory(b);

    await prisma.playerNote.create({ data: { authorUserId: userA.id, targetUserId: userB.id, note: "自分が書いた" } });
    await prisma.playerNote.create({ data: { authorUserId: userB.id, targetUserId: userA.id, note: "書かれた" } });

    await deleteAccount(userA.id);

    expect(await prisma.playerNote.count({ where: { authorUserId: userA.id } })).toBe(0);
    expect(await prisma.playerNote.count({ where: { targetUserId: userA.id } })).toBe(0);
  });

  it("自動プレイヤーは退会できない", async () => {
    const bot = await prisma.user.create({
      data: { displayName: "bot", isBot: true, onboarded: true },
    });
    createdUserIds.push(bot.id);
    await expect(deleteAccount(bot.id)).rejects.toThrow(/bot/);
  });
});
