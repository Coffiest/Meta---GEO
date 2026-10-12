import type { IncomingMessage, ServerResponse } from "node:http";
import Stripe from "stripe";
import {
  attachStripeCustomerId,
  getOrCreateUserByAuthId,
  getReviewQuotaRemaining,
  getStripeCustomerId,
  getSubscriptionStatusForUser,
  subscriptionNeedsReconcile,
  claimTrialFingerprint,
  isTrialEligible,
  refreshTrialOffer,
  markTrialUsed,
  parsePlan,
  prisma,
  PLAN_PRICE_JPY,
  TRIAL_DAYS,
  type PlanId,
} from "@meta-geo/db";
import { resolvePriceId } from "./stripePlans.js";
import { attributePartnerSubscription, recordPartnerDispute, recordPartnerInvoicePaid, recordPartnerRefunds } from "./partnerStripe.js";
import { verifyAccessToken, type VerifiedUser } from "./auth.js";
import { readJsonBodyLimited, readRawBody as readRawBodyLimited } from "./httpBody.js";
import { cancelForPaymentFailure, reconcileSubscription, syncSubscription } from "./subscriptionReconciler.js";

let stripeClient: Stripe | null | undefined;

/** STRIPE_SECRET_KEYが未設定の環境(キー未設定/ローカル開発等)ではnullを返し、決済機能を無効化する。 */
export function getStripeClient(): Stripe | null {
  if (stripeClient !== undefined) return stripeClient;
  const secretKey = process.env["STRIPE_SECRET_KEY"];
  stripeClient = secretKey ? new Stripe(secretKey) : null;
  return stripeClient;
}

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

// Stripe Webの署名検証には生ボディが要る。共通ヘルパーで64KB上限をかける
// (Stripeイベントはこれより十分小さい。超過分でメモリを食わせないため)。
async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return readRawBodyLimited(req);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return readJsonBodyLimited(req);
}

async function resolveDbUser(verified: VerifiedUser) {
  const fallbackName = verified.email?.split("@")[0] ?? "Player";
  return getOrCreateUserByAuthId({ authId: verified.authId, email: verified.email, displayName: fallbackName });
}

/** WEB_ORIGINが "*"(全許可)の場合は本番Web URLへフォールバックする(Stripeのredirect先に * は使えない)。 */
function webOrigin(): string {
  const origin = process.env["WEB_ORIGIN"];
  if (origin && origin !== "*") return origin;
  return "https://meta-geo-poker.vercel.app";
}

/** 棋譜解析の着地URL。加入後は解析画面(該当トナメ)へ戻す。tournamentId不明時は/pricingへ。 */
function reviewLandingUrl(tournamentId: string | null, outcome: "success" | "cancelled"): string {
  const base = webOrigin();
  // 成功のときは決済のセッション ID を付けて戻す。戻った画面がそれで Stripe に確かめ、Webhook を待たずに加入を反映する。
  const query = outcome === "success" ? "checkout=success&session_id={CHECKOUT_SESSION_ID}" : `checkout=${outcome}`;
  if (tournamentId) return `${base}/review/tournament/${encodeURIComponent(tournamentId)}?${query}`;
  return `${base}/pricing?${query}`;
}

/**
 * 決済(Checkout)で始まった契約を DB に反映する。Webhook(checkout.session.completed)・決済から戻った画面の確認・
 * 状態の確認(加入しかけのまま止まっている人)の3か所から呼ぶ。何度呼んでも同じ結果になる。
 * Webhook だけに頼ると、届くのが遅い・届かないときに「お金は払ったのに会員にならない」ことになる(オーナー指摘)。
 */
async function finalizeCheckoutSubscription(stripe: Stripe, customerId: string, subscriptionId: string): Promise<void> {
  let subscription: Stripe.Subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["default_payment_method"],
  });
  if (subscription.status === "trialing") subscription = await settleTrial(stripe, customerId, subscription);
  await syncSubscription(customerId, subscription);
  // インフルエンサーのコードで始まった契約を記録する(報酬の台帳の起点)。ここで失敗しても加入の反映は済んでいる。
  // 最初の入金(invoice.paid)でもう一度記録を試みる。
  await attributePartnerSubscription(stripe, subscription.id).catch((err) =>
    console.error("[subscriptionApi] partner attribution failed:", err),
  );
}

/** 同じ人に Stripe へ何度も問い合わせないための間隔(加入しかけのまま止まっている人の確認)。 */
const PENDING_CHECK_INTERVAL_MS = 30_000;
const pendingCheckedAt = new Map<string, number>();

/**
 * 決済画面へ進んだが、DB の契約がまだ反映されていない人(status "incomplete"・契約 ID なし)を Stripe に確かめ、
 * 有効な契約があれば反映する。Webhook が失敗・遅延していても、次に状態を見たときに会員になる。
 */
export async function resolvePendingCheckout(stripe: Stripe, userId: string): Promise<void> {
  const row = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true, status: true },
  });
  if (!row || row.stripeSubscriptionId || row.status !== "incomplete") return;
  const last = pendingCheckedAt.get(userId) ?? 0;
  if (Date.now() - last < PENDING_CHECK_INTERVAL_MS) return;
  pendingCheckedAt.set(userId, Date.now());
  const list = await stripe.subscriptions.list({ customer: row.stripeCustomerId, status: "all", limit: 3 });
  const live = list.data.find((sub) => sub.status === "active" || sub.status === "trialing");
  if (live) await finalizeCheckoutSubscription(stripe, row.stripeCustomerId, live.id);
}

/**
 * 棋譜解析 使い放題プランのサブスクリプション関連API。`/api/subscriptions/*` 配下を処理する。
 * STRIPE_SECRET_KEY未設定時はcheckout/portalが503を返す(status/webhookはDB照会のみなので動作する)。
 */
export async function handleSubscriptionApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/subscriptions/")) return false;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
    });
    res.end();
    return true;
  }

  // StripeのWebhookは署名検証のため生ボディが必要かつ認証ヘッダーが無いので、他ルートより先に処理する。
  if (url.pathname === "/api/subscriptions/webhook" && req.method === "POST") {
    await handleWebhook(req, res);
    return true;
  }

  try {
    if (url.pathname === "/api/subscriptions/status") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await resolveDbUser(verified);
      // 期限を過ぎた(または支払いが滞っている)契約は、その場で Stripe に照会してから答える。
      // 更新済みなら新しい期限で有効のまま、引き落としに失敗していれば自動解約される。
      const stripeForReconcile = getStripeClient();
      if (stripeForReconcile) {
        await resolvePendingCheckout(stripeForReconcile, user.id).catch((err) =>
          console.error("[subscriptionApi] pending checkout check failed:", err),
        );
      }
      const dueSubscriptionId = stripeForReconcile ? await subscriptionNeedsReconcile(user.id) : null;
      if (stripeForReconcile && dueSubscriptionId) {
        const customerId = await getStripeCustomerId(user.id);
        if (customerId) {
          await reconcileSubscription(stripeForReconcile, customerId, dueSubscriptionId).catch((err) =>
            console.error("[subscriptionApi] inline reconcile failed:", err),
          );
        }
      }
      // インマネが新しい区切り(10回ごと)に届いていれば、7日間無料の特別オファー(1時間だけ)を出す。
      const trialOfferUntil = await refreshTrialOffer(user.id);
      const [subscription, quota, trialEligible, row] = await Promise.all([
        getSubscriptionStatusForUser(user.id),
        getReviewQuotaRemaining(user.id),
        isTrialEligible(user.id),
        prisma.subscription.findUnique({ where: { userId: user.id }, select: { stripeSubscriptionId: true, status: true } }),
      ]);
      sendJson(res, 200, {
        active: subscription.active,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        plan: subscription.plan,
        // Stripe の契約が生きていれば、プランの変更は Checkout ではなく change-plan で行う。
        canChangePlan: hasLiveStripeSubscription(row),
        trialEligible,
        trialOfferUntil: trialEligible ? trialOfferUntil : null,
        trialDays: TRIAL_DAYS,
        prices: PLAN_PRICE_JPY,
        reviewsRemaining: quota.remaining,
        reviewLimit: quota.limit,
        nextFreeAt: quota.nextFreeAt,
      });
      return true;
    }

    // 7日間無料の特別オファー(インマネ10回ごとに1回・1時間だけ)。トーナメントの結果の画面・ホームが呼び、
    // 出ていればポップアップを出す。加入中の人には出さない(offerUntil: null)。
    if (url.pathname === "/api/subscriptions/offer" && req.method === "GET") {
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await resolveDbUser(verified);
      const until = await refreshTrialOffer(user.id);
      const subscription = until ? await getSubscriptionStatusForUser(user.id) : null;
      sendJson(res, 200, { offerUntil: until && !subscription?.active ? until : null, trialDays: TRIAL_DAYS });
      return true;
    }

    // 決済から戻った画面が呼ぶ: { sessionId }。その決済が本人のもので完了していれば、Webhook を待たずに加入を反映する。
    if (url.pathname === "/api/subscriptions/confirm" && req.method === "POST") {
      const body = await readJsonBody(req);
      const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"] : "";
      const stripe = getStripeClient();
      if (!stripe) {
        sendJson(res, 503, { error: "subscriptions_unavailable" });
        return true;
      }
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
        sendJson(res, 400, { error: "invalid_session" });
        return true;
      }
      const user = await resolveDbUser(verified);
      const customerId = await getStripeCustomerId(user.id);
      let session: Stripe.Checkout.Session;
      try {
        session = await stripe.checkout.sessions.retrieve(sessionId);
      } catch {
        sendJson(res, 404, { error: "session_not_found" });
        return true;
      }
      const sessionCustomer = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
      // 他人の決済で自分の状態を書き換えられないように、本人の Stripe の顧客の決済だけを受け付ける。
      if (!customerId || sessionCustomer !== customerId) {
        sendJson(res, 403, { error: "forbidden" });
        return true;
      }
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
      if (session.status === "complete" && subscriptionId) {
        await finalizeCheckoutSubscription(stripe, customerId, subscriptionId);
      }
      const subscription = await getSubscriptionStatusForUser(user.id);
      sendJson(res, 200, { active: subscription.active, plan: subscription.plan, status: subscription.status });
      return true;
    }

    if (url.pathname === "/api/subscriptions/checkout" && req.method === "POST") {
      const body = await readJsonBody(req);
      const tournamentId = typeof body["tournamentId"] === "string" ? (body["tournamentId"] as string) : null;
      // 省略時はシルバー(旧来の画面からの呼び出し)。
      const plan: PlanId = parsePlan(body["plan"]) ?? "silver";
      const stripe = getStripeClient();
      if (!stripe) {
        sendJson(res, 503, { error: "subscriptions_unavailable" });
        return true;
      }
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await resolveDbUser(verified);
      const existing = await prisma.subscription.findUnique({
        where: { userId: user.id },
        select: { stripeSubscriptionId: true, status: true },
      });
      if (hasLiveStripeSubscription(existing)) {
        // 二重契約を防ぐ。プランの変更は change-plan で。
        sendJson(res, 409, { error: "already_subscribed" });
        return true;
      }
      let priceId: string;
      try {
        priceId = await resolvePriceId(stripe, plan);
      } catch (err) {
        console.error("[subscriptionApi] price resolve failed:", err);
        sendJson(res, 503, { error: "subscriptions_unavailable" });
        return true;
      }
      // 無料体験は全プランを通して1人1回(同じカードの2回目は Webhook で弾く)。
      const trial = await isTrialEligible(user.id);

      let stripeCustomerId = await getStripeCustomerId(user.id);
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          ...(verified.email ? { email: verified.email } : {}),
          metadata: { userId: user.id },
        });
        stripeCustomerId = customer.id;
        await attachStripeCustomerId({ userId: user.id, stripeCustomerId });
      }

      // 料金の画面でクーポン(インフルエンサーのコードなど)が入力されていれば、その割引を付けて決済画面を開く。
      // 入力が無ければ、決済画面にコードの入力欄を出す(どちらか一方しか Stripe は受け付けない)。
      const promoCode = typeof body["promoCode"] === "string" ? body["promoCode"].toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 40) : "";
      let promotionCodeId: string | null = null;
      if (promoCode) {
        const found = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 });
        promotionCodeId = found.data[0]?.id ?? null;
        if (!promotionCodeId) {
          sendJson(res, 400, { error: "invalid_code" });
          return true;
        }
      }

      let session: Stripe.Checkout.Session;
      try {
        session = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer: stripeCustomerId,
          line_items: [{ price: priceId, quantity: 1 }],
          payment_method_collection: "always",
          ...(promotionCodeId ? { discounts: [{ promotion_code: promotionCodeId }] } : { allow_promotion_codes: true }),
          subscription_data: {
            metadata: { userId: user.id, plan },
            ...(trial ? { trial_period_days: TRIAL_DAYS } : {}),
          },
          success_url: reviewLandingUrl(tournamentId, "success"),
          cancel_url: reviewLandingUrl(tournamentId, "cancelled"),
        });
      } catch (err) {
        // コードの条件(有料会員になったことが無い人だけ など)に当たらないと、Stripe が受け付けない。
        if (promotionCodeId && (err as { type?: string }).type === "StripeInvalidRequestError") {
          console.warn("[subscriptionApi] promotion code not applicable:", (err as Error).message);
          sendJson(res, 400, { error: "code_not_applicable" });
          return true;
        }
        throw err;
      }

      sendJson(res, 200, { url: session.url });
      return true;
    }

    // プランの変更(ゴールド → プラチナなど)。差額は日割りで、その場で請求・返金する。
    // /change-plan/preview で請求額を見せてから(特商法の最終確認画面)、/change-plan で確定する。
    // 支払いが通らなければ変更しない(payment_behavior: error_if_incomplete)。以前は確認なしで変更し、
    // 「お金を払っていないのに上位プランになった」ように見えていた(オーナー指摘)。
    if ((url.pathname === "/api/subscriptions/change-plan" || url.pathname === "/api/subscriptions/change-plan/preview") && req.method === "POST") {
      const preview = url.pathname.endsWith("/preview");
      const body = await readJsonBody(req);
      const plan = parsePlan(body["plan"]);
      const stripe = getStripeClient();
      if (!stripe) {
        sendJson(res, 503, { error: "subscriptions_unavailable" });
        return true;
      }
      if (!plan) {
        sendJson(res, 400, { error: "plan(silver|gold|platinum) is required" });
        return true;
      }
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await resolveDbUser(verified);
      const row = await prisma.subscription.findUnique({
        where: { userId: user.id },
        select: { stripeSubscriptionId: true, stripeCustomerId: true, status: true },
      });
      if (!row || !hasLiveStripeSubscription(row)) {
        sendJson(res, 404, { error: "no_subscription" });
        return true;
      }
      const current = await stripe.subscriptions.retrieve(row.stripeSubscriptionId!);
      const item = current.items.data[0];
      if (!item) {
        sendJson(res, 409, { error: "no_subscription_item" });
        return true;
      }
      const priceId = await resolvePriceId(stripe, plan);
      if (item.price.id === priceId) {
        sendJson(res, 200, preview ? { amountDue: 0, monthly: PLAN_PRICE_JPY[plan], same: true } : { ok: true, plan });
        return true;
      }
      // 確認画面で見せた額と、確定の請求額を揃えるため、日割りの基準時刻をクライアントから受け取る。
      const prorationDate =
        typeof body["prorationDate"] === "number" ? Math.floor(body["prorationDate"] as number) : Math.floor(Date.now() / 1000);
      if (preview) {
        const inv = await stripe.invoices.createPreview({
          customer: row.stripeCustomerId,
          subscription: current.id,
          subscription_details: {
            items: [{ id: item.id, price: priceId }],
            proration_behavior: "always_invoice",
            proration_date: prorationDate,
          },
        });
        // 試用期間中は請求が発生しない(体験の終了日に新しいプランの額で請求される)。
        sendJson(res, 200, {
          amountDue: Math.max(0, inv.amount_due),
          monthly: PLAN_PRICE_JPY[plan],
          trialing: current.status === "trialing",
          prorationDate,
        });
        return true;
      }
      // 確定は Stripe の確認ページ(Customer Portal の subscription_update_confirm)に任せる(オーナー指示)。
      // 請求額・支払い方法・規約の表示と支払いは Stripe が行い、結果は webhook(customer.subscription.updated)で同期する。
      // ポータルの設定で「サブスクリプションの更新」が無効だと Stripe がエラーを返す。
      try {
        const session = await stripe.billingPortal.sessions.create({
          customer: row.stripeCustomerId,
          return_url: `${webOrigin()}/pricing?changed=${plan}`,
          flow_data: {
            type: "subscription_update_confirm",
            subscription_update_confirm: {
              subscription: current.id,
              items: [{ id: item.id, price: priceId, quantity: 1 }],
            },
            after_completion: { type: "redirect", redirect: { return_url: `${webOrigin()}/pricing?changed=${plan}` } },
          },
        });
        sendJson(res, 200, { url: session.url });
      } catch (err) {
        console.error("[subscriptionApi] change-plan portal failed:", err);
        sendJson(res, 409, { error: "portal_update_disabled" });
      }
      return true;
    }

    if (url.pathname === "/api/subscriptions/portal" && req.method === "POST") {
      const stripe = getStripeClient();
      if (!stripe) {
        sendJson(res, 503, { error: "subscriptions_unavailable" });
        return true;
      }
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await resolveDbUser(verified);
      const stripeCustomerId = await getStripeCustomerId(user.id);
      if (!stripeCustomerId) {
        sendJson(res, 404, { error: "no_subscription" });
        return true;
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${webOrigin()}/`,
      });
      sendJson(res, 200, { url: session.url });
      return true;
    }

    sendJson(res, 404, { error: "not found" });
    return true;
  } catch (err) {
    console.error("[subscriptionApi] request failed:", err);
    sendJson(res, 500, { error: "internal error" });
    return true;
  }
}

export const RELEVANT_EVENT_TYPES: ReadonlySet<string> = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  // 更新の引き落とし成功(新しい期限を取り込む)/ 失敗(自動解約)。
  "invoice.paid",
  "invoice.payment_failed",
  // インフルエンサーへの報酬の打ち消し(返金・チャージバック)。partnerStripe.ts
  "charge.refunded",
  "charge.dispute.created",
]);

/** 請求が属するサブスクの ID(API のバージョンで場所が違うので両方を見る)。 */
function subscriptionIdOfInvoice(invoice: Stripe.Invoice): string | null {
  const direct = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object") return direct.id;
  const parent = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } })
    .parent?.subscription_details?.subscription;
  if (typeof parent === "string") return parent;
  return parent && typeof parent === "object" ? parent.id : null;
}

/** Stripe の契約が生きていて(解約・期限切れでない)、プランの変更ができる状態か。管理者の無料付与(comp)は含めない。 */
function hasLiveStripeSubscription(row: { stripeSubscriptionId: string | null; status: string } | null): boolean {
  if (!row?.stripeSubscriptionId) return false;
  return ["active", "trialing", "past_due"].includes(row.status);
}

/**
 * 無料体験で始まった契約の後始末: 体験を使ったと記録し、同じカードがすでに別の人の体験に使われていたら、
 * その場で体験を終わらせて課金を始める(複数アカウントで体験を繰り返させない。オーナー確定)。
 */
async function settleTrial(stripe: Stripe, customerId: string, subscription: Stripe.Subscription): Promise<Stripe.Subscription> {
  const row = await prisma.subscription.findUnique({ where: { stripeCustomerId: customerId }, select: { userId: true } });
  if (!row) return subscription;
  await markTrialUsed(row.userId);
  const pm = subscription.default_payment_method;
  const fingerprint = pm && typeof pm === "object" ? pm.card?.fingerprint ?? null : null;
  if (!fingerprint) return subscription;
  if (await claimTrialFingerprint(fingerprint, row.userId)) return subscription;
  console.log(`[subscriptionApi] trial card reused -> ending trial ${subscription.id}`);
  return stripe.subscriptions.update(subscription.id, { trial_end: "now", proration_behavior: "none" });
}

async function handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const stripe = getStripeClient();
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!stripe || !webhookSecret) {
    sendJson(res, 503, { error: "webhook_unavailable" });
    return;
  }

  const signature = req.headers["stripe-signature"];
  let rawBody: Buffer;
  try {
    rawBody = await readRawBody(req);
  } catch {
    // ボディ上限超過(BodyTooLargeError)。正規のStripeイベントは十分小さいので拒否してよい。
    sendJson(res, 413, { error: "payload too large" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature as string, webhookSecret);
  } catch (err) {
    console.error("[subscriptionApi] webhook signature verification failed:", err);
    sendJson(res, 400, { error: "invalid signature" });
    return;
  }

  if (!RELEVANT_EVENT_TYPES.has(event.type)) {
    sendJson(res, 200, { received: true });
    return;
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.customer === "string" && typeof session.subscription === "string") {
        await finalizeCheckoutSubscription(stripe, session.customer, session.subscription);
      }
    } else if (event.type === "invoice.payment_failed") {
      // 引き落としができなかった → 再試行を待たずに自動解約(オーナー確定仕様)。
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = subscriptionIdOfInvoice(invoice);
      if (subscriptionId) await cancelForPaymentFailure(stripe, subscriptionId, invoice.id ?? null);
    } else if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = subscriptionIdOfInvoice(invoice);
      if (subscriptionId && typeof invoice.customer === "string") {
        await reconcileSubscription(stripe, invoice.customer, subscriptionId);
      }
      if (subscriptionId) await recordPartnerInvoicePaid(stripe, invoice, subscriptionId);
    } else if (event.type === "charge.refunded") {
      await recordPartnerRefunds(stripe, (event.data.object as Stripe.Charge).id);
    } else if (event.type === "charge.dispute.created") {
      await recordPartnerDispute(event.data.object as Stripe.Dispute);
    } else {
      const subscription = event.data.object as Stripe.Subscription;
      if (typeof subscription.customer === "string") {
        await syncSubscription(subscription.customer, subscription);
      }
    }
    sendJson(res, 200, { received: true });
  } catch (err) {
    console.error("[subscriptionApi] webhook handling failed:", err);
    sendJson(res, 500, { error: "internal error" });
  }
}
