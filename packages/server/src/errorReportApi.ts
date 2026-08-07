import type { IncomingMessage, ServerResponse } from "node:http";
import { createErrorReport } from "@meta-geo/db";
import { authAvailable, verifyAccessToken } from "./auth.js";
import { recordError } from "./diagnostics.js";

/**
 * ユーザーからのエラー報告の受け口(`POST /api/error-report`)。
 *
 * エラーはログアウト状態でも起きるため認証は必須にしない。アクセストークンが
 * 添えられていれば報告者を紐付ける(誰の環境で起きたかを追えるようにする)。
 *
 * 濫用対策として、本文サイズとIPあたりの送信レートに上限を置く。
 * (保存側でも文字数を切り詰めるので、ここは「受け取る前に弾く」ための粗い防壁。)
 */

/** 受け付けるリクエストボディの上限。これを超えたら読み切らずに切る。 */
const MAX_BODY_BYTES = 64 * 1024;
/** 同一IPからの送信レート上限(ウィンドウとその中での最大件数)。 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 12;

const rateBuckets = new Map<string, { count: number; windowStartedAt: number }>();

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

/** レート超過なら true。ウィンドウを跨いだらカウンタをリセットする。 */
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.windowStartedAt > RATE_WINDOW_MS) {
    rateBuckets.set(ip, { count: 1, windowStartedAt: now });
    // 溜まり続けないよう、たまに古いエントリを掃除する。
    if (rateBuckets.size > 5_000) {
      for (const [key, v] of rateBuckets) {
        if (now - v.windowStartedAt > RATE_WINDOW_MS) rateBuckets.delete(key);
      }
    }
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_MAX_PER_WINDOW;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
  });
  res.end(JSON.stringify(body));
}

/** サイズ上限つきでJSONボディを読む。上限超過は null を返す。 */
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
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

export async function handleErrorReportApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/api/error-report") return false;

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
    sendJson(res, 405, { error: "method not allowed" });
    return true;
  }

  if (rateLimited(clientIp(req))) {
    sendJson(res, 429, { error: "報告の送信が多すぎます。しばらく待ってから再度お試しください。" });
    return true;
  }

  try {
    const body = await readJsonBody(req);
    if (!body) {
      sendJson(res, 400, { error: "報告内容が大きすぎるか、形式が不正です。" });
      return true;
    }

    const scope = asString(body["scope"]);
    const message = asString(body["message"]);
    if (!scope || !message) {
      sendJson(res, 400, { error: "scope と message は必須です。" });
      return true;
    }

    // ログイン中なら報告者を紐付ける。トークンが無効でも報告自体は受け付ける
    // (エラーの多くはログインできない状況で起きるため、ここで弾いてはいけない)。
    let userId: string | null = null;
    if (authAvailable()) {
      const token = asString(body["accessToken"]);
      if (token) {
        const verified = await verifyAccessToken(token).catch(() => null);
        if (verified) {
          const { prisma } = await import("@meta-geo/db");
          const user = await prisma.user.findUnique({ where: { authId: verified.authId }, select: { id: true } });
          userId = user?.id ?? null;
        }
      }
    }

    const created = await createErrorReport({
      scope,
      message,
      detail: asString(body["detail"]),
      context: body["context"],
      appVersion: asString(body["appVersion"]),
      // UAはヘッダーを正とする(クライアント側の申告より信頼できる)。
      userAgent: asString(req.headers["user-agent"]) ?? asString(body["userAgent"]),
      url: asString(body["url"]),
      userId,
    });

    // 運営が気づけるよう、受信自体もサーバーログへ残す。
    console.warn(`[error-report] ${scope}: ${message.slice(0, 200)} (id=${created.id})`);
    sendJson(res, 200, { ok: true, id: created.id });
    return true;
  } catch (err) {
    recordError("errorReportApi", err);
    sendJson(res, 500, { error: "報告の保存に失敗しました。" });
    return true;
  }
}
