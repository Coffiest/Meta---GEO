import { prisma } from "./client.js";

/** マーキングに使える5色。UI側(PlayerDetailModal)の定義と対応させる。 */
export const PLAYER_NOTE_COLORS = ["red", "orange", "yellow", "blue", "purple"] as const;
export type PlayerNoteColor = (typeof PLAYER_NOTE_COLORS)[number];

export interface PlayerNoteEntry {
  color: PlayerNoteColor | null;
  note: string;
}

function normalizeColor(color: unknown): PlayerNoteColor | null {
  return typeof color === "string" && (PLAYER_NOTE_COLORS as readonly string[]).includes(color)
    ? (color as PlayerNoteColor)
    : null;
}

/** authorがtargetにつけているメモ&マーキングを取得(無ければnull色・空メモ)。 */
export async function getPlayerNote(authorUserId: string, targetUserId: string): Promise<PlayerNoteEntry> {
  const row = await prisma.playerNote.findUnique({
    where: { authorUserId_targetUserId: { authorUserId, targetUserId } },
    select: { color: true, note: true },
  });
  return { color: normalizeColor(row?.color), note: row?.note ?? "" };
}

/**
 * authorが複数のtargetにつけているメモ&マーキングをまとめて取得する
 * (テーブル上の全席のマーキングを一度に描画するため)。targetUserId→PlayerNoteのMap。
 */
export async function getPlayerNotesForTargets(
  authorUserId: string,
  targetUserIds: readonly string[],
): Promise<Record<string, PlayerNoteEntry>> {
  if (targetUserIds.length === 0) return {};
  const rows = await prisma.playerNote.findMany({
    where: { authorUserId, targetUserId: { in: [...targetUserIds] } },
    select: { targetUserId: true, color: true, note: true },
  });
  const map: Record<string, PlayerNoteEntry> = {};
  for (const r of rows) map[r.targetUserId] = { color: normalizeColor(r.color), note: r.note };
  return map;
}

/** authorがtargetにつけるメモ&マーキングを保存(upsert)。色・メモとも空なら行を削除する。 */
export async function upsertPlayerNote(
  authorUserId: string,
  targetUserId: string,
  color: PlayerNoteColor | null,
  note: string,
): Promise<PlayerNoteEntry> {
  const trimmed = note.slice(0, 500);
  const normalizedColor = normalizeColor(color);
  if (!normalizedColor && trimmed.trim().length === 0) {
    await prisma.playerNote
      .delete({ where: { authorUserId_targetUserId: { authorUserId, targetUserId } } })
      .catch(() => undefined);
    return { color: null, note: "" };
  }
  await prisma.playerNote.upsert({
    where: { authorUserId_targetUserId: { authorUserId, targetUserId } },
    create: { authorUserId, targetUserId, color: normalizedColor, note: trimmed },
    update: { color: normalizedColor, note: trimmed },
  });
  return { color: normalizedColor, note: trimmed };
}
