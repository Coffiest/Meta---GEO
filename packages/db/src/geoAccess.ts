import { prisma } from "./client.js";
import type { PlanId } from "./plans.js";
import { getSubscriptionStatusForUser } from "./subscriptions.js";

/**
 * GEO データベース(データベースタブ)の利用条件(オーナー確定)。トーナメントでインマネ(賞金圏で終える)した回数で段階的に解放する。
 *  - GEO_PREFLOP_ITM_REQUIRED 回: プリフロップまで
 *  - GEO_POSTFLOP_ITM_REQUIRED 回: ポストフロップ以降(とデータ研究)も
 * これに有料プランの上限をかける(オーナー確定): 無料・シルバーは使えない / ゴールドは回数どおり / プラチナは条件なしで全部。
 * データ研究はプラチナだけ。管理者の個別設定(geoAccessOverride)はプランに関係なく上乗せする。SNG(通常・High Roller・Super High Roller)と MTT のすべてを数える。
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
  /** いま使えるプラン(未加入は null)。 */
  plan: PlanId | null;
  /** データ研究を使えるか(プラチナ・管理者が「全部」に緩めた人)。 */
  researchUnlocked: boolean;
}

export function geoAccessOf(
  itmCount: number,
  level: GeoAccessLevel,
  plan: PlanId | null = null,
  researchUnlocked = false
): GeoAccess {
  return {
    plan,
    researchUnlocked,
    itmCount,
    required: GEO_PREFLOP_ITM_REQUIRED,
    postflopRequired: GEO_POSTFLOP_ITM_REQUIRED,
    level,
    unlocked: geoLevelAtLeast(level, "preflop"),
    postflopUnlocked: level === "full",
  };
}

/** 2つの段階の高い方。 */
export function maxGeoLevel(a: GeoAccessLevel, b: GeoAccessLevel): GeoAccessLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

/** 管理者が個別に緩めた段階(User.geoAccessOverride)。"preflop" / "full" 以外は「無し」。 */
export type GeoAccessOverride = Exclude<GeoAccessLevel, "none">;

export function parseGeoOverride(value: unknown): GeoAccessOverride | null {
  return value === "preflop" || value === "full" ? value : null;
}

/** プランだけで決まる段階: 無料・シルバーは none、ゴールドは回数どおり、プラチナは full。 */
export function geoLevelForPlan(itmCount: number, plan: PlanId | null): GeoAccessLevel {
  if (plan === "platinum") return "full";
  if (plan === "gold") return geoLevelForItm(itmCount);
  return "none";
}

/** プラン・インマネの回数・管理者の個別設定から、使える段階を決める(個別設定は緩める方向にだけ効く)。 */
export function effectiveGeoLevel(itmCount: number, override: GeoAccessOverride | null, plan: PlanId | null): GeoAccessLevel {
  const byPlan = geoLevelForPlan(itmCount, plan);
  return override ? maxGeoLevel(byPlan, override) : byPlan;
}

export async function getGeoAccess(userId: string): Promise<GeoAccess> {
  const [itmCount, user, subscription] = await Promise.all([
    getItmCount(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { geoAccessOverride: true } }),
    getSubscriptionStatusForUser(userId),
  ]);
  const override = parseGeoOverride(user?.geoAccessOverride);
  const plan = subscription.plan;
  return geoAccessOf(
    itmCount,
    effectiveGeoLevel(itmCount, override, plan),
    plan,
    plan === "platinum" || override === "full"
  );
}

/** 管理者画面: プレイヤーごとの GEO の利用条件の個別設定(null で回数どおりに戻す)。 */
export async function setGeoAccessOverride(userId: string, override: GeoAccessOverride | null): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { geoAccessOverride: override } });
}

/** 管理者画面の一覧用: インマネの回数・個別設定・実際に使える段階。 */
export interface AdminGeoAccess {
  itmCount: number;
  override: GeoAccessOverride | null;
  level: GeoAccessLevel;
}

export async function getAdminGeoAccess(userIds: readonly string[]): Promise<Map<string, AdminGeoAccess>> {
  const result = new Map<string, AdminGeoAccess>();
  if (userIds.length === 0) return result;
  const [counts, users] = await Promise.all([
    prisma.tournamentEntry.groupBy({
      by: ["userId"],
      where: { userId: { in: [...userIds] }, finishPosition: { not: null }, payout: { gt: 0 } },
      _count: { _all: true },
    }),
    prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, geoAccessOverride: true } }),
  ]);
  const countOf = new Map(counts.map((c) => [c.userId, c._count._all]));
  for (const u of users) {
    const itmCount = countOf.get(u.id) ?? 0;
    const override = parseGeoOverride(u.geoAccessOverride);
    // 一覧は件数が少ない(検索結果)ので、プランは1人ずつ引く(期限切れ・クーポンの扱いを1か所に揃えるため)。
    const { plan } = await getSubscriptionStatusForUser(u.id);
    result.set(u.id, { itmCount, override, level: effectiveGeoLevel(itmCount, override, plan) });
  }
  return result;
}
