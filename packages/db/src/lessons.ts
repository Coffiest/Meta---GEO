import { prisma } from "./client.js";
import { getSubscriptionStatusForUser } from "./subscriptions.js";

/**
 * レッスン(Lesson タブ)の回数と進み具合(オーナー確定)。
 * - 無料・シルバーは1日3レッスンまで。開始した時に数える。同じ日に同じレッスンをやり直しても数えない。
 * - 日付は日本時間の0時で切り替わる。ゴールド以上は無制限。
 * - 回数は必ずサーバーで数える(画面だけだと入れ直しで抜けられる)。
 */
export const FREE_LESSONS_PER_DAY = 3;

/** 日本時間の日付 "YYYY-MM-DD"。 */
export function jstDay(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function unlimited(userId: string): Promise<boolean> {
  const s = await getSubscriptionStatusForUser(userId);
  return s.active && (s.plan === "gold" || s.plan === "platinum");
}

export interface LessonOverview {
  unlimited: boolean;
  /** 今日あと何レッスン始められるか(無制限なら null)。 */
  remainingToday: number | null;
  progress: { lessonId: string; completed: boolean; bestStars: number; startedToday: boolean }[];
}

export async function getLessonOverview(userId: string): Promise<LessonOverview> {
  const today = jstDay();
  const [isUnlimited, rows] = await Promise.all([
    unlimited(userId),
    prisma.lessonProgress.findMany({
      where: { userId },
      select: { lessonId: true, completedAt: true, bestStars: true, lastStartedDay: true },
    }),
  ]);
  const usedToday = rows.filter((r) => r.lastStartedDay === today).length;
  return {
    unlimited: isUnlimited,
    remainingToday: isUnlimited ? null : Math.max(0, FREE_LESSONS_PER_DAY - usedToday),
    progress: rows.map((r) => ({
      lessonId: r.lessonId,
      completed: r.completedAt !== null,
      bestStars: r.bestStars,
      startedToday: r.lastStartedDay === today,
    })),
  };
}

/**
 * レッスンを始める。回数が足りなければ false。
 * `free` のレッスン(ルール説明)は回数に数えない。
 */
export async function startLesson(userId: string, lessonId: string, free: boolean): Promise<boolean> {
  const today = jstDay();
  const existing = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
    select: { lastStartedDay: true },
  });
  if (existing?.lastStartedDay === today || (free && existing)) return true;
  if (!free && !(await unlimited(userId))) {
    const usedToday = await prisma.lessonProgress.count({ where: { userId, lastStartedDay: today } });
    if (usedToday >= FREE_LESSONS_PER_DAY) return false;
  }
  // 回数に数えないレッスンは日付の代わりに "free" を入れる(今日の開始数に入らない)。
  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    update: { lastStartedDay: free ? "free" : today },
    create: { userId, lessonId, lastStartedDay: free ? "free" : today },
    select: { id: true },
  });
  return true;
}

/** レッスンを終えた(星は最高記録だけ残す)。 */
export async function completeLesson(userId: string, lessonId: string, stars: number): Promise<void> {
  const s = Math.max(0, Math.min(3, Math.round(stars)));
  const row = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
    select: { bestStars: true },
  });
  if (!row) return;
  await prisma.lessonProgress.update({
    where: { userId_lessonId: { userId, lessonId } },
    data: { completedAt: new Date(), bestStars: Math.max(row.bestStars, s) },
    select: { id: true },
  });
}
