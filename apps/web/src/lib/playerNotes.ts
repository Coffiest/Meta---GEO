"use client";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

/** マーキング5色。サーバー(packages/db/playerNotes)の定義と対応。 */
export const PLAYER_NOTE_COLORS = ["red", "orange", "yellow", "blue", "purple"] as const;
export type PlayerNoteColor = (typeof PLAYER_NOTE_COLORS)[number];

/** 各マーキング色の表示用HEX(黒枠線Swissのアクセントとして席カードに小さなドットで出す)。 */
export const PLAYER_NOTE_COLOR_HEX: Record<PlayerNoteColor, string> = {
  red: "#e5484d",
  orange: "#f2760b",
  yellow: "#e0b400",
  blue: "#3987e5",
  purple: "#8e4ec6",
};

export const PLAYER_NOTE_COLOR_LABEL: Record<PlayerNoteColor, string> = {
  red: "レッド",
  orange: "オレンジ",
  yellow: "イエロー",
  blue: "ブルー",
  purple: "パープル",
};

export interface PlayerNote {
  color: PlayerNoteColor | null;
  note: string;
}

export interface PlayerStatsSummary {
  tournamentsPlayed: number;
  itmRate: number;
  profit: number;
  roi: number;
  nationalRank: number | null;
  totalRankedPlayers: number;
  vpipRate: number;
  pfrRate: number;
  threeBetRate: number;
}

export interface RRRatingSummary {
  rrRating: number;
  nationalRank: number | null;
  totalRankedPlayers: number;
  tournamentsPlayed: number;
}

export interface PublicPlayerProfile {
  id: string;
  displayName: string;
  avatarKey: string | null;
  stats: PlayerStatsSummary;
  rrRating: RRRatingSummary;
}

/** 対戦相手の公開プロフィール(スタッツ+偏差値)を取得。BOT/存在しない場合はnull。 */
export async function fetchPlayerProfile(accessToken: string, userId: string): Promise<PublicPlayerProfile | null> {
  const res = await fetch(`${SERVER_URL}/api/lobby/player?userId=${encodeURIComponent(userId)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as PublicPlayerProfile;
}

/** 自分が相手につけたメモ&マーキングを取得。 */
export async function fetchPlayerNote(accessToken: string, userId: string): Promise<PlayerNote> {
  const res = await fetch(`${SERVER_URL}/api/lobby/player-note?userId=${encodeURIComponent(userId)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { color: null, note: "" };
  return (await res.json()) as PlayerNote;
}

/** 複数相手のマーキング&メモをまとめて取得(テーブル上の全席のマーキング描画用)。 */
export async function fetchPlayerNotes(
  accessToken: string,
  userIds: readonly string[],
): Promise<Record<string, PlayerNote>> {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return {};
  const res = await fetch(`${SERVER_URL}/api/lobby/player-notes?userIds=${encodeURIComponent(ids.join(","))}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return {};
  return (await res.json()) as Record<string, PlayerNote>;
}

/** メモ&マーキングを保存。 */
export async function savePlayerNote(
  accessToken: string,
  targetUserId: string,
  color: PlayerNoteColor | null,
  note: string,
): Promise<PlayerNote> {
  const res = await fetch(`${SERVER_URL}/api/lobby/player-note`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ targetUserId, color, note }),
  });
  if (!res.ok) return { color, note };
  return (await res.json()) as PlayerNote;
}
