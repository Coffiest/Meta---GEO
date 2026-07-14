import { prisma } from "./client.js";
import { RR_RATING_SHRINKAGE_K } from "./rrRating.js";

/**
 * ロビーの「リーダーボード」。4指標(収支/ROI/トナメ偏差値/インマネ率)× 3期間
 * (Weekly / All Time / 直近10トナメ)を、1リクエストで全プレイヤー分まとめて返す。
 * 各期間ごとにユーザーの4指標を同梱し、並べ替え(指標選択)はクライアント側で行う。
 * ランクインには「その期間で最低10トーナメント参加」を要求する。
 */

const MIN_TOURNAMENTS = 10;
const WEEKLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface LeaderboardUser {
  userId: string;
  displayName: string;
  avatarKey: string | null;
  /** 収支(payout - buyIn の合計)。 */
  profit: number;
  /** ROI(還元率)= 総payout / 総buyIn。1.5なら150%。 */
  roi: number;
  /** インマネ率(0-1)。 */
  itmRate: number;
  /** その期間の母集団内で算出したトナメ偏差値(平均50・標準偏差10)。 */
  rrRating: number;
  /** その期間の参加トーナメント数。 */
  tournamentsPlayed: number;
}

export interface Leaderboards {
  weekly: LeaderboardUser[];
  allTime: LeaderboardUser[];
  last10: LeaderboardUser[];
  /** ランクインに必要な最低トーナメント数(UI表示用)。 */
  minTournaments: number;
}

interface Entry {
  buyIn: number;
  payout: number;
  finishedAt: number; // epoch ms(新しい順ソート・週次フィルタ用)
}

interface UserAgg {
  userId: string;
  displayName: string;
  avatarKey: string | null;
  entries: Entry[];
}

/** 与えられた「ユーザー→そのユーザーが対象とするentries」から4指標を計算し、偏差値を母集団内で付与する。 */
function buildRanking(perUser: { user: UserAgg; entries: Entry[] }[]): LeaderboardUser[] {
  // 最低参加数を満たすユーザーのみ対象。
  const eligible = perUser.filter((p) => p.entries.length >= MIN_TOURNAMENTS);

  const base = eligible.map(({ user, entries }) => {
    const totalBuyIns = entries.reduce((s, e) => s + e.buyIn, 0);
    const totalPayouts = entries.reduce((s, e) => s + e.payout, 0);
    const itmCount = entries.filter((e) => e.payout > 0).length;
    const roi = totalBuyIns > 0 ? totalPayouts / totalBuyIns : 0;
    return {
      userId: user.userId,
      displayName: user.displayName,
      avatarKey: user.avatarKey,
      profit: totalPayouts - totalBuyIns,
      roi,
      itmRate: entries.length > 0 ? itmCount / entries.length : 0,
      tournamentsPlayed: entries.length,
      _plays: entries.length,
    };
  });

  // 偏差値: RRRatingと同じく、参加数で母平均へ収縮させたadjustedROIのT-score。
  const mu = base.length > 0 ? base.reduce((s, p) => s + p.roi, 0) / base.length : 0;
  const adjusted = base.map((p) => {
    const n = p._plays;
    const adjustedRoi = (n / (n + RR_RATING_SHRINKAGE_K)) * p.roi + (RR_RATING_SHRINKAGE_K / (n + RR_RATING_SHRINKAGE_K)) * mu;
    return { ...p, adjustedRoi };
  });
  const sigma = Math.sqrt(adjusted.reduce((s, p) => s + Math.pow(p.adjustedRoi - mu, 2), 0) / (adjusted.length || 1));

  return adjusted.map(({ _plays, adjustedRoi, ...rest }) => ({
    ...rest,
    rrRating: sigma !== 0 ? Number((50 + 10 * ((adjustedRoi - mu) / sigma)).toFixed(2)) : 50,
  }));
}

export async function getLeaderboards(): Promise<Leaderboards> {
  const rows = await prisma.tournamentEntry.findMany({
    where: { tournament: { status: "finished" }, user: { isBot: false } },
    select: {
      payout: true,
      tournament: { select: { buyIn: true, finishedAt: true, createdAt: true } },
      user: { select: { id: true, displayName: true, avatarKey: true } },
    },
  });

  const byUser = new Map<string, UserAgg>();
  for (const r of rows) {
    let agg = byUser.get(r.user.id);
    if (!agg) {
      agg = { userId: r.user.id, displayName: r.user.displayName, avatarKey: r.user.avatarKey, entries: [] };
      byUser.set(r.user.id, agg);
    }
    agg.entries.push({
      buyIn: r.tournament.buyIn,
      payout: r.payout,
      finishedAt: (r.tournament.finishedAt ?? r.tournament.createdAt).getTime(),
    });
  }

  const users = [...byUser.values()];
  const weekAgo = Date.now() - WEEKLY_WINDOW_MS;

  const allTime = buildRanking(users.map((user) => ({ user, entries: user.entries })));
  const weekly = buildRanking(
    users.map((user) => ({ user, entries: user.entries.filter((e) => e.finishedAt >= weekAgo) })),
  );
  const last10 = buildRanking(
    users.map((user) => ({
      user,
      // 新しい順に並べて直近10件だけを対象にする。
      entries: [...user.entries].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, MIN_TOURNAMENTS),
    })),
  );

  return { weekly, allTime, last10, minTournaments: MIN_TOURNAMENTS };
}
