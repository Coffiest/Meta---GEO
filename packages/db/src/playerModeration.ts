import { prisma } from "./client.js";

/** 通報理由の分類。UI側(PlayerDetailModal)の選択肢と対応させる。 */
export const PLAYER_REPORT_REASONS = ["harassment", "inappropriate", "cheating", "other"] as const;
export type PlayerReportReason = (typeof PLAYER_REPORT_REASONS)[number];

function normalizeReason(reason: unknown): PlayerReportReason {
  return typeof reason === "string" && (PLAYER_REPORT_REASONS as readonly string[]).includes(reason)
    ? (reason as PlayerReportReason)
    : "other";
}

/**
 * ユーザーからの通報を記録する(App Store審査ガイドライン1.2対応)。
 * 自動処理は行わず、管理者が後から確認するための記録のみを残す。
 */
export async function reportPlayer(
  reporterUserId: string,
  reportedUserId: string,
  reason: string,
  context: string,
): Promise<void> {
  await prisma.playerReport.create({
    data: {
      reporterUserId,
      reportedUserId,
      reason: normalizeReason(reason),
      context: context.slice(0, 500),
    },
  });
}

/** 自分がブロックしている相手のUser.id一覧を取得する(チャット表示のフィルタリング用)。 */
export async function getBlockedUserIds(blockerUserId: string): Promise<string[]> {
  const rows = await prisma.playerBlock.findMany({
    where: { blockerUserId },
    select: { blockedUserId: true },
  });
  return rows.map((r) => r.blockedUserId);
}

/**
 * 相手をブロック/ブロック解除する(片方向: 自分の画面からだけ相手の発言が消える)。
 * ブロック解除後の再表示は、以降に届く新しいチャットのみが対象(過去ログの遡及復元はしない)。
 */
export async function setPlayerBlocked(
  blockerUserId: string,
  blockedUserId: string,
  blocked: boolean,
): Promise<void> {
  if (blocked) {
    await prisma.playerBlock.upsert({
      where: { blockerUserId_blockedUserId: { blockerUserId, blockedUserId } },
      create: { blockerUserId, blockedUserId },
      update: {},
    });
  } else {
    await prisma.playerBlock
      .delete({ where: { blockerUserId_blockedUserId: { blockerUserId, blockedUserId } } })
      .catch(() => undefined);
  }
}
