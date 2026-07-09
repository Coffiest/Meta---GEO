import { prisma } from "./client.js";

/**
 * 「トナメ偏差値」(RRRating)。RRPokerの `app/home/store/PrizeDistributeModal.tsx` にある
 * 実装と全く同じロジック(平均50・標準偏差10のT-score、経験ベイズ収縮でプレイ数が少ない
 * うちは母平均に寄せる)を、このアプリのROI(得た金額÷かけた金額)データに対して適用する。
 *
 *   roi = totalPayouts / totalBuyIns
 *   adjustedROI = (n/(n+k)) * roi + (k/(n+k)) * mu   (k=20, n=参加トナメ数)
 *   rrRating = sigma !== 0 ? 50 + 10 * ((adjustedROI - mu) / sigma) : 50
 *
 * mu(平均)・sigma(標準偏差)は、終了済みトーナメントに1回以上参加した全実プレイヤー(BOT除外)
 * を母集団として毎回その場で計算する(RRPoker同様、キャッシュテーブルは持たない)。
 */

const SHRINKAGE_K = 20;

export interface RRRatingEntry {
  userId: string;
  displayName: string;
  avatarKey: string | null;
  rrRating: number;
  roi: number;
  tournamentsPlayed: number;
}

/** 全実プレイヤーのトナメ偏差値を、偏差値の高い順に並べて返す。 */
export async function computeRRRatings(): Promise<RRRatingEntry[]> {
  const entries = await prisma.tournamentEntry.findMany({
    where: { tournament: { status: "finished" }, user: { isBot: false } },
    select: {
      payout: true,
      tournament: { select: { buyIn: true } },
      user: { select: { id: true, displayName: true, avatarKey: true } },
    },
  });

  const byUser = new Map<
    string,
    { userId: string; displayName: string; avatarKey: string | null; totalBuyIns: number; totalPayouts: number; plays: number }
  >();
  for (const e of entries) {
    let row = byUser.get(e.user.id);
    if (!row) {
      row = { userId: e.user.id, displayName: e.user.displayName, avatarKey: e.user.avatarKey, totalBuyIns: 0, totalPayouts: 0, plays: 0 };
      byUser.set(e.user.id, row);
    }
    row.totalBuyIns += e.tournament.buyIn;
    row.totalPayouts += e.payout;
    row.plays += 1;
  }

  const players = [...byUser.values()]
    .filter((p) => p.totalBuyIns > 0)
    .map((p) => ({ ...p, roi: p.totalPayouts / p.totalBuyIns }));

  const mu = players.length > 0 ? players.reduce((sum, p) => sum + p.roi, 0) / players.length : 0;

  const withAdjustedRoi = players.map((p) => {
    const n = p.plays;
    const adjustedROI = (n / (n + SHRINKAGE_K)) * p.roi + (SHRINKAGE_K / (n + SHRINKAGE_K)) * mu;
    return { ...p, adjustedROI };
  });

  const sigma = Math.sqrt(
    withAdjustedRoi.reduce((sum, p) => sum + Math.pow(p.adjustedROI - mu, 2), 0) / (withAdjustedRoi.length || 1),
  );

  return withAdjustedRoi
    .map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      avatarKey: p.avatarKey,
      rrRating: sigma !== 0 ? Number((50 + 10 * ((p.adjustedROI - mu) / sigma)).toFixed(2)) : 50,
      roi: p.roi,
      tournamentsPlayed: p.plays,
    }))
    .sort((a, b) => b.rrRating - a.rrRating);
}

export interface RRRatingResult {
  rrRating: number;
  roi: number;
  tournamentsPlayed: number;
  /** 全国順位(トナメ偏差値ランキング内、1始まり)。1トナメも参加していなければnull。 */
  nationalRank: number | null;
  totalRankedPlayers: number;
}

/** 特定ユーザーのトナメ偏差値+順位を返す。参加0件ならrrRating=50・順位null。 */
export async function getRRRating(userId: string): Promise<RRRatingResult> {
  const ratings = await computeRRRatings();
  const index = ratings.findIndex((r) => r.userId === userId);
  if (index === -1) {
    return { rrRating: 50, roi: 0, tournamentsPlayed: 0, nationalRank: null, totalRankedPlayers: ratings.length };
  }
  const entry = ratings[index]!;
  return {
    rrRating: entry.rrRating,
    roi: entry.roi,
    tournamentsPlayed: entry.tournamentsPlayed,
    nationalRank: index + 1,
    totalRankedPlayers: ratings.length,
  };
}
