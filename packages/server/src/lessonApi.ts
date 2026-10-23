import type { IncomingMessage, ServerResponse } from "node:http";
import { completeLesson, getLessonOverview, prisma, startLesson } from "@meta-geo/db";
import { authAvailable, verifyAccessToken } from "./auth.js";

/**
 * Lesson タブの受け口(ログイン必須)。
 *  GET  /api/lessons           → 回数と進み具合
 *  POST /api/lessons/start     { lessonId } → 始められたら 200、回数切れは 403 LESSON_LIMIT
 *  POST /api/lessons/complete  { lessonId, stars }
 * 回数に数えないレッスン(ルール説明)はサーバー側の一覧で決める(画面の申告を信じない)。
 */
const FREE_LESSON_IDS = new Set(["rules"]);
const LESSON_ID = /^[a-z0-9-]{1,40}$/;

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function bearer(req: IncomingMessage): string | undefined {
  const header = req.headers["authorization"];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.startsWith("Bearer ") ? value.slice("Bearer ".length) : undefined;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > 4096) return {};
    chunks.push(chunk as Buffer);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function handleLessonApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/lessons")) return false;
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    });
    res.end();
    return true;
  }
  if (!authAvailable()) {
    send(res, 503, { error: "auth unavailable" });
    return true;
  }
  const verified = await verifyAccessToken(bearer(req));
  if (!verified) {
    send(res, 401, { error: "unauthorized" });
    return true;
  }
  const user = await prisma.user.findUnique({ where: { authId: verified.authId }, select: { id: true } });
  if (!user) {
    send(res, 401, { error: "unauthorized" });
    return true;
  }

  if (url.pathname === "/api/lessons" && req.method === "GET") {
    send(res, 200, await getLessonOverview(user.id));
    return true;
  }
  if (req.method === "POST" && (url.pathname === "/api/lessons/start" || url.pathname === "/api/lessons/complete")) {
    const body = await readJson(req);
    const lessonId = typeof body["lessonId"] === "string" ? body["lessonId"] : "";
    if (!LESSON_ID.test(lessonId)) {
      send(res, 400, { error: "bad lessonId" });
      return true;
    }
    if (url.pathname === "/api/lessons/start") {
      const ok = await startLesson(user.id, lessonId, FREE_LESSON_IDS.has(lessonId));
      send(res, ok ? 200 : 403, ok ? { ok: true } : { error: "LESSON_LIMIT" });
    } else {
      const stars = typeof body["stars"] === "number" ? body["stars"] : 0;
      await completeLesson(user.id, lessonId, stars);
      send(res, 200, { ok: true });
    }
    return true;
  }
  send(res, 404, { error: "not found" });
  return true;
}
