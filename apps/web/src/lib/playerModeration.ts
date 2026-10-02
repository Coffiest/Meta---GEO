"use client";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

/** 通報理由の分類。サーバー(packages/db/playerModeration)の定義と対応。 */
export const PLAYER_REPORT_REASONS = ["harassment", "inappropriate", "cheating", "other"] as const;
export type PlayerReportReason = (typeof PLAYER_REPORT_REASONS)[number];

export const PLAYER_REPORT_REASON_LABEL: Record<PlayerReportReason, string> = {
  harassment: "嫌がらせ・迷惑行為",
  inappropriate: "不適切な発言",
  cheating: "不正行為の疑い",
  other: "その他",
};

/** 自分がブロックしている相手のUser.id一覧を取得。 */
export async function fetchBlockedUserIds(accessToken: string): Promise<string[]> {
  const res = await fetch(`${SERVER_URL}/api/lobby/player-blocks`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { blockedUserIds: string[] };
  return data.blockedUserIds;
}

/** 相手をブロック/ブロック解除する。 */
export async function setPlayerBlocked(
  accessToken: string,
  targetUserId: string,
  blocked: boolean,
): Promise<boolean> {
  const res = await fetch(`${SERVER_URL}/api/lobby/player-block`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ targetUserId, blocked }),
  });
  if (!res.ok) return !blocked;
  const data = (await res.json()) as { blocked: boolean };
  return data.blocked;
}

/** 相手を通報する。 */
export async function reportPlayer(
  accessToken: string,
  targetUserId: string,
  reason: PlayerReportReason,
  context: string,
): Promise<void> {
  await fetch(`${SERVER_URL}/api/lobby/player-report`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ targetUserId, reason, context }),
  });
}
