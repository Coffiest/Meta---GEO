import type { IncomingMessage, ServerResponse } from "node:http";
import {
  checkAndIncrementDailyGeoView,
  getGeoSummaryStats,
  getHandDetail,
  getOrCreateUserByAuthId,
  getPositionalRfiStats,
  getRangeMatrix,
  getRecentHands,
  type RangeScenario,
} from "@meta-geo/db";
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

/**
 * GEO戦略DBのREST API。`/api/geo/*` 配下のリクエストを処理する。
 * まだ規模が小さいのでフレームワークは使わず、素朴なパスマッチングで実装している。
 * 該当するルートがなければ false を返す(呼び出し側で404にフォールバックする)。
 *
 * サブスク未加入ユーザーは1日あたりの無料閲覧回数制限(checkAndIncrementDailyGeoView)の
 * 範囲内でのみアクセス可能。ログイン必須(認証はSupabaseアクセストークン)。
 */
export async function handleGeoApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/geo/")) return false;

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
    const verified = await verifyAccessToken(extractBearerToken(req));
    if (!verified) {
      sendJson(res, 401, { error: "unauthorized" });
      return true;
    }
    const fallbackName = verified.email?.split("@")[0] ?? "Player";
    const user = await getOrCreateUserByAuthId({
      authId: verified.authId,
      email: verified.email,
      displayName: fallbackName,
    });

    const dailyView = await checkAndIncrementDailyGeoView(user.id);
    if (!dailyView.allowed) {
      sendJson(res, 403, { error: "daily_limit_reached", limit: dailyView.limit });
      return true;
    }

    if (url.pathname === "/api/geo/summary") {
      sendJson(res, 200, await getGeoSummaryStats());
      return true;
    }

    if (url.pathname === "/api/geo/positional-rfi") {
      const seatCount = Number(url.searchParams.get("seatCount") ?? 6);
      sendJson(res, 200, await getPositionalRfiStats(seatCount));
      return true;
    }

    if (url.pathname === "/api/geo/hands") {
      const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 20));
      const offset = Number(url.searchParams.get("offset") ?? 0);
      sendJson(res, 200, await getRecentHands(limit, offset));
      return true;
    }

    // GTO Wizard風レンジブラウザ用: ポジション×シナリオの169ハンドクラス別頻度マトリクス
    if (url.pathname === "/api/geo/range-matrix") {
      const position = url.searchParams.get("position") ?? "";
      const scenarioParam = url.searchParams.get("scenario") ?? "rfi";
      const scenario: RangeScenario = scenarioParam === "vsOpen" ? "vsOpen" : "rfi";
      if (!position) {
        sendJson(res, 400, { error: "positionは必須です" });
        return true;
      }
      sendJson(res, 200, await getRangeMatrix(position, scenario));
      return true;
    }

    const handDetailMatch = url.pathname.match(/^\/api\/geo\/hands\/([^/]+)$/);
    if (handDetailMatch) {
      const detail = await getHandDetail(handDetailMatch[1]!);
      if (!detail) {
        sendJson(res, 404, { error: "hand not found" });
      } else {
        sendJson(res, 200, detail);
      }
      return true;
    }

    sendJson(res, 404, { error: "not found" });
    return true;
  } catch (err) {
    console.error("[geoApi] request failed:", err);
    sendJson(res, 500, { error: "internal error" });
    return true;
  }
}
