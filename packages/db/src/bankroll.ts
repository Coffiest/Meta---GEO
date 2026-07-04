import { prisma } from "./client.js";

/** 新規サインアップ時に付与するバーチャルチップのボーナス */
export const SIGNUP_BONUS = 10_000;

/**
 * Supabase Authのauthidに対応するUserを取得し、無ければ作成する(初回ログイン時)。
 * 新規作成時のみサインアップボーナスをバンクロール台帳に記帳する。
 */
export async function getOrCreateUserByAuthId(params: {
  authId: string;
  email: string | null;
  displayName: string;
}): Promise<{ id: string; displayName: string; isNew: boolean }> {
  const existing = await prisma.user.findUnique({ where: { authId: params.authId } });
  if (existing) return { id: existing.id, displayName: existing.displayName, isNew: false };

  const user = await prisma.user.create({
    data: { authId: params.authId, email: params.email, displayName: params.displayName, isBot: false },
  });
  await prisma.bankrollTransaction.create({
    data: { userId: user.id, amount: SIGNUP_BONUS, kind: "signupBonus" },
  });
  return { id: user.id, displayName: user.displayName, isNew: true };
}

/** バンクロール残高(台帳のamount合計)。導出元は常にBankrollTransactionの1本。 */
export async function getBankrollBalance(userId: string): Promise<number> {
  const result = await prisma.bankrollTransaction.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

/** バイイン(参加費)をバンクロールから引き、台帳に記帳する。残高不足ならエラー。 */
export async function recordBuyIn(params: { userId: string; tournamentId: string; amount: number }): Promise<void> {
  const balance = await getBankrollBalance(params.userId);
  if (balance < params.amount) {
    throw new Error(`バンクロールが不足しています(残高${balance}、必要${params.amount})`);
  }
  await prisma.bankrollTransaction.create({
    data: {
      userId: params.userId,
      tournamentId: params.tournamentId,
      amount: -params.amount,
      kind: "buyIn",
    },
  });
}

/** トーナメント成績に応じた賞金をバンクロールへ払い出し、台帳に記帳する(0円なら記帳しない)。 */
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
  bankroll: number;
  tournamentsPlayed: number;
  itmCount: number;
  /** イン・ザ・マネー率(0-1) */
  itmRate: number;
  totalBuyIns: number;
  totalPayouts: number;
  /** 収支(総payout - 総buyin) */
  profit: number;
  /** ROI = 収支 / 総buyin (buyinが0なら0) */
  roi: number;
}

/** ROI・収支・イン・ザ・マネー率などのロビー用サマリースタッツ。 */
export async function getPlayerStats(userId: string): Promise<PlayerStats> {
  const [bankroll, entries] = await Promise.all([
    getBankrollBalance(userId),
    prisma.tournamentEntry.findMany({
      where: { userId, tournament: { status: "finished" } },
      select: { payout: true, tournament: { select: { buyIn: true } } },
    }),
  ]);

  const tournamentsPlayed = entries.length;
  const itmCount = entries.filter((e) => e.payout > 0).length;
  const totalBuyIns = entries.reduce((sum, e) => sum + e.tournament.buyIn, 0);
  const totalPayouts = entries.reduce((sum, e) => sum + e.payout, 0);
  const profit = totalPayouts - totalBuyIns;

  return {
    bankroll,
    tournamentsPlayed,
    itmCount,
    itmRate: tournamentsPlayed > 0 ? itmCount / tournamentsPlayed : 0,
    totalBuyIns,
    totalPayouts,
    profit,
    roi: totalBuyIns > 0 ? profit / totalBuyIns : 0,
  };
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

  // 賞金圏人数: 6人以下(SnG想定)は上位2名、それ以上(MTT想定)は上位15%(最低1名)
  const paidPlaces = fieldSize <= 6 ? Math.min(2, fieldSize) : Math.max(1, Math.round(fieldSize * 0.15));

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
