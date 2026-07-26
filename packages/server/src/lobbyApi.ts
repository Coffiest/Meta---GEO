import type { IncomingMessage, ServerResponse } from "node:http";
import {
  completeOnboarding,
  getBankrollGraph,
  getLeaderboard,
  getLeaderboards,
  getOrCreateUserByAuthId,
  getPlayerStats,
  getPlayerNote,
  getPlayerNotesForTargets,
  getReferralSummary,
  redeemReferralCode,
  getBadgeCollection,
  getHandProfitGraph,
  getRRRating,
  getTournamentHistory,
  getUserHandHistory,
  prisma,
  setHandFavorite,
  upsertPlayerNote,
  type PlayerNoteColor,
} from "@meta-geo/db";
import { verifyAccessToken, type VerifiedUser } from "./auth.js";
import { activeGames } from "./activeGames.js";
import { liveStatus } from "./liveStatus.js";
import {
  deletePushSubscription,
  hasPushSubscription,
  pushAvailable,
  pushPublicKey,
  savePushSubscription,
  sendPushToUser,
  type PushSubscriptionInput,
} from "./push.js";
import { putTransfer, takeTransfer } from "./authTransfer.js";

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
    // OAuthシート→PWA本体へのセッション受け渡し(iOSのストレージパーティション分離対策)。
    // POST: シート側が認証済みトークンをワンタイムコード付きで預ける(トークン検証済みのみ受理)。
    // GET : 本体側がコードで受け取る(一回限り・短TTL。コード自体が128bitの秘密)。
    if (url.pathname === "/api/lobby/session-transfer") {
      if (req.method === "POST") {
        const body = await readJsonBody(req);
        const code = body["code"];
        const accessToken = typeof body["access_token"] === "string" ? body["access_token"] : "";
        const refreshToken = typeof body["refresh_token"] === "string" ? body["refresh_token"] : "";
        // 本物のセッションだけ預かる(ゴミ・偽トークンの持ち込みを遮断)。
        const verified = accessToken ? await verifyAccessToken(accessToken) : null;
        if (!verified) {
          sendJson(res, 401, { error: "unauthorized" });
          return true;
        }
        const ok = putTransfer(code as string, { accessToken, refreshToken });
        sendJson(res, ok ? 200 : 400, ok ? { ok: true } : { error: "invalid code" });
        return true;
      }
      const code = url.searchParams.get("code") ?? "";
      const tokens = takeTransfer(code);
      if (!tokens) {
        sendJson(res, 404, { error: "not found" });
        return true;
      }
      sendJson(res, 200, { access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
      return true;
    }

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

    // アプリ復帰/ログイン時の進行中ゲーム確認。進行中なら gameKey を返して強制復帰させ、
    // 離席中に終了していれば result(結果サジェスト)を1回だけ返す。
    // ?peek=1 のときは「参加中ゲームの有無」だけを非破壊で返す(ホームの復帰バナー用ポーリング。
    // result を消費しないので、あとで通常の active-game 取得時に結果サジェストが1回だけ出る動作を壊さない)。
    if (url.pathname === "/api/lobby/active-game") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await prisma.user.findUnique({ where: { authId: verified.authId } });
      if (!user) {
        sendJson(res, 200, { gameKey: null, result: null });
        return true;
      }
      const peek = url.searchParams.get("peek") === "1";
      sendJson(res, 200, {
        gameKey: activeGames.getActive(user.id),
        result: peek ? null : activeGames.takeResult(user.id),
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

    // リーダーボード: 収支/ROI/偏差値/インマネ率 × Weekly/All Time/直近10トナメ(最低10トナメ)。
    if (url.pathname === "/api/lobby/leaderboards") {
      sendJson(res, 200, await getLeaderboards());
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

    // 対戦相手の公開プロフィール(収支/ROI/インマネ率/VPIP/PFR/3bet/偏差値/全国順位)。
    // 相手をタップしたときのプレイヤー詳細モーダル用。ログイン必須(?userId=対象User.id)。
    if (url.pathname === "/api/lobby/player") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const targetUserId = url.searchParams.get("userId");
      if (!targetUserId) {
        sendJson(res, 400, { error: "userId is required" });
        return true;
      }
      const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, displayName: true, avatarKey: true, isBot: true },
      });
      if (!target || target.isBot) {
        sendJson(res, 404, { error: "not found" });
        return true;
      }
      const [stats, rr] = await Promise.all([getPlayerStats(target.id), getRRRating(target.id)]);
      sendJson(res, 200, {
        id: target.id,
        displayName: target.displayName,
        avatarKey: target.avatarKey,
        stats,
        rrRating: rr,
      });
      return true;
    }

    // プレイヤーメモ&マーキング(自分が相手につけたノート)。GET ?userId= で取得、POSTで保存。
    if (url.pathname === "/api/lobby/player-note") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const author = await resolveDbUser(verified);

      if (req.method === "POST") {
        const body = await readJsonBody(req);
        const targetUserId = typeof body["targetUserId"] === "string" ? body["targetUserId"] : null;
        if (!targetUserId) {
          sendJson(res, 400, { error: "targetUserId is required" });
          return true;
        }
        const color = (typeof body["color"] === "string" ? body["color"] : null) as PlayerNoteColor | null;
        const note = typeof body["note"] === "string" ? body["note"] : "";
        const saved = await upsertPlayerNote(author.id, targetUserId, color, note);
        sendJson(res, 200, saved);
        return true;
      }

      const targetUserId = url.searchParams.get("userId");
      if (!targetUserId) {
        sendJson(res, 400, { error: "userId is required" });
        return true;
      }
      sendJson(res, 200, await getPlayerNote(author.id, targetUserId));
      return true;
    }

    // 複数相手のマーキング&メモをまとめて取得(テーブル上の全席のマーキングドット描画用)。
    // GET ?userIds=id1,id2,... → { [userId]: { color, note } }
    if (url.pathname === "/api/lobby/player-notes") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const author = await resolveDbUser(verified);
      const idsParam = url.searchParams.get("userIds") ?? "";
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12);
      sendJson(res, 200, await getPlayerNotesForTargets(author.id, ids));
      return true;
    }

    // PWAプッシュ通知の設定情報。購読に必要なVAPID公開鍵と、この端末以外も含めた購読有無。
    // VAPID鍵が未設定の環境では available:false を返し、クライアントは通知UI自体を出さない。
    if (url.pathname === "/api/lobby/push/config") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await resolveDbUser(verified);
      sendJson(res, 200, {
        available: pushAvailable(),
        publicKey: pushPublicKey(),
        subscribed: pushAvailable() ? await hasPushSubscription(user.id) : false,
      });
      return true;
    }

    // プッシュ通知の購読登録。
    if (url.pathname === "/api/lobby/push/subscribe" && req.method === "POST") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      if (!pushAvailable()) {
        sendJson(res, 503, { error: "push not configured" });
        return true;
      }
      const user = await resolveDbUser(verified);
      const body = await readJsonBody(req);
      const sub = body["subscription"] as PushSubscriptionInput | undefined;
      if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
        sendJson(res, 400, { error: "invalid subscription" });
        return true;
      }
      await savePushSubscription(user.id, sub);
      sendJson(res, 200, { ok: true });
      return true;
    }

    // プッシュ通知の購読解除(通知オフ)。
    if (url.pathname === "/api/lobby/push/unsubscribe" && req.method === "POST") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const body = await readJsonBody(req);
      const endpoint = typeof body["endpoint"] === "string" ? body["endpoint"] : "";
      if (endpoint) await deletePushSubscription(endpoint);
      sendJson(res, 200, { ok: true });
      return true;
    }

    // 観戦(配信)用のライブ状況。進行中MTTの公開スナップショットだけを返す。
    // ログイン不要 — 配信の視聴者やまだ登録していない人がそのまま見られることが目的。
    // ホールカードや進行中のアクションは一切含めないため、覗き見による不正の余地は無い。
    if (url.pathname === "/api/lobby/live") {
      sendJson(res, 200, { live: liveStatus.get() });
      return true;
    }

    // バッジ図鑑。全バッジの達成状況と、未達成バッジの現在値(進捗)を返す。
    if (url.pathname === "/api/lobby/badges") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await resolveDbUser(verified);
      sendJson(res, 200, await getBadgeCollection(user.id));
      return true;
    }

    // 友達招待(リファラル)。自分の招待コード・招待成立数・称号を返す。
    // コードは未発行ならこの取得時に発行する。
    if (url.pathname === "/api/lobby/referral") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await resolveDbUser(verified);
      sendJson(res, 200, await getReferralSummary(user.id));
      return true;
    }

    // 招待コードの適用。1ユーザーにつき生涯1回だけ(自分のコード・存在しないコードは弾く)。
    if (url.pathname === "/api/lobby/referral/redeem" && req.method === "POST") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await resolveDbUser(verified);
      const body = await readJsonBody(req);
      const code = typeof body["code"] === "string" ? body["code"] : "";
      const result = await redeemReferralCode(user.id, code);
      // 招待が成立したら、招待した人へプッシュで知らせる(称号が上がる瞬間を逃さないため)。
      // 通知の失敗で招待そのものを失敗させない。
      if (result.ok) {
        const inviter = await prisma.referral.findUnique({
          where: { inviteeUserId: user.id },
          select: { inviterUserId: true },
        });
        if (inviter) {
          void sendPushToUser(inviter.inviterUserId, {
            title: "招待が成立しました",
            body: `${user.displayName} さんがあなたの招待で参加しました。`,
            path: "/",
            tag: "referral",
          }).catch(() => undefined);
        }
      }
      // 適用できなかった理由もクライアントで文言を出し分けるため200で返す(通信エラーと区別する)。
      sendJson(res, 200, result);
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
