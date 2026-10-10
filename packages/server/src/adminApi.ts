import type { IncomingMessage, ServerResponse } from "node:http";
import { presenceSnapshot } from "./presence.js";
import {
  backfillDecisionFacts,
  backfillGeoDecisions,
  excludeGeoData,
  getGeoBackfillStatus,
  getGeoDataCounts,
  getAdminGeoAccess,
  parseGeoOverride,
  parsePlan,
  setGeoAccessOverride,
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
  prisma,
  searchUsersForAdmin,
  listErrorReports,
  listFeedback,
  countUnreadFeedback,
  getFeedbackImage,
  setFeedbackRead,
  summarizeErrorReports,
  setErrorReportResolved,
  getStorageReport,
  createPartner,
  generatePartnerCode,
  getPartner,
  isPartnerCodeTaken,
  isValidPartnerCode,
  listPartners,
  normalizePartnerCode,
  setPartnerActive,
  partnerBalances,
  partnerLedgerRows,
  markPartnerPaid,
  monthKeyJst,
  type CompDurationUnit,
  type DecisionFactBackfillProgress,
  type GeoBackfillProgress,
} from "@meta-geo/db";
import { hasXCredentials, draftReply } from "@meta-geo/marketing";
import { checkAdminAccess } from "./adminAuth.js";
import { clearGeoAccessCache } from "./geoAccess.js";
import { getStripeClient } from "./subscriptionApi.js";
import { syncSubscription } from "./subscriptionReconciler.js";
import { createPartnerPromotionCode, setPartnerPromotionCodeActive } from "./partnerStripe.js";
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

/**
 * 研究用テーブル(DecisionFact)のバックフィル進捗。GEO と同じく、プロセス内に1つだけ持ち多重起動を防ぐ。
 * 過去のハンドは思考時間・トーナメントの状況(ICM)が記録されていないため、その列は null になる。
 */
let researchBackfillState: { running: boolean; progress: DecisionFactBackfillProgress | null; error: string | null } = {
  running: false,
  progress: null,
  error: null,
};

function startResearchBackfill(): void {
  if (researchBackfillState.running) return;
  researchBackfillState = { running: true, progress: null, error: null };
  void backfillDecisionFacts({
    onProgress: (progress) => {
      researchBackfillState.progress = progress;
    },
  })
    .then((progress) => {
      researchBackfillState = { running: false, progress, error: null };
      console.log(`[admin] research backfill done: hands=${progress.processed}/${progress.total} rows=${progress.rows}`);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      researchBackfillState = { running: false, progress: researchBackfillState.progress, error: message };
      console.error("[admin] research backfill failed:", err);
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

const LEDGER_KIND_LABEL: Record<string, string> = { payment: "入金", refund: "返金", dispute: "チャージバック" };
const VOID_REASON_LABEL: Record<string, string> = { self: "対象外(本人の加入)", expired: "対象外(期限後の加入)" };

/** 台帳の CSV。Excel で文字化けしないよう BOM を付ける。 */
export function partnerLedgerCsv(
  rows: { occurredAt: Date; kind: string; stripeInvoiceId: string | null; paymentIndex: number; plan: string | null; amount: number; commission: number; voidReason: string | null; payoutId: string | null; referralId: string }[],
): string {
  const header = ["日時(UTC)", "月(日本時間)", "種類", "請求書", "加入者", "何回目", "プラン", "金額", "報酬", "状態"];
  const lines = rows.map((r) =>
    [
      r.occurredAt.toISOString(),
      monthKeyJst(r.occurredAt),
      LEDGER_KIND_LABEL[r.kind] ?? r.kind,
      r.stripeInvoiceId ?? "",
      r.referralId.slice(0, 8),
      String(r.paymentIndex),
      r.plan ?? "",
      String(r.amount),
      String(r.commission),
      r.voidReason ? VOID_REASON_LABEL[r.voidReason] ?? r.voidReason : r.payoutId ? "支払済" : "未払い",
    ].join(","),
  );
  return "\uFEFF" + [header.join(","), ...lines].join("\n") + "\n";
}

export async function handleAdminApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/admin/")) return false;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-admin-passcode, authorization",
    });
    res.end();
    return true;
  }

  const auth = await checkAdminAccess(req);
  if (auth.status === "rate_limited") {
    sendJson(res, 429, { error: "試行回数が多すぎます。しばらく待ってから再度お試しください。" });
    return true;
  }
  if (auth.status === "unauthorized") {
    sendJson(res, 401, { error: "unauthorized" });
    return true;
  }
  if (auth.status === "not_admin") {
    // パスコードは正しいが、管理者のアカウントではない。画面に自分のユーザーIDを出して、登録の依頼に使ってもらう。
    sendJson(res, 403, { error: "forbidden", code: "NOT_ADMIN", userId: auth.userId });
    return true;
  }

  try {
    // 管理者として通るかだけを確かめる(画面のパスコード入力の答え合わせ。照合はサーバーだけで行う)。
    if (url.pathname === "/api/admin/session" && req.method === "GET") {
      sendJson(res, 200, { ok: true });
      return true;
    }

    // いまアクティブなユーザー(最後に見えてから5分以内か、卓で遊んでいる人)と人数。
    if (url.pathname === "/api/admin/active-users" && req.method === "GET") {
      const { prisma } = await import("@meta-geo/db");
      const snapshot = await presenceSnapshot(async (ids) => {
        const rows = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
        return new Map(rows.map((r) => [r.id, r.displayName]));
      });
      sendJson(res, 200, snapshot);
      return true;
    }

    // プレイヤー検索(名前/メール/ID部分一致)。GEOデータ件数(総ハンド/除外済み)も添える。
    if (url.pathname === "/api/admin/users" && req.method === "GET") {
      const q = url.searchParams.get("q") ?? "";
      const { users, total } = await searchUsersForAdmin(q, {
        limit: Number(url.searchParams.get("limit") ?? 20) || 20,
        offset: Number(url.searchParams.get("offset") ?? 0) || 0,
      });
      const ids = users.map((u) => u.id);
      const [geoCounts, geoAccess] = await Promise.all([getGeoDataCounts(ids), getAdminGeoAccess(ids)]);
      sendJson(res, 200, {
        total,
        users: users.map((u) => ({
          ...u,
          geo: geoCounts.get(u.id) ?? { totalHands: 0, excludedHands: 0 },
          geoAccess: geoAccess.get(u.id) ?? { itmCount: 0, override: null, level: "none" },
        })),
      });
      return true;
    }

    // GEO データベースの利用条件の個別設定: { userId, override: "preflop" | "full" | null }。
    // インマネの回数が足りなくても、プリフロップまで / 全部を使えるようにする(null で回数どおりに戻す)。
    if (url.pathname === "/api/admin/geo-override" && req.method === "POST") {
      const body = await readJsonBody(req);
      const userId = typeof body["userId"] === "string" ? body["userId"] : "";
      const override = parseGeoOverride(body["override"]);
      if (!userId || (body["override"] !== null && override === null)) {
        sendJson(res, 400, { error: "userId and override(preflop|full|null) are required" });
        return true;
      }
      await setGeoAccessOverride(userId, override);
      clearGeoAccessCache();
      const access = (await getAdminGeoAccess([userId])).get(userId) ?? null;
      sendJson(res, 200, { ok: true, geoAccess: access });
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

    // 無料付与: { userId, unit: "week"|"month", amount: number, plan?: "silver"|"gold"|"platinum" }
    if (url.pathname === "/api/admin/grant" && req.method === "POST") {
      const body = await readJsonBody(req);
      const userId = typeof body["userId"] === "string" ? body["userId"] : "";
      const unit =
        body["unit"] === "day" || body["unit"] === "week" || body["unit"] === "month"
          ? (body["unit"] as CompDurationUnit)
          : null;
      const amount = typeof body["amount"] === "number" ? body["amount"] : NaN;
      if (!userId || !unit || !Number.isFinite(amount) || amount <= 0) {
        sendJson(res, 400, { error: "userId, unit(day|week|month), amount(>0) are required" });
        return true;
      }
      const plan = parsePlan(body["plan"]) ?? "silver";
      if (amount > ({ day: 3650, week: 520, month: 120 } as const)[unit]) {
        sendJson(res, 400, { error: "amount too large" });
        return true;
      }
      const { currentPeriodEnd } = await grantCompSubscription({ userId, unit, amount, plan });
      clearGeoAccessCache();
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
      clearGeoAccessCache();
      sendJson(res, 200, { ok: true, revoked });
      return true;
    }

    // プランの剥奪(Stripe の契約をその場で解約する): { userId }。日割り返金はしない(特商法の表記どおり)。
    if (url.pathname === "/api/admin/cancel-stripe" && req.method === "POST") {
      const body = await readJsonBody(req);
      const userId = typeof body["userId"] === "string" ? body["userId"] : "";
      const row = userId
        ? await prisma.subscription.findUnique({ where: { userId }, select: { stripeSubscriptionId: true, stripeCustomerId: true } })
        : null;
      const stripe = getStripeClient();
      if (!row?.stripeSubscriptionId) {
        sendJson(res, 404, { error: "no_stripe_subscription" });
        return true;
      }
      if (!stripe) {
        sendJson(res, 503, { error: "subscriptions_unavailable" });
        return true;
      }
      let canceled;
      try {
        canceled = await stripe.subscriptions.cancel(row.stripeSubscriptionId);
      } catch (err) {
        console.error("[adminApi] cancel-stripe failed:", err);
        sendJson(res, 502, { error: `stripe: ${err instanceof Error ? err.message : "unknown"}`.slice(0, 200) });
        return true;
      }
      await syncSubscription(row.stripeCustomerId, canceled);
      clearGeoAccessCache();
      sendJson(res, 200, { ok: true });
      return true;
    }

    // インフルエンサー(ローンチパートナー)のコードの一覧。
    if (url.pathname === "/api/admin/partners" && req.method === "GET") {
      const [partners, balances] = await Promise.all([listPartners(), partnerBalances()]);
      const empty = { referrals: 0, accruing: 0, payable: 0, paidTotal: 0 };
      sendJson(res, 200, {
        partners: partners.map((p) => {
          const { partnerId: _omit, ...balance } = balances.find((b) => b.partnerId === p.id) ?? { partnerId: p.id, ...empty };
          return { ...p, createdAt: p.createdAt.toISOString(), balance };
        }),
      });
      return true;
    }

    // コードの発行: { name, contact?, note?, code?, userId? }。code を省くと "ART" + 5文字で作る。
    // Stripe にプロモーションコード(初回30%OFF・有料会員になったことが無い人だけ)を作ってから台帳に記録する。
    if (url.pathname === "/api/admin/partners" && req.method === "POST") {
      const body = await readJsonBody(req);
      const str = (k: string, max: number) => (typeof body[k] === "string" ? (body[k] as string).trim().slice(0, max) : "");
      const name = str("name", 80);
      const contact = str("contact", 200) || null;
      const note = str("note", 1000) || null;
      const userId = str("userId", 64) || null;
      if (!name) {
        sendJson(res, 400, { error: "name_required" });
        return true;
      }
      const stripe = getStripeClient();
      if (!stripe) {
        sendJson(res, 503, { error: "subscriptions_unavailable" });
        return true;
      }
      if (userId) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) {
          sendJson(res, 400, { error: "user_not_found" });
          return true;
        }
      }
      let code = normalizePartnerCode(str("code", 40));
      if (code) {
        if (!isValidPartnerCode(code)) {
          sendJson(res, 400, { error: "invalid_code" });
          return true;
        }
        if (await isPartnerCodeTaken(code)) {
          sendJson(res, 409, { error: "code_taken" });
          return true;
        }
      } else {
        do code = generatePartnerCode();
        while (await isPartnerCodeTaken(code));
      }
      let promotionCodeId: string;
      try {
        promotionCodeId = await createPartnerPromotionCode(stripe, { code, partnerRef: code });
      } catch (err) {
        console.error("[adminApi] partner promotion code failed:", err);
        const message = err instanceof Error ? err.message : "unknown";
        // Stripe 側で同じコードが既に有効(管理画面で手作りしたものなど)。
        const taken = /already exists|active promotion code/i.test(message);
        sendJson(res, taken ? 409 : 502, { error: taken ? "code_taken" : `stripe: ${message}`.slice(0, 200) });
        return true;
      }
      try {
        const partner = await createPartner({ name, contact, note, code, stripePromotionCodeId: promotionCodeId, userId });
        sendJson(res, 200, { partner: { ...partner, createdAt: partner.createdAt.toISOString() } });
      } catch (err) {
        // 台帳に書けなかったコードを Stripe に残すと、誰の紹介か分からない割引が使われてしまう。止めておく。
        await setPartnerPromotionCodeActive(stripe, promotionCodeId, false).catch(() => {});
        throw err;
      }
      return true;
    }

    // 振込済みにする: { id }。締めた月(日本時間の今月より前)の未払いの行をまとめて払った扱いにする。¥3,000 未満は 409。
    if (url.pathname === "/api/admin/partners/paid" && req.method === "POST") {
      const body = await readJsonBody(req);
      const id = typeof body["id"] === "string" ? body["id"] : "";
      const partner = id ? await getPartner(id) : null;
      if (!partner) {
        sendJson(res, 404, { error: "not_found" });
        return true;
      }
      const result = await markPartnerPaid(partner.id);
      sendJson(res, result.ok ? 200 : 409, result);
      return true;
    }

    // 1人分の台帳の CSV(振込の控え・確認用)。
    if (url.pathname === "/api/admin/partners/ledger.csv" && req.method === "GET") {
      const partner = await getPartner(url.searchParams.get("id") ?? "");
      if (!partner) {
        sendJson(res, 404, { error: "not_found" });
        return true;
      }
      const rows = await partnerLedgerRows(partner.id);
      res.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
      });
      res.end(partnerLedgerCsv(rows));
      return true;
    }

    // コードの停止・再開: { id, active }。Stripe のプロモーションコードも同じ状態にする。
    if (url.pathname === "/api/admin/partners/active" && req.method === "POST") {
      const body = await readJsonBody(req);
      const id = typeof body["id"] === "string" ? body["id"] : "";
      const active = body["active"] === true;
      const partner = id ? await getPartner(id) : null;
      if (!partner) {
        sendJson(res, 404, { error: "not_found" });
        return true;
      }
      const stripe = getStripeClient();
      if (!stripe) {
        sendJson(res, 503, { error: "subscriptions_unavailable" });
        return true;
      }
      try {
        await setPartnerPromotionCodeActive(stripe, partner.stripePromotionCodeId, active);
      } catch (err) {
        console.error("[adminApi] partner promotion code update failed:", err);
        sendJson(res, 502, { error: `stripe: ${err instanceof Error ? err.message : "unknown"}`.slice(0, 200) });
        return true;
      }
      await setPartnerActive(partner.id, active);
      sendJson(res, 200, { ok: true });
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

    // ホームの「ご意見フォーム」から届いたもの。`?unread=1` で未読のみ。写真は id だけ返す(中身は下で1枚ずつ)。
    if (url.pathname === "/api/admin/feedback" && req.method === "GET") {
      const limit = clampLimit(url.searchParams.get("limit"), 100, 1, 200);
      const unreadOnly = url.searchParams.get("unread") === "1";
      const [items, unread] = await Promise.all([listFeedback({ limit, unreadOnly }), countUnreadFeedback()]);
      sendJson(res, 200, { items, unread });
      return true;
    }

    // ご意見の写真1枚(`?id=`)。画面は fetch で取り(パスコードのヘッダーが要るため)、Blob で表示する。
    if (url.pathname === "/api/admin/feedback-image" && req.method === "GET") {
      const id = url.searchParams.get("id") ?? "";
      const img = id ? await getFeedbackImage(id) : null;
      if (!img) {
        sendJson(res, 404, { error: "not found" });
        return true;
      }
      res.writeHead(200, {
        "content-type": img.mime,
        "content-length": String(img.data.length),
        "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      });
      res.end(img.data);
      return true;
    }

    // 既読/未読の切り替え: { id, read }
    if (url.pathname === "/api/admin/feedback-read" && req.method === "POST") {
      const body = await readJsonBody(req);
      const id = typeof body["id"] === "string" ? body["id"] : "";
      if (!id) {
        sendJson(res, 400, { error: "id is required" });
        return true;
      }
      await setFeedbackRead(id, body["read"] !== false);
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

    // 研究用テーブル(データベースタブの「データ研究」)の作り直し。進捗は GET で見る。
    if (url.pathname === "/api/admin/research-backfill" && req.method === "GET") {
      sendJson(res, 200, researchBackfillState);
      return true;
    }
    if (url.pathname === "/api/admin/research-backfill" && req.method === "POST") {
      const alreadyRunning = researchBackfillState.running;
      startResearchBackfill();
      sendJson(res, alreadyRunning ? 409 : 202, { ok: !alreadyRunning, alreadyRunning, ...researchBackfillState });
      return true;
    }

    // DB容量(テーブルごとの大きさと推定行数、1ハンドあたりの平均)。
    if (url.pathname === "/api/admin/storage" && req.method === "GET") {
      sendJson(res, 200, await getStorageReport());
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
