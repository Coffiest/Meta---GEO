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

/**
 * 与えられた「ユーザー→そのユーザーが対象とするentries」から4指標を計算し、偏差値を付与する。
 * 偏差値のT-scoreはRRRating(ホームタブのgetRRRating)と完全に一致させるため、母集団は
 * 「その期間にbuyInがある全ユーザー」で計算する(最低参加数フィルタは表示リストにのみ適用)。
 * こうしないとAll Time期間の偏差値がホームタブの値とズレる。
 */
function buildRanking(perUser: { user: UserAgg; entries: Entry[] }[]): LeaderboardUser[] {
  // まず全ユーザーの指標を計算(偏差値の母集団はここから作る)。
  const all = perUser.map(({ user, entries }) => {
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
      totalBuyIns,
      plays: entries.length,
    };
  });

  // 偏差値の母集団: buyInがある全ユーザー(getRRRating.computeRRRatingsと同一定義)。
  const population = all.filter((p) => p.totalBuyIns > 0);
  const mu = population.length > 0 ? population.reduce((s, p) => s + p.roi, 0) / population.length : 0;
  const adjustedRoiOf = (roi: number, n: number) =>
    (n / (n + RR_RATING_SHRINKAGE_K)) * roi + (RR_RATING_SHRINKAGE_K / (n + RR_RATING_SHRINKAGE_K)) * mu;
  const sigma = Math.sqrt(
    population.reduce((s, p) => s + Math.pow(adjustedRoiOf(p.roi, p.plays) - mu, 2), 0) / (population.length || 1),
  );

  // 表示は最低参加数を満たすユーザーのみ。偏差値は上の母集団統計で算出。
  return all
    .filter((p) => p.plays >= MIN_TOURNAMENTS)
    .map(({ totalBuyIns: _totalBuyIns, plays, ...rest }) => {
      const adjustedRoi = adjustedRoiOf(rest.roi, plays);
      return {
        ...rest,
        rrRating: sigma !== 0 ? Number((50 + 10 * ((adjustedRoi - mu) / sigma)).toFixed(2)) : 50,
      };
    });
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
