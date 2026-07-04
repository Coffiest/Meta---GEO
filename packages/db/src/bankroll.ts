import { prisma } from "./client.js";

/**
 * 収支(バンクロール)はTenFourPokerと同様の「±方式」: 残高という疑似通貨を貯める仕組みではなく、
 * バイイン(-)と賞金(+)の累計をプラスマイナスの収支として表示する。台帳(BankrollTransaction)は
 * その導出元として引き続き1本で管理する(残高キャッシュは持たない)。
 */

/**
 * Supabase AuthのauthIdに対応するUserを取得し、無ければ作成する(初回ログイン時)。
 * 新規ユーザーは未オンボーディング状態(onboarded=false)で作られ、名前+アバターを
 * 設定するまでロビーには入れない。
 */
export async function getOrCreateUserByAuthId(params: {
  authId: string;
  email: string | null;
  displayName: string;
}): Promise<{ id: string; displayName: string; avatarKey: string | null; onboarded: boolean; isNew: boolean }> {
  const existing = await prisma.user.findUnique({ where: { authId: params.authId } });
  if (existing) {
    return {
      id: existing.id,
      displayName: existing.displayName,
      avatarKey: existing.avatarKey,
      onboarded: existing.onboarded,
      isNew: false,
    };
  }

  const user = await prisma.user.create({
    data: { authId: params.authId, email: params.email, displayName: params.displayName, isBot: false },
  });
  return { id: user.id, displayName: user.displayName, avatarKey: user.avatarKey, onboarded: user.onboarded, isNew: true };
}

/** オンボーディング(名前+アバター)を保存し、完了フラグを立てる。 */
export async function completeOnboarding(params: {
  userId: string;
  displayName: string;
  avatarKey: string;
}): Promise<void> {
  await prisma.user.update({
    where: { id: params.userId },
    data: { displayName: params.displayName, avatarKey: params.avatarKey, onboarded: true },
  });
}

/** 累計収支(賞金合計 - バイイン合計)。±で表示するための値。 */
export async function getNetProfit(userId: string): Promise<number> {
  const result = await prisma.bankrollTransaction.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

/**
 * バイイン(参加費)を台帳に記帳する。±方式のため「残高不足で参加できない」状態は存在せず、
 * 収支がマイナスに沈むだけ(TenFourPokerと同じく参加自体は常に可能)。
 */
export async function recordBuyIn(params: { userId: string; tournamentId: string; amount: number }): Promise<void> {
  if (params.amount <= 0) return;
  await prisma.bankrollTransaction.create({
    data: {
      userId: params.userId,
      tournamentId: params.tournamentId,
      amount: -params.amount,
      kind: "buyIn",
    },
  });
}

/** トーナメント成績に応じた賞金を台帳に記帳する(0なら記帳しない)。 */
export async function recordPayout(params: { userId: string; tournamentId: string; amount: number }): Promise<void> {
  if (params.amount <= 0) return;
  await prisma.bankrollTransaction.create({
    data: {
      userId: params.userId,
      tournamentId: params.tournamentId,
      amount: params.amount,
      kind: "payout",
    },
  });
}

export interface PlayerStats {
  tournamentsPlayed: number;
  itmCount: number;
  /** イン・ザ・マネー率(0-1) */
  itmRate: number;
  totalBuyIns: number;
  totalPayouts: number;
  /** 収支(総payout - 総buyin)。±方式のメイン指標。 */
  profit: number;
  /** ROI = 収支 / 総buyin (buyinが0なら0) */
  roi: number;
}

/** ROI・収支・イン・ザ・マネー率などのロビー用サマリースタッツ。 */
export async function getPlayerStats(userId: string): Promise<PlayerStats> {
  const entries = await prisma.tournamentEntry.findMany({
    where: { userId, tournament: { status: "finished" } },
    select: { payout: true, tournament: { select: { buyIn: true } } },
  });

  const tournamentsPlayed = entries.length;
  const itmCount = entries.filter((e) => e.payout > 0).length;
  const totalBuyIns = entries.reduce((sum, e) => sum + e.tournament.buyIn, 0);
  const totalPayouts = entries.reduce((sum, e) => sum + e.payout, 0);
  const profit = totalPayouts - totalBuyIns;

  return {
    tournamentsPlayed,
    itmCount,
    itmRate: tournamentsPlayed > 0 ? itmCount / tournamentsPlayed : 0,
    totalBuyIns,
    totalPayouts,
    profit,
    roi: totalBuyIns > 0 ? profit / totalBuyIns : 0,
  };
}

export interface LeaderboardRow {
  userId: string;
  displayName: string;
  avatarKey: string | null;
  profit: number;
  roi: number;
  tournamentsPlayed: number;
}

/**
 * 全プレイヤー(実ユーザーのみ、BOT除外)の収支ランキング。
 * 終了済みトーナメントのバイイン/賞金から集計する。
 */
export async function getLeaderboard(limit = 50): Promise<LeaderboardRow[]> {
  const entries = await prisma.tournamentEntry.findMany({
    where: { tournament: { status: "finished" }, user: { isBot: false } },
    select: {
      payout: true,
      tournament: { select: { buyIn: true } },
      user: { select: { id: true, displayName: true, avatarKey: true } },
    },
  });

  const byUser = new Map<string, LeaderboardRow & { totalBuyIns: number }>();
  for (const e of entries) {
    let row = byUser.get(e.user.id);
    if (!row) {
      row = {
        userId: e.user.id,
        displayName: e.user.displayName,
        avatarKey: e.user.avatarKey,
        profit: 0,
        roi: 0,
        tournamentsPlayed: 0,
        totalBuyIns: 0,
      };
      byUser.set(e.user.id, row);
    }
    row.tournamentsPlayed += 1;
    row.totalBuyIns += e.tournament.buyIn;
    row.profit += e.payout - e.tournament.buyIn;
  }

  return [...byUser.values()]
    .map((r) => ({ ...r, roi: r.totalBuyIns > 0 ? r.profit / r.totalBuyIns : 0 }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, limit)
    .map(({ totalBuyIns: _totalBuyIns, ...row }) => row);
}

export interface HandHistoryRow {
  handId: string;
  playedAt: Date;
  position: string;
  holeCards: string[];
  board: string[];
  /** ヒーローの収支(チップ) */
  deltaChips: number;
  bigBlind: number;
}

const POSITION_TABLE_6MAX = ["BTN", "SB", "BB", "UTG", "HJ", "CO"];

/** 指定ユーザーのハンド履歴(TenFourのHand History画面相当)。新しい順。 */
export async function getUserHandHistory(userId: string, limit = 100): Promise<HandHistoryRow[]> {
  const seats = await prisma.handSeat.findMany({
    where: { userId },
    orderBy: { hand: { createdAt: "desc" } },
    take: limit,
    include: {
      hand: {
        select: {
          id: true,
          createdAt: true,
          board: true,
          buttonFixedPos: true,
          levelBigBlind: true,
          tournament: { select: { seatCount: true } },
        },
      },
    },
  });

  return seats.map((s) => {
    const seatCount = s.hand.tournament.seatCount;
    const offset = (((s.seatIndex - s.hand.buttonFixedPos) % seatCount) + seatCount) % seatCount;
    return {
      handId: s.hand.id,
      playedAt: s.hand.createdAt,
      position: POSITION_TABLE_6MAX[offset] ?? `+${offset}`,
      holeCards: s.holeCards,
      board: s.hand.board,
      deltaChips: s.resultStackDelta,
      bigBlind: s.hand.levelBigBlind,
    };
  });
}

export interface PayoutPlace {
  place: number;
  amount: number;
}

/**
 * シンプルな線形減衰の賞金配分(1着が最も多く、賞金圏の各着が均等差で減っていく)。
 * TDA等の公式ルールに「賞金配分の決まり」は無く運営(=このアプリ)側の裁量のため、
 * 分かりやすく調整しやすい形にしてある。
 */
export function computePayoutStructure(fieldSize: number, buyIn: number): PayoutPlace[] {
  const prizePool = fieldSize * buyIn;
  if (prizePool <= 0 || fieldSize <= 1) return [];

  // 賞金圏人数: 6人以下(SnG想定)は上位2名、それ以上(MTT想定)は上位15%(最低2名)
  const paidPlaces = fieldSize <= 6 ? Math.min(2, fieldSize) : Math.max(2, Math.round(fieldSize * 0.15));

  const weights = Array.from({ length: paidPlaces }, (_, i) => paidPlaces - i);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  let distributed = 0;
  const payouts: PayoutPlace[] = weights.map((w, i) => {
    const amount = i === paidPlaces - 1 ? prizePool - distributed : Math.round((prizePool * w) / weightSum);
    distributed += amount;
    return { place: i + 1, amount };
  });

  return payouts;
}
