import type { IncomingMessage, ServerResponse } from "node:http";
import {
  grantCompSubscription,
  revokeCompSubscription,
  searchUsersForAdmin,
  type CompDurationUnit,
} from "@meta-geo/db";

/**
 * 管理者API(`/api/admin/*`)。ログイン画面のバージョン表記→パスコード(既定2357)から開く
 * 管理者画面のバックエンド。すべてのルートで x-admin-passcode ヘッダーを検証する。
 * パスコードは環境変数 ADMIN_PASSCODE で上書き可能。
 */

function adminPasscode(): string {
  return process.env["ADMIN_PASSCODE"] ?? "2357";
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
  });
  res.end(JSON.stringify(body));
}

function passcodeOk(req: IncomingMessage): boolean {
  const header = req.headers["x-admin-passcode"];
  const value = Array.isArray(header) ? header[0] : header;
  return value === adminPasscode();
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);
    if (raw.length === 0) return {};
    return JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function handleAdminApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/admin/")) return false;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-admin-passcode",
    });
    res.end();
    return true;
  }

  if (!passcodeOk(req)) {
    sendJson(res, 401, { error: "unauthorized" });
    return true;
  }

  try {
    // プレイヤー検索(名前/メール部分一致)
    if (url.pathname === "/api/admin/users" && req.method === "GET") {
      const q = url.searchParams.get("q") ?? "";
      const users = await searchUsersForAdmin(q);
      sendJson(res, 200, { users });
      return true;
    }

    // 無料付与: { userId, unit: "week"|"month", amount: number }
    if (url.pathname === "/api/admin/grant" && req.method === "POST") {
      const body = await readJsonBody(req);
      const userId = typeof body["userId"] === "string" ? body["userId"] : "";
      const unit = body["unit"] === "week" || body["unit"] === "month" ? (body["unit"] as CompDurationUnit) : null;
      const amount = typeof body["amount"] === "number" ? body["amount"] : NaN;
      if (!userId || !unit || !Number.isFinite(amount) || amount <= 0) {
        sendJson(res, 400, { error: "userId, unit(week|month), amount(>0) are required" });
        return true;
      }
      const { currentPeriodEnd } = await grantCompSubscription({ userId, unit, amount });
      sendJson(res, 200, { ok: true, currentPeriodEnd: currentPeriodEnd.toISOString() });
      return true;
    }

    // 無料付与の取り消し: { userId }
    if (url.pathname === "/api/admin/revoke" && req.method === "POST") {
      const body = await readJsonBody(req);
      const userId = typeof body["userId"] === "string" ? body["userId"] : "";
      if (!userId) {
        sendJson(res, 400, { error: "userId is required" });
        return true;
      }
      const revoked = await revokeCompSubscription(userId);
      sendJson(res, 200, { ok: true, revoked });
      return true;
    }

    sendJson(res, 404, { error: "not found" });
    return true;
  } catch (err) {
    console.error("[admin] api error:", err);
    sendJson(res, 500, { error: "internal error" });
    return true;
  }
}
