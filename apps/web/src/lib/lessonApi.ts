"use client";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

export interface LessonOverview {
  unlimited: boolean;
  /** 今日あと何レッスン始められるか(無制限なら null)。 */
  remainingToday: number | null;
  progress: { lessonId: string; completed: boolean; bestStars: number; startedToday: boolean }[];
}

export async function fetchLessonOverview(accessToken: string): Promise<LessonOverview | null> {
  const res = await fetch(`${SERVER_URL}/api/lessons`, { headers: { authorization: `Bearer ${accessToken}` } });
  return res.ok ? ((await res.json()) as LessonOverview) : null;
}

/** 始められれば "ok"、今日の回数を使い切っていれば "limit"。 */
export async function startLesson(accessToken: string, lessonId: string): Promise<"ok" | "limit" | "error"> {
  const res = await fetch(`${SERVER_URL}/api/lessons/start`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ lessonId }),
  });
  if (res.ok) return "ok";
  return res.status === 403 ? "limit" : "error";
}

export async function completeLesson(accessToken: string, lessonId: string, stars: number): Promise<void> {
  await fetch(`${SERVER_URL}/api/lessons/complete`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ lessonId, stars }),
  }).catch(() => {});
}
