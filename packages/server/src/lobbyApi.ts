import type { IncomingMessage, ServerResponse } from "node:http";
import {
  completeOnboarding,
  getBankrollGraph,
  getLeaderboard,
  getOrCreateUserByAuthId,
  getPlayerStats,
  getHandProfitGraph,
  getRRRating,
  getTournamentHistory,
  getUserHandHistory,
  prisma,
  setHandFavorite,
} from "@meta-geo/db";
import { verifyAccessToken, type VerifiedUser } from "./auth.js";

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

const EMPTY_STATS = {
  tournamentsPlayed: 0,
  itmCount: 0,
  itmRate: 0,
  totalBuyIns: 0,
  totalPayouts: 0,
  profit: 0,
  roi: 0,
  nationalRank: null,
  totalRankedPlayers: 0,
  vpipCount: 0,
  vpipOpportunities: 0,
  vpipRate: 0,
  pfrCount: 0,
  pfrOpportunities: 0,
  pfrRate: 0,
  threeBetCount: 0,
  threeBetOpportunities: 0,
  threeBetRate: 0,
};

async function resolveDbUser(verified: VerifiedUser) {
  const fallbackName = verified.email?.split("@")[0] ?? "Player";
  return getOrCreateUserByAuthId({ authId: verified.authId, email: verified.email, displayName: fallbackName });
}

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
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    });
    res.end();
    return true;
  }

  try {
    // ログイン中ユーザーのプロフィール取得/オンボーディング保存
    if (url.pathname === "/api/lobby/profile") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await resolveDbUser(verified);

      if (req.method === "POST") {
        const body = await readJsonBody(req);
        const displayName = typeof body["displayName"] === "string" ? body["displayName"].trim().slice(0, 16) : "";
        // アイコン画像は任意(カメラロールから選んだdata URIまたはnull)。名前だけが必須。
        const avatarKey = typeof body["avatarKey"] === "string" && body["avatarKey"].length > 0 ? body["avatarKey"] : null;
        if (!displayName) {
          sendJson(res, 400, { error: "表示名は必須です" });
          return true;
        }
        await completeOnboarding({ userId: user.id, displayName, avatarKey });
        sendJson(res, 200, { id: user.id, displayName, avatarKey, onboarded: true, email: verified.email });
        return true;
      }

      sendJson(res, 200, {
        id: user.id,
        displayName: user.displayName,
        avatarKey: user.avatarKey,
        onboarded: user.onboarded,
        email: verified.email,
      });
      return true;
    }

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

    // ランキングは公開情報(BOTは含まれない)
    if (url.pathname === "/api/lobby/leaderboard") {
      sendJson(res, 200, await getLeaderboard(50));
      return true;
    }

    // トナメ偏差値(RRRating)。RRPokerと同じロジック(平均50・標準偏差10のT-score)。
    if (url.pathname === "/api/lobby/rr-rating") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await prisma.user.findUnique({ where: { authId: verified.authId } });
      sendJson(
        res,
        200,
        user ? await getRRRating(user.id) : { rrRating: 50, roi: 0, tournamentsPlayed: 0, nationalRank: null, totalRankedPlayers: 0 },
      );
      return true;
    }

    // ホーム画面「トナメ偏差値」カード下のTournament History折れ線グラフ用(トーナメントごとの個別損益)
    if (url.pathname === "/api/lobby/tournament-history") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await prisma.user.findUnique({ where: { authId: verified.authId } });
      const limitParam = Number(url.searchParams.get("limit") ?? 20);
      sendJson(res, 200, user ? await getTournamentHistory(user.id, limitParam) : []);
      return true;
    }

    if (url.pathname === "/api/lobby/history") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await prisma.user.findUnique({ where: { authId: verified.authId } });
      const favoritesOnly = url.searchParams.get("favorites") === "1";
      sendJson(res, 200, user ? await getUserHandHistory(user.id, 100, favoritesOnly) : []);
      return true;
    }

    // ハンドのお気に入り登録/解除。 { handId, isFavorite } をJSON bodyで受け取る。
    if (url.pathname === "/api/lobby/history/favorite" && req.method === "POST") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await prisma.user.findUnique({ where: { authId: verified.authId } });
      if (!user) {
        sendJson(res, 404, { error: "user not found" });
        return true;
      }
      const body = await readJsonBody(req);
      const handId = typeof body["handId"] === "string" ? body["handId"] : null;
      const isFavorite = body["isFavorite"] === true;
      if (!handId) {
        sendJson(res, 400, { error: "handId is required" });
        return true;
      }
      await setHandFavorite(user.id, handId, isFavorite);
      sendJson(res, 200, { handId, isFavorite });
      return true;
    }

    // Statsタブの「ROI / 収支 / 得た金額」グラフ(トーナメントごと・累計推移)
    if (url.pathname === "/api/lobby/bankroll-graph") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await prisma.user.findUnique({ where: { authId: verified.authId } });
      const limitParam = Number(url.searchParams.get("limit") ?? 1000);
      sendJson(res, 200, user ? await getBankrollGraph(user.id, limitParam) : []);
      return true;
    }

    // 収支推移の折れ線グラフ(実収支/オールインEV/SD/NSD、ハンドごと・時系列)
    if (url.pathname === "/api/lobby/profit-graph") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await prisma.user.findUnique({ where: { authId: verified.authId } });
      const limitParam = Number(url.searchParams.get("limit") ?? 1000);
      sendJson(res, 200, user ? await getHandProfitGraph(user.id, limitParam) : []);
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
