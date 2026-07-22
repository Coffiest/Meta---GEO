import { prisma } from "./client.js";

/**
 * 管理者用: GEO戦略DBからの任意プレイヤーのプレイライン除外(論理削除)。
 *
 * アクション行(HandAction)の物理削除は行わない — 同卓の他プレイヤーのライン再生が壊れるため。
 * 代わりに HandSeat.excludedFromGeo を立て、geoTreeの集計(countedSeats)から完全に外す。
 * 期間(from/to)を指定すると、その期間にプレイされたハンドのみ除外できる(「一部削除」)。
 */

export interface GeoDataCounts {
  totalHands: number;
  excludedHands: number;
}

/** 指定ユーザーたちのGEOデータ件数(総ハンド数/除外済み数)をまとめて取得する。 */
export async function getGeoDataCounts(userIds: readonly string[]): Promise<Map<string, GeoDataCounts>> {
  if (userIds.length === 0) return new Map();
  const [totals, excluded] = await Promise.all([
    prisma.handSeat.groupBy({ by: ["userId"], where: { userId: { in: [...userIds] } }, _count: { _all: true } }),
    prisma.handSeat.groupBy({
      by: ["userId"],
      where: { userId: { in: [...userIds] }, excludedFromGeo: true },
      _count: { _all: true },
    }),
  ]);
  const result = new Map<string, GeoDataCounts>();
  for (const id of userIds) result.set(id, { totalHands: 0, excludedHands: 0 });
  for (const t of totals) result.get(t.userId)!.totalHands = t._count._all;
  for (const e of excluded) result.get(e.userId)!.excludedHands = e._count._all;
  return result;
}

/**
 * 指定ユーザーのプレイラインをGEO集計から除外する。from/to(ハンドのプレイ日時)を指定すると
 * その期間のみ、未指定なら全期間が対象。除外した件数を返す。
 */
export async function excludeGeoData(params: { userId: string; from?: Date; to?: Date }): Promise<number> {
  const handFilter =
    params.from || params.to
      ? {
          hand: {
            createdAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          },
        }
      : {};
  const result = await prisma.handSeat.updateMany({
    where: { userId: params.userId, excludedFromGeo: false, ...handFilter },
    data: { excludedFromGeo: true },
  });
  return result.count;
}

/** 指定ユーザーの除外をすべて解除する(復元)。解除した件数を返す。 */
export async function restoreGeoData(userId: string): Promise<number> {
  const result = await prisma.handSeat.updateMany({
    where: { userId, excludedFromGeo: true },
    data: { excludedFromGeo: false },
  });
  return result.count;
}
