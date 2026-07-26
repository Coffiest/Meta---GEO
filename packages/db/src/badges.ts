import { prisma } from "./client.js";
import { getPlayerStats } from "./bankroll.js";
import { getRRRating } from "./rrRating.js";

/**
 * バッジ図鑑。プレイの積み重ねが「集めたくなる形」で可視化されると、
 * あと1戦・あと1勝の理由になり、獲得の瞬間そのものが共有のネタになる(バイラル設計)。
 *
 * バッジはすべて既存の実績から導出する(専用テーブルは持たない)。授与テーブルを作ると
 * 過去プレイヤーへの遡及付与や再計算のズレが発生するため、常に現在値からの導出に統一する。
 */

/** しきい値が「以上」で達成となる系統。 */
const ASCENDING_BADGES = [
  { key: "tournaments", steps: [1, 10, 50, 100, 500] },
  { key: "wins", steps: [1, 5, 10] },
  { key: "itm", steps: [1, 10, 50] },
  { key: "hands", steps: [100, 1000, 10000] },
  { key: "rating", steps: [55, 60, 65] },
  { key: "invites", steps: [1, 3, 5, 10] },
] as const;

/** 全国順位は「以下」で達成となる(小さいほど上位)。 */
const RANK_STEPS = [100, 10, 1] as const;

export type BadgeKey = (typeof ASCENDING_BADGES)[number]["key"] | "rank";

export interface Badge {
  /** 系統(ラベルはWeb側のi18n `badge.<key>.*` で解決する)。 */
  key: BadgeKey;
  /** その系統の何段目か(1始まり)。 */
  tier: number;
  /** 達成条件の数値(順位系は「◯位以内」)。 */
  target: number;
  /** 現在値(順位系は現在の全国順位。未ランクはnull)。 */
  current: number | null;
  achieved: boolean;
}

export interface BadgeCollection {
  badges: Badge[];
  achievedCount: number;
  totalCount: number;
  /** ランキング母数(順位バッジの表示に使う)。 */
  totalRankedPlayers: number;
}

/** バッジ図鑑の全状態。達成済み/未達成と、未達成バッジの現在値(進捗)を含む。 */
export async function getBadgeCollection(userId: string): Promise<BadgeCollection> {
  const [stats, rating, wins, hands, invites] = await Promise.all([
    getPlayerStats(userId),
    getRRRating(userId),
    prisma.tournamentEntry.count({ where: { userId, finishPosition: 1 } }),
    prisma.handSeat.count({ where: { userId } }),
    prisma.referral.count({ where: { inviterUserId: userId } }),
  ]);

  const currentByKey: Record<(typeof ASCENDING_BADGES)[number]["key"], number> = {
    tournaments: stats.tournamentsPlayed,
    wins,
    itm: stats.itmCount,
    hands,
    // 偏差値は小数を切り捨てて扱う(55.9は「55到達」)。
    rating: Math.floor(rating.rrRating),
    invites,
  };

  const badges: Badge[] = [];
  for (const def of ASCENDING_BADGES) {
    def.steps.forEach((target, i) => {
      const current = currentByKey[def.key];
      badges.push({ key: def.key, tier: i + 1, target, current, achieved: current >= target });
    });
  }
  RANK_STEPS.forEach((target, i) => {
    const current = rating.nationalRank;
    // 母数がしきい値に満たないランキングでの「TOP◯◯」は意味を持たないので未達成のままにする。
    const meaningful = rating.totalRankedPlayers >= Math.max(target, 2);
    badges.push({
      key: "rank",
      tier: i + 1,
      target,
      current,
      achieved: current !== null && current <= target && meaningful,
    });
  });

  return {
    badges,
    achievedCount: badges.filter((b) => b.achieved).length,
    totalCount: badges.length,
    totalRankedPlayers: rating.totalRankedPlayers,
  };
}
