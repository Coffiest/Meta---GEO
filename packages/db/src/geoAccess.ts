import { prisma } from "./client.js";

/**
 * GEO データベース(データベースタブ)の利用条件(オーナー確定)。トーナメントでインマネ(賞金圏で終える)した回数で段階的に解放する。
 *  - GEO_PREFLOP_ITM_REQUIRED 回: プリフロップまで
 *  - GEO_POSTFLOP_ITM_REQUIRED 回: ポストフロップ以降(とデータ研究)も
 * 有料プランかどうかに関係なく全員に同じ条件。SNG(通常・High Roller・Super High Roller)と MTT のすべてを数える。
 * MTT のリエントリーは1回ずつ数える。
 *
 * なぜ縛るか: GEO データベースは実際のプレイデータを貯めて成り立っている。たくさん遊んでもらってデータが貯まらないと
 * 役に立つデータベースにならないので、遊んでもらうための条件にしている(画面にも同じ説明を出す)。
 */
export const GEO_PREFLOP_ITM_REQUIRED = 10;
export const GEO_POSTFLOP_ITM_REQUIRED = 20;
/** 互換: 「GEO を使い始められる回数」= プリフロップの解放。 */
export const GEO_ITM_REQUIRED = GEO_PREFLOP_ITM_REQUIRED;

/** none = 使えない / preflop = プリフロップまで / full = ポストフロップ以降も全部。 */
export type GeoAccessLevel = "none" | "preflop" | "full";

const RANK: Record<GeoAccessLevel, number> = { none: 0, preflop: 1, full: 2 };

export function geoLevelAtLeast(level: GeoAccessLevel, need: GeoAccessLevel): boolean {
  return RANK[level] >= RANK[need];
}

export function geoLevelForItm(itmCount: number): GeoAccessLevel {
  if (itmCount >= GEO_POSTFLOP_ITM_REQUIRED) return "full";
  if (itmCount >= GEO_PREFLOP_ITM_REQUIRED) return "preflop";
  return "none";
}

/** インマネした回数(終了済みのエントリーのうち賞金が出たもの)。 */
export async function getItmCount(userId: string): Promise<number> {
  return prisma.tournamentEntry.count({
    where: { userId, finishPosition: { not: null }, payout: { gt: 0 } },
  });
}

export interface GeoAccess {
  itmCount: number;
  /** プリフロップの解放に必要な回数(互換のため `required` の名前のまま)。 */
  required: number;
  /** ポストフロップ以降の解放に必要な回数。 */
  postflopRequired: number;
  level: GeoAccessLevel;
  /** プリフロップまで使えるか(level が preflop 以上)。 */
  unlocked: boolean;
  /** ポストフロップ以降も使えるか(level が full)。 */
  postflopUnlocked: boolean;
}

export function geoAccessOf(itmCount: number, level: GeoAccessLevel): GeoAccess {
  return {
    itmCount,
    required: GEO_PREFLOP_ITM_REQUIRED,
    postflopRequired: GEO_POSTFLOP_ITM_REQUIRED,
    level,
    unlocked: geoLevelAtLeast(level, "preflop"),
    postflopUnlocked: level === "full",
  };
}

export async function getGeoAccess(userId: string): Promise<GeoAccess> {
  const itmCount = await getItmCount(userId);
  return geoAccessOf(itmCount, geoLevelForItm(itmCount));
}
