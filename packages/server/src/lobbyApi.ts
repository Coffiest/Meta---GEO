import type { IncomingMessage, ServerResponse } from "node:http";
import { getPlayerStats, prisma } from "@meta-geo/db";
import { verifyAccessToken } from "./auth.js";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
  });
  res.end(payload);
}

function extractBearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers["authorization"];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith("Bearer ")) return undefined;
  return value.slice("Bearer ".length);
}

const EMPTY_STATS = {
  bankroll: 0,
  tournamentsPlayed: 0,
  itmCount: 0,
  itmRate: 0,
  totalBuyIns: 0,
  totalPayouts: 0,
  profit: 0,
  roi: 0,
};

/**
 * ロビー画面用のREST API。`/api/lobby/*` 配下のリクエストを処理する。
 * 該当するルートがなければ false を返す(呼び出し側で404にフォールバックする)。
 */
export async function handleLobbyApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/lobby/")) return false;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    });
    res.end();
    return true;
  }

  try {
    if (url.pathname === "/api/lobby/stats") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await prisma.user.findUnique({ where: { authId: verified.authId } });
      sendJson(res, 200, user ? await getPlayerStats(user.id) : EMPTY_STATS);
      return true;
    }

    sendJson(res, 404, { error: "not found" });
    return true;
  } catch (err) {
    console.error("[lobbyApi] request failed:", err);
    sendJson(res, 500, { error: "internal error" });
    return true;
  }
}
