import { prisma } from "./client.js";

/**
 * GEO データベース(データベースタブ)の利用条件: トーナメントでインマネ(賞金圏で終える)した回数が
 * GEO_ITM_REQUIRED 回以上(オーナー確定)。有料プランかどうかに関係なく全員に同じ条件。
 * SNG(通常・High Roller・Super High Roller)と MTT のすべてを数える。MTT のリエントリーは1回ずつ数える。
 */
export const GEO_ITM_REQUIRED = 20;

/** インマネした回数(終了済みのエントリーのうち賞金が出たもの)。 */
export async function getItmCount(userId: string): Promise<number> {
  return prisma.tournamentEntry.count({
    where: { userId, finishPosition: { not: null }, payout: { gt: 0 } },
  });
}

export interface GeoAccess {
  itmCount: number;
  required: number;
  unlocked: boolean;
}

export async function getGeoAccess(userId: string): Promise<GeoAccess> {
  const itmCount = await getItmCount(userId);
  return { itmCount, required: GEO_ITM_REQUIRED, unlocked: itmCount >= GEO_ITM_REQUIRED };
}
