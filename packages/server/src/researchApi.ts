import type { IncomingMessage, ServerResponse } from "node:http";
import {
  getOrCreateUserByAuthId,
  isResearchDimension,
  isResearchMetric,
  researchCrosstab,
  researchSampleCount,
  type ResearchFilters,
  type ResearchScope,
} from "@meta-geo/db";
import { verifyAccessToken } from "./auth.js";
import { readJsonBodyLimited } from "./httpBody.js";

/**
 * データベースタブの「データ研究」の API(`/api/research/*`、ログイン必須)。
 *
 * 返すのは**帯ごとの件数と集計値だけ**で、他のプレイヤーの行や ID は一切返さない。
 * 集計は常に人間の行だけを対象にする(`researchQuery.ts`)。応答に種別を示す情報は出さない。
 */

function sendJson(res: ServerResponse, status: number, body: unknown): void {
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

/** 受け取った値を、許可された形の絞り込みに整える(知らない値は捨てる)。 */
export function parseResearchFilters(raw: unknown): ResearchFilters {
  const f = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: ResearchFilters = {};
  if (typeof f["street"] === "string") out.street = f["street"];
  if (typeof f["position"] === "string") out.position = f["position"];
  if (typeof f["gameType"] === "string") out.gameType = f["gameType"];
  if (typeof f["days"] === "number" && Number.isFinite(f["days"])) out.days = f["days"];
  if (typeof f["facingBet"] === "boolean") out.facingBet = f["facingBet"];
  return out;
}

export async function handleResearchApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/research/")) return false;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    });
    res.end();
    return true;
  }

  const verified = await verifyAccessToken(bearer(req));
  if (!verified) {
    sendJson(res, 401, { error: "unauthorized" });
    return true;
  }
  const user = await getOrCreateUserByAuthId({
    authId: verified.authId,
    email: verified.email,
    displayName: verified.email?.split("@")[0] ?? "Player",
  });

  if (url.pathname === "/api/research/summary" && req.method === "GET") {
    const scope: ResearchScope = url.searchParams.get("scope") === "me" ? "me" : "all";
    sendJson(res, 200, await researchSampleCount(scope, user.id));
    return true;
  }

  if (url.pathname === "/api/research/crosstab" && req.method === "POST") {
    const body = await readJsonBodyLimited(req);
    const dimension = body["dimension"];
    const metric = body["metric"];
    if (!isResearchDimension(dimension) || !isResearchMetric(metric)) {
      sendJson(res, 400, { error: "unknown dimension or metric" });
      return true;
    }
    const scope: ResearchScope = body["scope"] === "me" ? "me" : "all";
    const result = await researchCrosstab({
      dimension,
      metric,
      scope,
      userId: user.id,
      filters: parseResearchFilters(body["filters"]),
    });
    sendJson(res, 200, result);
    return true;
  }

  sendJson(res, 404, { error: "not found" });
  return true;
}
