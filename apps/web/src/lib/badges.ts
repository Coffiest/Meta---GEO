"use client";

/** バッジ図鑑のクライアント側ヘルパー(サーバーの getBadgeCollection と対応)。 */

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

export type BadgeKey = "tournaments" | "wins" | "itm" | "hands" | "rating" | "invites" | "rank";

export interface Badge {
  key: BadgeKey;
  tier: number;
  target: number;
  current: number | null;
  achieved: boolean;
}

export interface BadgeCollection {
  badges: Badge[];
  achievedCount: number;
  totalCount: number;
  totalRankedPlayers: number;
}

/** 図鑑での表示順(獲得しやすい順ではなく、プレイの流れに沿った系統順)。 */
export const BADGE_KEY_ORDER: BadgeKey[] = ["tournaments", "wins", "itm", "hands", "rating", "rank", "invites"];

/** 達成条件のラベル。順位だけ「◯位以内」と意味が変わるため分けている。 */
export function badgeTargetLabel(badge: Badge, t: (key: string, vars?: Record<string, string | number>) => string): string {
  return badge.key === "rank"
    ? t("badge.targetRank", { n: badge.target.toLocaleString() })
    : t(`badge.target.${badge.key}`, { n: badge.target.toLocaleString() });
}

/** 未達成バッジの進捗(0-1)。順位バッジは「あと何位」を直感的に測れないため進捗を出さない。 */
export function badgeProgress(badge: Badge): number | null {
  if (badge.achieved) return 1;
  if (badge.key === "rank" || badge.current === null) return null;
  if (badge.target <= 0) return null;
  return Math.max(0, Math.min(1, badge.current / badge.target));
}

export async function fetchBadgeCollection(accessToken: string): Promise<BadgeCollection | null> {
  const res = await fetch(`${SERVER_URL}/api/lobby/badges`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as BadgeCollection;
}
