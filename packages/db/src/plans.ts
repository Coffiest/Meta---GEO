import { prisma } from "./client.js";

/**
 * 有料プラン(オーナー確定。月額のみ。年額は今は作らない)。
 *
 * | | シルバー ¥980 | ゴールド ¥1,380 | プラチナ ¥1,890 |
 * |---|---|---|---|
 * | 棋譜解析(無制限・解説付き)・広告なし | ○ | ○ | ○ |
 * | GEO データベース | − | インマネ10回でプリフロップ / 20回でポストフロップ | 条件なしで全部 |
 * | データ研究 | − | − | ○ |
 * | 相手がマックした手札を見る | − | − | ○ |
 *
 * 無料プラン(未加入)は GEO を使えない。旧来の ¥980 の契約はシルバー。
 * 無料体験は7日間・どのプランでも・全プランを通して1人1回(同じカードの2回目も弾く)。
 * プランは途中で上げ下げできる(ゴールド → プラチナなど)。
 */
export type PlanId = "silver" | "gold" | "platinum";

export const PLAN_IDS: readonly PlanId[] = ["silver", "gold", "platinum"];

/** 月額(税込・円)。 */
export const PLAN_PRICE_JPY: Record<PlanId, number> = { silver: 980, gold: 1380, platinum: 1890 };

export const TRIAL_DAYS = 7;

const RANK: Record<PlanId, number> = { silver: 1, gold: 2, platinum: 3 };

export function parsePlan(value: unknown): PlanId | null {
  return value === "silver" || value === "gold" || value === "platinum" ? value : null;
}

/** plan が need 以上か(未加入 = null は常に false)。 */
export function planAtLeast(plan: PlanId | null, need: PlanId): boolean {
  return plan != null && RANK[plan] >= RANK[need];
}

/** まだ無料体験を使っていないか。 */
export async function isTrialEligible(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { trialUsedAt: true } });
  return user != null && user.trialUsedAt == null;
}

/** 無料体験を使ったと記録する(すでに記録があれば最初の時刻のまま)。 */
export async function markTrialUsed(userId: string, at: Date = new Date()): Promise<void> {
  await prisma.user.updateMany({ where: { id: userId, trialUsedAt: null }, data: { trialUsedAt: at } });
}

/**
 * 無料体験に使うカードの指紋を登録する。別の人がすでに体験に使ったカードなら false(体験は付けない)。
 * 同じ人が同じカードで再び通ってきた(Webhook の再送など)ときは true のまま。
 */
export async function claimTrialFingerprint(fingerprint: string, userId: string): Promise<boolean> {
  const existing = await prisma.trialFingerprint.findUnique({ where: { fingerprint } });
  if (existing) return existing.userId === userId;
  try {
    await prisma.trialFingerprint.create({ data: { fingerprint, userId } });
    return true;
  } catch {
    // 同時に登録された(一意制約)。登録した人が自分かどうかで決める。
    const row = await prisma.trialFingerprint.findUnique({ where: { fingerprint } });
    return row?.userId === userId;
  }
}
