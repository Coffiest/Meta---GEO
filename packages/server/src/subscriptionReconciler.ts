import type Stripe from "stripe";
import { listSubscriptionsToReconcile, upsertSubscriptionFromStripeEvent } from "@meta-geo/db";

/**
 * 棋譜解析プラン(Stripe サブスク)の期限・更新・解約を、Stripe の実際の状態に合わせる。
 *
 * オーナー確定仕様:
 * - 期限が来たら自動で引き落とす(Stripe の自動課金。Checkout が `charge_automatically` で作る)
 * - **引き落としができなかったら自動で解約する**(Stripe の再試行は待たない)。失敗した請求は
 *   無効化(void)し、解約後に後から請求されることがないようにする
 * - 期限が過ぎたら、Webhook が届いていなくても使えなくする(DB 側の `isStripeSubscriptionActive`)
 *
 * Webhook だけに頼ると、取りこぼし(エンドポイントの購読イベント漏れ・一時的な障害)で
 * 「期限が切れても有効のまま」になる。そのため、期限を過ぎた契約を定期的に Stripe に照会して直す。
 */

/** 引き落としに失敗している(自動解約の対象)とみなす Stripe の状態。 */
const PAYMENT_FAILED_STATUSES = new Set<Stripe.Subscription.Status>(["past_due", "unpaid"]);

const RECONCILE_INTERVAL_MS = 10 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 30 * 1000;

/** Stripe API のバージョンによって期限の場所が違う(サブスク本体 / 品目)。どちらからでも読む。 */
export function periodEndOf(subscription: Stripe.Subscription): Date | null {
  const top = (subscription as unknown as { current_period_end?: number }).current_period_end;
  if (typeof top === "number") return new Date(top * 1000);
  const item = subscription.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  return typeof item?.current_period_end === "number" ? new Date(item.current_period_end * 1000) : null;
}

function customerIdOf(subscription: Stripe.Subscription): string | null {
  const c = subscription.customer;
  if (typeof c === "string") return c;
  return c && typeof c === "object" && "id" in c ? c.id : null;
}

export async function syncSubscription(stripeCustomerId: string, subscription: Stripe.Subscription): Promise<void> {
  await upsertSubscriptionFromStripeEvent({
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: periodEndOf(subscription),
  });
}

/**
 * 引き落とし失敗による自動解約。サブスクを即時解約し、払われなかった請求を無効化してから DB を同期する。
 * 何度呼んでも同じ結果になる(すでに解約済みなら同期だけ)。
 */
export async function cancelForPaymentFailure(
  stripe: Stripe,
  subscriptionId: string,
  failedInvoiceId: string | null,
): Promise<void> {
  let subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.status !== "canceled" && subscription.status !== "incomplete_expired") {
    subscription = await stripe.subscriptions.cancel(subscriptionId, { invoice_now: false, prorate: false });
    console.log(`[subscription] payment failed -> canceled ${subscriptionId}`);
  }
  const invoiceId =
    failedInvoiceId ??
    (typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice?.id ?? null);
  if (invoiceId) await voidIfOpen(stripe, invoiceId);
  const customerId = customerIdOf(subscription);
  if (customerId) await syncSubscription(customerId, subscription);
}

/** 未払いのまま残った請求を無効化する(解約した人に後から請求が行かないように)。 */
async function voidIfOpen(stripe: Stripe, invoiceId: string): Promise<void> {
  try {
    const invoice = await stripe.invoices.retrieve(invoiceId);
    if (invoice.status === "open") await stripe.invoices.voidInvoice(invoiceId);
  } catch (err) {
    console.error(`[subscription] failed to void invoice ${invoiceId}:`, err);
  }
}

/**
 * 1件の契約を Stripe に照会して DB を合わせる。引き落としに失敗していれば自動解約する。
 * Stripe 側にサブスクが存在しなければ解約済みとして記録する。
 */
export async function reconcileSubscription(
  stripe: Stripe,
  stripeCustomerId: string,
  subscriptionId: string,
): Promise<void> {
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    if ((err as { code?: string }).code === "resource_missing") {
      await upsertSubscriptionFromStripeEvent({
        stripeCustomerId,
        stripeSubscriptionId: subscriptionId,
        status: "canceled",
        currentPeriodEnd: new Date(),
      });
      return;
    }
    throw err;
  }
  if (PAYMENT_FAILED_STATUSES.has(subscription.status)) {
    await cancelForPaymentFailure(stripe, subscriptionId, null);
    return;
  }
  await syncSubscription(stripeCustomerId, subscription);
}

/** 期限を過ぎた/支払いが滞っている契約をまとめて照合する。 */
export async function reconcileDueSubscriptions(stripe: Stripe, now: Date = new Date()): Promise<number> {
  const due = await listSubscriptionsToReconcile(now);
  let done = 0;
  for (const row of due) {
    try {
      await reconcileSubscription(stripe, row.stripeCustomerId, row.stripeSubscriptionId);
      done += 1;
    } catch (err) {
      console.error(`[subscription] reconcile failed for ${row.stripeSubscriptionId}:`, err);
    }
  }
  if (due.length > 0) console.log(`[subscription] reconciled ${done}/${due.length}`);
  return done;
}

let timer: NodeJS.Timeout | null = null;

/** 照合ジョブを開始する(Stripe のキーが無い環境では何もしない)。 */
export function startSubscriptionReconciler(getStripe: () => Stripe | null): void {
  if (timer) return;
  const run = () => {
    const stripe = getStripe();
    if (!stripe) return;
    reconcileDueSubscriptions(stripe).catch((err) => console.error("[subscription] reconcile run failed:", err));
  };
  setTimeout(run, FIRST_RUN_DELAY_MS).unref();
  timer = setInterval(run, RECONCILE_INTERVAL_MS);
  timer.unref();
}
