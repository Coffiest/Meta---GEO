import { prisma } from "./client.js";

/**
 * 管理者による利用停止(BAN)。オーナー指示 2026-10-12。
 * - 利用停止中は卓に参加できない(サーバーの joinGame で弾く)。アプリは利用停止の画面だけになる。
 * - 理由は管理用のメモで、本人には見せない。
 * - 解除すると元どおり使える(記録は消さず、bannedAt を null に戻す)。
 */
export async function setUserBanned(userId: string, banned: boolean, reason: string | null = null): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: banned ? { bannedAt: new Date(), bannedReason: reason } : { bannedAt: null, bannedReason: null },
    select: { id: true },
  });
}

export async function isUserBanned(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { bannedAt: true } });
  return user?.bannedAt != null;
}
