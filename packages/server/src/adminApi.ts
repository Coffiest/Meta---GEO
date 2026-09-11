import type { IncomingMessage, ServerResponse } from "node:http";
import {
  backfillGeoDecisions,
  excludeGeoData,
  getGeoBackfillStatus,
  getGeoDataCounts,
  getGeoPositionStats,
  listTrendItems,
  markTrendReviewed,
  listSocialPosts,
  saveSocialPost,
  listAccountsWithTrend,
  upsertSocialAccount,
  recordAccountSnapshot,
  grantCompSubscription,
  restoreGeoData,
  revokeCompSubscription,
  searchUsersForAdmin,
  listErrorReports,
  summarizeErrorReports,
  setErrorReportResolved,
  type CompDurationUnit,
  type GeoBackfillProgress,
} from "@meta-geo/db";
import { hasXCredentials, draftReply } from "@meta-geo/marketing";
import { checkAdminAuth } from "./adminAuth.js";
import { clampLimit, readJsonBodyLimited } from "./httpBody.js";

/**
 * 管理者API(`/api/admin/*`)。ログイン画面のバージョン表記→パスコードから開く管理者画面の
 * バックエンド。認証・レート制限・タイミングセーフ比較は adminAuth.ts に集約している。
 */

/**
 * GEO集計テーブル(GeoDecision)のバックフィル進捗。プロセス内に1つだけ持つ。
 * 全履歴を舐める重い処理なので、多重起動は必ず防ぐ(実行中の要求は現在の進捗だけを返す)。
 */
let geoBackfillState: { running: boolean; progress: GeoBackfillProgress | null; error: string | null } = {
  running: false,
  progress: null,
  error: null,
};

/** バックフィルを開始する(既に実行中なら何もしない)。完了を待たず即座に戻る。 */
function startGeoBackfill(onlyMissing: boolean): void {
  if (geoBackfillState.running) return;
  geoBackfillState = { running: true, progress: null, error: null };
  void backfillGeoDecisions({
    onlyMissing,
    onProgress: (progress) => {
      geoBackfillState.progress = progress;
    },
  })
    .then((progress) => {
      geoBackfillState = { running: false, progress, error: null };
      console.log(`[admin] geo backfill done: hands=${progress.processed}/${progress.total} rows=${progress.rows}`);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      geoBackfillState = { running: false, progress: geoBackfillState.progress, error: message };
      console.error("[admin] geo backfill failed:", err);
    });
}

// 管理者パスコードの検証は adminAuth.ts(checkAdminAuth)に一本化した(C1)。
// ここに独自の adminPasscode() は持たない(タイミングセーフ比較・レート制限を必ず経由させるため)。
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
  });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return readJsonBodyLimited(req);
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

  const auth = checkAdminAuth(req);
  if (auth === "rate_limited") {
    sendJson(res, 429, { error: "試行回数が多すぎます。しばらく待ってから再度お試しください。" });
    return true;
  }
  if (auth !== "ok") {
    sendJson(res, 401, { error: "unauthorized" });
    return true;
  }

  try {
    // プレイヤー検索(名前/メール/ID部分一致)。GEOデータ件数(総ハンド/除外済み)も添える。
    if (url.pathname === "/api/admin/users" && req.method === "GET") {
      const q = url.searchParams.get("q") ?? "";
      const users = await searchUsersForAdmin(q);
      const geoCounts = await getGeoDataCounts(users.map((u) => u.id));
      sendJson(res, 200, {
        users: users.map((u) => ({ ...u, geo: geoCounts.get(u.id) ?? { totalHands: 0, excludedHands: 0 } })),
      });
      return true;
    }

    // GEOプレイラインの除外(論理削除)。from/to(ISO日時)指定でその期間のみ、未指定で全期間。
    if (url.pathname === "/api/admin/geo-delete" && req.method === "POST") {
      const body = await readJsonBody(req);
      const userId = typeof body["userId"] === "string" ? body["userId"] : "";
      const fromRaw = typeof body["from"] === "string" ? new Date(body["from"]) : null;
      const toRaw = typeof body["to"] === "string" ? new Date(body["to"]) : null;
      if (!userId) {
        sendJson(res, 400, { error: "userId is required" });
        return true;
      }
      if ((fromRaw && Number.isNaN(fromRaw.getTime())) || (toRaw && Number.isNaN(toRaw.getTime()))) {
        sendJson(res, 400, { error: "from/to must be valid ISO datetimes" });
        return true;
      }
      const count = await excludeGeoData({
        userId,
        ...(fromRaw ? { from: fromRaw } : {}),
        ...(toRaw ? { to: toRaw } : {}),
      });
      sendJson(res, 200, { ok: true, count });
      return true;
    }

    // GEOプレイラインの除外を全解除(復元)。
    if (url.pathname === "/api/admin/geo-restore" && req.method === "POST") {
      const body = await readJsonBody(req);
      const userId = typeof body["userId"] === "string" ? body["userId"] : "";
      if (!userId) {
        sendJson(res, 400, { error: "userId is required" });
        return true;
      }
      const count = await restoreGeoData(userId);
      sendJson(res, 200, { ok: true, count });
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

    // ユーザーからのエラー報告の一覧。`?scope=` で絞り込み、`?unresolved=1` で未対応のみ。
    // 画面に出ていた文言だけでなく、技術詳細(detail)と構造化コンテキスト(context)まで返す。
    if (url.pathname === "/api/admin/error-reports" && req.method === "GET") {
      const limit = clampLimit(url.searchParams.get("limit"), 100, 1, 500);
      const scope = url.searchParams.get("scope");
      const unresolvedOnly = url.searchParams.get("unresolved") === "1";
      const [reports, summary] = await Promise.all([
        listErrorReports({ limit, ...(scope ? { scope } : {}), unresolvedOnly }),
        summarizeErrorReports(50),
      ]);
      sendJson(res, 200, { reports, summary });
      return true;
    }

    // 対応済み/未対応の切り替え: { id, resolved }
    if (url.pathname === "/api/admin/error-report-resolve" && req.method === "POST") {
      const body = await readJsonBody(req);
      const id = typeof body["id"] === "string" ? body["id"] : "";
      const resolved = body["resolved"] !== false;
      if (!id) {
        sendJson(res, 400, { error: "id is required" });
        return true;
      }
      await setErrorReportResolved(id, resolved);
      sendJson(res, 200, { ok: true });
      return true;
    }

    // GEO集計テーブル(GeoDecision)の状況。未展開のハンドが0件になればバックフィル完了。
    if (url.pathname === "/api/admin/geo-backfill" && req.method === "GET") {
      const status = await getGeoBackfillStatus();
      sendJson(res, 200, { ...status, ...geoBackfillState });
      return true;
    }

    // GEO集計テーブルの再構築を開始する。重い処理なのでレスポンスは待たせず、進捗はGETで見る。
    // 既に実行中なら新たに起動せず、現在の進捗をそのまま返す(多重起動の防止)。
    if (url.pathname === "/api/admin/geo-backfill" && req.method === "POST") {
      const body = await readJsonBody(req);
      // 既定は「まだ展開されていないハンドだけ」。全件やり直したいときだけ onlyMissing=false。
      const onlyMissing = body["onlyMissing"] !== false;
      const alreadyRunning = geoBackfillState.running;
      startGeoBackfill(onlyMissing);
      sendJson(res, alreadyRunning ? 409 : 202, {
        ok: !alreadyRunning,
        alreadyRunning,
        ...geoBackfillState,
      });
      return true;
    }

    // GEOのポジション別の集まり具合。「UTGばかりでBTN/SB/BBが少ない」の原因が
    // 母集団の偏りなのか、木構造・卓人数による見え方の問題なのかを切り分けるための計測。
    if (url.pathname === "/api/admin/geo-position-stats" && req.method === "GET") {
      sendJson(res, 200, await getGeoPositionStats());
      return true;
    }

    // --- SNS運用(マーケティング) ---

    // ④⑨ 収集したトレンドと、ネガティブ検知の結果。
    if (url.pathname === "/api/admin/marketing/trends" && req.method === "GET") {
      const sev = url.searchParams.get("severity");
      const severity = sev === "critical" || sev === "warning" || sev === "info" ? sev : undefined;
      sendJson(res, 200, {
        items: await listTrendItems({
          ...(severity ? { severity } : {}),
          onlyUnreviewed: url.searchParams.get("unreviewed") === "1",
          limit: clampLimit(url.searchParams.get("limit"), 50, 1, 200),
        }),
      });
      return true;
    }

    // 確認済みにする(通知を消すため)。
    if (url.pathname === "/api/admin/marketing/trend-reviewed" && req.method === "POST") {
      const body = await readJsonBody(req);
      const id = typeof body["id"] === "string" ? body["id"] : null;
      if (!id) {
        sendJson(res, 400, { error: "id is required" });
        return true;
      }
      await markTrendReviewed(id);
      sendJson(res, 200, { ok: true });
      return true;
    }

    // ②⑥ 原稿の一覧と保存。
    if (url.pathname === "/api/admin/marketing/posts" && req.method === "GET") {
      sendJson(res, 200, { posts: await listSocialPosts(clampLimit(url.searchParams.get("limit"), 50, 1, 200)) });
      return true;
    }
    if (url.pathname === "/api/admin/marketing/posts" && req.method === "POST") {
      const body = await readJsonBody(req);
      const source = typeof body["source"] === "string" ? body["source"] : null;
      if (!source || source.trim().length === 0) {
        sendJson(res, 400, { error: "source is required" });
        return true;
      }
      sendJson(res, 200, {
        post: await saveSocialPost({
          source,
          platform: typeof body["platform"] === "string" ? body["platform"] : null,
        }),
      });
      return true;
    }

    // ①⑦ 監視対象アカウントとフォロワー推移。
    // 鍵の有無も返す。未設定なら管理画面は「手入力」の口を出す(自動収集は鍵を入れた瞬間に始まる)。
    if (url.pathname === "/api/admin/marketing/accounts" && req.method === "GET") {
      sendJson(res, 200, { accounts: await listAccountsWithTrend(), autoCollect: hasXCredentials() });
      return true;
    }

    // 監視対象を追加する。
    if (url.pathname === "/api/admin/marketing/accounts" && req.method === "POST") {
      const body = await readJsonBody(req);
      const platform = typeof body["platform"] === "string" ? body["platform"] : "x";
      const handle = typeof body["handle"] === "string" ? body["handle"].trim() : "";
      const label = typeof body["label"] === "string" ? body["label"].trim() : "";
      if (handle.length === 0) {
        sendJson(res, 400, { error: "handle is required" });
        return true;
      }
      const account = await upsertSocialAccount({
        platform,
        handle,
        label: label.length > 0 ? label : handle,
        isOwn: body["isOwn"] === true,
      });
      sendJson(res, 200, { account });
      return true;
    }

    // ⑦ フォロワー数を手で記録する。鍵が無くても推移を積めるようにするための口。
    if (url.pathname === "/api/admin/marketing/account-snapshot" && req.method === "POST") {
      const body = await readJsonBody(req);
      const accountId = typeof body["accountId"] === "string" ? body["accountId"] : "";
      const followers = typeof body["followers"] === "number" ? body["followers"] : NaN;
      if (!accountId || !Number.isFinite(followers) || followers < 0) {
        sendJson(res, 400, { error: "accountId と followers(0以上の数値) が必要です" });
        return true;
      }
      await recordAccountSnapshot({
        accountId,
        followers: Math.trunc(followers),
        following: typeof body["following"] === "number" ? Math.trunc(body["following"]) : null,
        posts: typeof body["posts"] === "number" ? Math.trunc(body["posts"]) : null,
      });
      sendJson(res, 200, { ok: true });
      return true;
    }

    // ⑤ 返信の下書き。相手の投稿を貼り付ければ動くので鍵は要らない。
    // 送信はしない(運営の言葉として残り取り消せないため、必ず人が決める)。
    if (url.pathname === "/api/admin/marketing/reply-draft" && req.method === "POST") {
      const body = await readJsonBody(req);
      const text = typeof body["text"] === "string" ? body["text"] : "";
      if (text.trim().length === 0) {
        sendJson(res, 400, { error: "text is required" });
        return true;
      }
      sendJson(res, 200, { draft: draftReply(text) });
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
