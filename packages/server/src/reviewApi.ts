import type { IncomingMessage, ServerResponse } from "node:http";
import {
  analyzeHand,
  analyzeTournamentForHero,
  applySavedSolverResults,
  createOrRefreshReview,
  enrichAndSaveReview,
  prewarmTournamentReview,
  summarizeReviewedDecisions,
  getHandTimeline,
  getOrCreateUserByAuthId,
} from "@meta-geo/db";
import { verifyAccessToken, type VerifiedUser } from "./auth.js";

/** 進行中のソルバー解析(hand|user または tournament|user)。多重起動を防ぐ。 */
const enrichInFlight = new Set<string>();

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
      // ソルバー未完了が残っていればバックグラウンドで事前計算を起動(クライアントはポーリング)。
      if (review.solving) {
        const key = `tourney:${tournamentId}|${user.id}`;
        if (!enrichInFlight.has(key)) {
          enrichInFlight.add(key);
          void prewarmTournamentReview(tournamentId, user.id)
            .catch((err) => console.error("[reviewApi] tournament prewarm failed:", err))
            .finally(() => enrichInFlight.delete(key));
        }
      }
      sendJson(res, 200, review);
      return true;
    }

    // 事前計算: トナメ終了直後(リザルト画面表示時)に呼ばれ、全ハンドのソルバー解析を
    // バックグラウンドで開始する。応答は即時(202相当)。
    if (url.pathname === "/api/review/prewarm" && req.method === "POST") {
      const body = await readJsonBody(req);
      const tournamentId = body["tournamentId"];
      if (typeof tournamentId !== "string") {
        sendJson(res, 400, { error: "tournamentId required" });
        return true;
      }
      const key = `tourney:${tournamentId}|${user.id}`;
      if (!enrichInFlight.has(key)) {
        enrichInFlight.add(key);
        void prewarmTournamentReview(tournamentId, user.id)
          .catch((err) => console.error("[reviewApi] prewarm failed:", err))
          .finally(() => enrichInFlight.delete(key));
      }
      sendJson(res, 200, { started: true });
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

      // HUポストフロップの"solving"決定: 保存済み(ソルバー解析済み)の結果があればマージ、
      // 無ければバックグラウンドでソルバー解析を起動し、クライアントにポーリングさせる。
      let solving = await applySavedSolverResults(handId, user.id, review.decisions);
      if (!solving && review.decisions.some((d) => d.gtoActions !== null)) {
        const summary = summarizeReviewedDecisions(review.decisions);
        review.gtoAccuracy = summary.gtoAccuracy;
        review.totalEvLossBb = summary.totalEvLossBb;
        review.mistakeCount = summary.mistakeCount;
        review.artisticCount = summary.artisticCount;
      }
      if (solving) {
        const key = `${handId}|${user.id}`;
        if (!enrichInFlight.has(key)) {
          enrichInFlight.add(key);
          void enrichAndSaveReview(handId, user.id)
            .catch((err) => console.error("[reviewApi] enrich failed:", err))
            .finally(() => enrichInFlight.delete(key));
        }
      } else {
        // ソルバー不要のハンドは同期保存(従来どおり)。
        await createOrRefreshReview(handId, user.id).catch(() => {});
      }
      sendJson(res, 200, { review, timeline, solving });
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
