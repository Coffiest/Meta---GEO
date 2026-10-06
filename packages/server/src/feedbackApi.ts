import type { IncomingMessage, ServerResponse } from "node:http";
import {
  FEEDBACK_IMAGE_MIMES,
  FEEDBACK_MAX_IMAGE_BYTES,
  FEEDBACK_MAX_IMAGES,
  countRecentFeedback,
  createFeedback,
  isFeedbackKind,
  prisma,
  type FeedbackImageInput,
} from "@meta-geo/db";
import { authAvailable, verifyAccessToken } from "./auth.js";

/**
 * ホームの「ご意見フォーム」の受け口(`POST /api/feedback`)。ログイン必須。
 *
 * 本文: { kind: "request" | "bug" | "other", body: string, appVersion?: string,
 *        images?: { mime: string, data: string(base64) }[] }
 * 写真は端末側で縮小・JPEG 化してから送ってくる。ここでは枚数・大きさ・中身の種類(先頭のバイト)を確かめる。
 * 連投の制限: 1人あたり1時間に FEEDBACK_PER_HOUR 件まで。
 */
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const FEEDBACK_PER_HOUR = 10;

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

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > MAX_BODY_BYTES) return null;
    chunks.push(buf);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 先頭のバイトで画像の種類を確かめる(申告された mime を鵜呑みにしない)。 */
export function sniffImageMime(data: Buffer): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

/** 受け取った写真の配列を検証して取り出す。不正なら理由の文字列を返す。 */
export function parseFeedbackImages(raw: unknown): FeedbackImageInput[] | string {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return "images must be an array";
  if (raw.length > FEEDBACK_MAX_IMAGES) return "too many images";
  const out: FeedbackImageInput[] = [];
  for (const item of raw) {
    const data = (item as { data?: unknown })?.data;
    if (typeof data !== "string" || data.length === 0) return "invalid image";
    const buf = Buffer.from(data.replace(/^data:[^,]*,/, ""), "base64");
    if (buf.length === 0 || buf.length > FEEDBACK_MAX_IMAGE_BYTES) return "image too large";
    const mime = sniffImageMime(buf);
    if (!mime || !(FEEDBACK_IMAGE_MIMES as readonly string[]).includes(mime)) return "unsupported image";
    out.push({ mime, data: buf });
  }
  return out;
}

export async function handleFeedbackApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/api/feedback") return false;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    });
    res.end();
    return true;
  }
  if (req.method !== "POST") {
    send(res, 405, { error: "method not allowed" });
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
  if ((await countRecentFeedback(user.id, new Date(Date.now() - 60 * 60_000))) >= FEEDBACK_PER_HOUR) {
    send(res, 429, { error: "too many", code: "FEEDBACK_RATE" });
    return true;
  }

  const body = await readJsonBody(req);
  if (!body) {
    send(res, 400, { error: "invalid body" });
    return true;
  }
  const kind = body["kind"];
  const text = typeof body["body"] === "string" ? body["body"] : "";
  if (!isFeedbackKind(kind)) {
    send(res, 400, { error: "invalid kind" });
    return true;
  }
  const images = parseFeedbackImages(body["images"]);
  if (typeof images === "string") {
    send(res, 400, { error: images });
    return true;
  }
  if (!text.trim() && images.length === 0) {
    send(res, 400, { error: "empty" });
    return true;
  }
  const appVersion = typeof body["appVersion"] === "string" ? body["appVersion"] : null;
  const ua = req.headers["user-agent"];
  const created = await createFeedback({
    userId: user.id,
    kind,
    body: text,
    appVersion,
    userAgent: typeof ua === "string" ? ua : null,
    images,
  });
  send(res, 201, { ok: true, id: created.id });
  return true;
}
