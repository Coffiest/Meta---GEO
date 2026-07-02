import type { IncomingMessage, ServerResponse } from "node:http";
import { getGeoSummaryStats, getHandDetail, getPositionalRfiStats, getRecentHands } from "@meta-geo/db";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
  });
  res.end(payload);
}

/**
 * GEO戦略DBのREST API。`/api/geo/*` 配下のリクエストを処理する。
 * まだ規模が小さいのでフレームワークは使わず、素朴なパスマッチングで実装している。
 * 該当するルートがなければ false を返す(呼び出し側で404にフォールバックする)。
 */
export async function handleGeoApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/geo/")) return false;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return true;
  }

  try {
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
