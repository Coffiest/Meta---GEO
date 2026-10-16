import { prisma } from "./client.js";
import { RANKED_TOURNAMENT } from "./rankedGame.js";

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
 * 無料体験は7日間・どのプランでも。**インマネ10回ごとに1回、1時間だけ出る特別オファー**のときだけ使える
 * (オーナー確定 2026-10-12。以前は「はじめての方は1人1回」)。別の人が体験に使ったカードでは付かない。
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

/** 特別オファーが出るインマネの間隔(10回ごと)。 */
export const TRIAL_OFFER_ITM_STEP = 10;
/** 特別オファーの有効時間(出てから1時間)。 */
export const TRIAL_OFFER_WINDOW_MS = 60 * 60 * 1000;

/** インマネの回数から、オファーを出す区切り(10, 20, 30…。10回未満は 0)。 */
export function trialOfferMilestone(itmCount: number): number {
  return Math.floor(Math.max(0, itmCount) / TRIAL_OFFER_ITM_STEP) * TRIAL_OFFER_ITM_STEP;
}

/**
 * インマネの回数が新しい区切り(10, 20, 30…)に届いていれば、特別オファー(7日間無料・1時間だけ)を出す。
 * 出ているオファーの期限を返す(出ていない・期限切れ・使った後は null)。何度呼んでも、区切り1つにオファーは1回。
 * インマネは賞金が出て終えたトーナメント(geoAccess.ts の getItmCount と同じ数え方)。
 */
export async function refreshTrialOffer(userId: string, now: Date = new Date()): Promise<Date | null> {
  const [user, itmCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { trialOfferMilestone: true, trialOfferUntil: true } }),
    prisma.tournamentEntry.count({ where: { userId, finishPosition: { not: null }, payout: { gt: 0 }, tournament: RANKED_TOURNAMENT } }),
  ]);
  if (!user) return null;
  const milestone = trialOfferMilestone(itmCount);
  if (milestone >= TRIAL_OFFER_ITM_STEP && milestone > user.trialOfferMilestone) {
    const until = new Date(now.getTime() + TRIAL_OFFER_WINDOW_MS);
    // 同時に呼ばれても区切り1つにつき1回だけ出す(古い区切りのときだけ書く)。
    const updated = await prisma.user.updateMany({
      where: { id: userId, trialOfferMilestone: { lt: milestone } },
      data: { trialOfferMilestone: milestone, trialOfferUntil: until },
    });
    if (updated.count > 0) return until;
    const again = await prisma.user.findUnique({ where: { id: userId }, select: { trialOfferUntil: true } });
    return again?.trialOfferUntil && again.trialOfferUntil > now ? again.trialOfferUntil : null;
  }
  return user.trialOfferUntil && user.trialOfferUntil > now ? user.trialOfferUntil : null;
}

/** いま7日間無料で始められるか(特別オファーの期限内)。 */
export async function isTrialEligible(userId: string, now: Date = new Date()): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { trialOfferUntil: true } });
  return user?.trialOfferUntil != null && user.trialOfferUntil > now;
}

/** 無料体験を使ったと記録する。出ていたオファーは使い切る(trialUsedAt は最初の時刻のまま)。 */
export async function markTrialUsed(userId: string, at: Date = new Date()): Promise<void> {
  await prisma.user.updateMany({ where: { id: userId, trialUsedAt: null }, data: { trialUsedAt: at } });
  await prisma.user.updateMany({ where: { id: userId }, data: { trialOfferUntil: null } });
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
