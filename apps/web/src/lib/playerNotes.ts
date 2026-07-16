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

// --- 自動プレイヤー用の擬似スタッツ ---
// 対戦相手として着席する自動プレイヤーも、タップしたときに通常プレイヤーと同じ内容(収支/ROI/
// インマネ率/全国順位/VPIP/PFR/3BET/偏差値)を表示する。userId をシードにした決定論的な擬似乱数で
// 生成するため、同じ相手なら常に同じ数字になり、リアルなプレイヤーと見分けがつかない。

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** userId から決定論的に、通常プレイヤーと区別のつかない現実的なスタッツを生成する。 */
export function syntheticPlayerProfile(userId: string, displayName: string, avatarKey: string | null): PublicPlayerProfile {
  const r = mulberry32(hashString(userId || displayName));
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);

  const tournamentsPlayed = Math.floor(between(35, 420));
  const itmRate = between(0.12, 0.34);
  const roi = between(0.78, 1.55);
  const avgBuyIn = between(1000, 2000);
  const profit = Math.round((roi - 1) * avgBuyIn * tournamentsPlayed);
  const vpipRate = between(0.16, 0.36);
  const pfrRate = Math.min(vpipRate - 0.02, between(0.1, 0.28));
  const threeBetRate = between(0.03, 0.1);
  const rrRating = between(41, 63);
  const totalRankedPlayers = Math.floor(between(1200, 4800));
  // 偏差値が高いほど順位が上(数字が小さい)になるよう素朴にマッピングする。
  const pctile = Math.min(0.99, Math.max(0.01, 1 - (rrRating - 35) / 30));
  const nationalRank = Math.max(1, Math.round(pctile * totalRankedPlayers));

  return {
    id: userId,
    displayName,
    avatarKey,
    stats: { tournamentsPlayed, itmRate, profit, roi, nationalRank, totalRankedPlayers, vpipRate, pfrRate, threeBetRate },
    rrRating: { rrRating, nationalRank, totalRankedPlayers, tournamentsPlayed },
  };
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
