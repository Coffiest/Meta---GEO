import type { IncomingMessage, ServerResponse } from "node:http";
import {
  analyzeHand,
  analyzeTournamentForHero,
  createOrRefreshReview,
  getHandTimeline,
  getOrCreateUserByAuthId,
} from "@meta-geo/db";
import { verifyAccessToken, type VerifiedUser } from "./auth.js";

/**
 * 局後検討(GTO棋譜解析)のREST API。`/api/review/*` 配下を処理する。
 *
 * 課金方針(確定): 最初は完全無料。ただし将来の有料化のためにシーム(1日の解析回数カウント)を
 * 入れておく。現状はカウント/ゲートを有効化しない。有料化時は下記 checkQuota() を実装し、
 * 無料枠(1日1トナメ)超過を 402 で弾き、Webに予告バナー→課金導線を出す。
 */

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

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function resolveDbUser(verified: VerifiedUser) {
  const fallbackName = verified.email?.split("@")[0] ?? "Player";
  return getOrCreateUserByAuthId({ authId: verified.authId, email: verified.email, displayName: fallbackName });
}

export async function handleReviewApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/review/")) return false;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
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
    const user = await resolveDbUser(verified);

    // 1トーナメントの一括解析。hero=ログイン中ユーザー。
    if (url.pathname === "/api/review/tournament" && req.method === "POST") {
      const body = await readJsonBody(req);
      const tournamentId = body["tournamentId"];
      if (typeof tournamentId !== "string") {
        sendJson(res, 400, { error: "tournamentId required" });
        return true;
      }
      // 課金シーム(将来): const q = await checkQuota(user.id); if (!q.allowed) { sendJson(res,402,...); return true; }
      const review = await analyzeTournamentForHero(tournamentId, user.id);
      sendJson(res, 200, review);
      return true;
    }

    // 1ハンドのレビュー(分類結果)+再生用タイムライン。
    if (url.pathname.startsWith("/api/review/hand/")) {
      const handId = decodeURIComponent(url.pathname.slice("/api/review/hand/".length));
      if (!handId) {
        sendJson(res, 400, { error: "handId required" });
        return true;
      }
      const [review, timeline] = await Promise.all([analyzeHand(handId, user.id), getHandTimeline(handId)]);
      if (!review || !timeline) {
        sendJson(res, 404, { error: "hand not found or hero not seated" });
        return true;
      }
      // リクエスタがそのハンドの参加者であることを確認。
      if (!timeline.seats.some((s) => s.userId === user.id)) {
        sendJson(res, 403, { error: "forbidden" });
        return true;
      }
      // 永続化(fire-and-forget的でよいがawaitして一貫性を担保)。
      await createOrRefreshReview(handId, user.id).catch(() => {});
      sendJson(res, 200, { review, timeline });
      return true;
    }

    sendJson(res, 404, { error: "not found" });
    return true;
  } catch (err) {
    console.error("[reviewApi] request failed:", err);
    sendJson(res, 500, { error: "internal error" });
    return true;
  }
}
