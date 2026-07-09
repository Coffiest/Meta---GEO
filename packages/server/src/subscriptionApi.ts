import type { IncomingMessage, ServerResponse } from "node:http";
import Stripe from "stripe";
import {
  attachStripeCustomerId,
  getDailyGeoViewRemaining,
  getOrCreateUserByAuthId,
  getStripeCustomerId,
  getSubscriptionStatusForUser,
  upsertSubscriptionFromStripeEvent,
} from "@meta-geo/db";
import { verifyAccessToken, type VerifiedUser } from "./auth.js";

let stripeClient: Stripe | null | undefined;

/** STRIPE_SECRET_KEYが未設定の環境(ローカル開発等)ではnullを返し、サブスク機能自体を無効化する。 */
function getStripeClient(): Stripe | null {
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

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function resolveDbUser(verified: VerifiedUser) {
  const fallbackName = verified.email?.split("@")[0] ?? "Player";
  return getOrCreateUserByAuthId({ authId: verified.authId, email: verified.email, displayName: fallbackName });
}

/**
 * GEO戦略DBの月額サブスクリプション関連API。`/api/subscriptions/*` 配下のリクエストを処理する。
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
      const [subscription, dailyView] = await Promise.all([
        getSubscriptionStatusForUser(user.id),
        getDailyGeoViewRemaining(user.id),
      ]);
      sendJson(res, 200, {
        active: subscription.active,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        dailyViewsRemaining: dailyView.remaining,
        dailyViewLimit: dailyView.limit,
      });
      return true;
    }

    if (url.pathname === "/api/subscriptions/checkout" && req.method === "POST") {
      const stripe = getStripeClient();
      const priceId = process.env["STRIPE_PRICE_ID"];
      if (!stripe || !priceId) {
        sendJson(res, 503, { error: "subscriptions_unavailable" });
        return true;
      }
      const verified = await verifyAccessToken(extractBearerToken(req));
      if (!verified) {
        sendJson(res, 401, { error: "unauthorized" });
        return true;
      }
      const user = await resolveDbUser(verified);

      let stripeCustomerId = await getStripeCustomerId(user.id);
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          ...(verified.email ? { email: verified.email } : {}),
          metadata: { userId: user.id },
        });
        stripeCustomerId = customer.id;
        await attachStripeCustomerId({ userId: user.id, stripeCustomerId });
      }

      const webOrigin = process.env["WEB_ORIGIN"] ?? "http://localhost:3000";
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${webOrigin}/geo?checkout=success`,
        cancel_url: `${webOrigin}/pricing?checkout=cancelled`,
      });

      sendJson(res, 200, { url: session.url });
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

      const webOrigin = process.env["WEB_ORIGIN"] ?? "http://localhost:3000";
      const session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${webOrigin}/`,
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

const RELEVANT_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

async function handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const stripe = getStripeClient();
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!stripe || !webhookSecret) {
    sendJson(res, 503, { error: "webhook_unavailable" });
    return;
  }

  const signature = req.headers["stripe-signature"];
  const rawBody = await readRawBody(req);

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
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await syncSubscription(session.customer, subscription);
      }
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

async function syncSubscription(stripeCustomerId: string, subscription: Stripe.Subscription): Promise<void> {
  await upsertSubscriptionFromStripeEvent({
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
  });
}
