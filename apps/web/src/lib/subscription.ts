"use client";

import { useCallback, useEffect, useState } from "react";

export interface SubscriptionStatus {
  active: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
  /** 残り無料解析回数(24時間ローリング)。 */
  reviewsRemaining: number;
  reviewLimit: number;
  /** 無料枠を使い切っている場合、次に無料解析できる時刻(ISO)。加入者/残枠ありならnull。 */
  nextFreeAt: string | null;
  /** いま使えるプラン。未加入は null。 */
  plan?: PlanId | null;
  /** Stripe の契約が生きていて、プランの上げ下げ(change-plan)ができるか。 */
  canChangePlan?: boolean;
  /** 無料体験(全プランを通して1人1回)がまだ使えるか。 */
  trialEligible?: boolean;
  trialDays?: number;
  prices?: Record<PlanId, number>;
}

export type PlanId = "silver" | "gold" | "platinum";

export const PLAN_LABEL: Record<PlanId, string> = { silver: "シルバー", gold: "ゴールド", platinum: "プラチナ" };

/** サーバーから価格が取れないときの表示用(サーバーの PLAN_PRICE_JPY と同じ値)。 */
export const DEFAULT_PRICES: Record<PlanId, number> = { silver: 980, gold: 1380, platinum: 1890 };

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

/** Stripe未設定(キー無し)による決済不能を表すエラー。UI側で「準備中」表示に使う。 */
export class SubscriptionUnavailableError extends Error {
  constructor() {
    super("subscriptions_unavailable");
    this.name = "SubscriptionUnavailableError";
  }
}

export async function fetchSubscriptionStatus(accessToken: string): Promise<SubscriptionStatus | null> {
  const res = await fetch(`${SERVER_URL}/api/subscriptions/status`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as SubscriptionStatus;
}

/**
 * Stripe Checkoutセッションを作成し、決済ページへ遷移する。
 * tournamentIdを渡すと、加入後にその棋譜解析画面へ戻る。
 * Stripe未設定(503)時は SubscriptionUnavailableError を投げる。
 */
export async function startCheckout(accessToken: string, tournamentId?: string, plan: PlanId = "silver"): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/subscriptions/checkout`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(tournamentId ? { tournamentId, plan } : { plan }),
  });
  if (res.status === 503) throw new SubscriptionUnavailableError();
  if (!res.ok) throw new Error("チェックアウトの開始に失敗しました");
  const { url } = (await res.json()) as { url: string };
  window.location.href = url;
}

export interface ChangePlanPreview {
  /** 今すぐ請求される額(日割りの差額。下げるときは0)。 */
  amountDue: number;
  /** 変更後の月額。 */
  monthly: number;
  /** 無料体験中(今は請求されない)。 */
  trialing?: boolean;
  /** 日割りの基準時刻(確定のときに同じ値を送る)。 */
  prorationDate?: number;
  same?: boolean;
}

/** プラン変更の請求額を確かめる(特商法の最終確認画面に出す)。 */
export async function previewChangePlan(accessToken: string, plan: PlanId): Promise<ChangePlanPreview> {
  const res = await fetch(`${SERVER_URL}/api/subscriptions/change-plan/preview`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  if (res.status === 503) throw new SubscriptionUnavailableError();
  if (!res.ok) throw new Error("請求額を確認できませんでした");
  return (await res.json()) as ChangePlanPreview;
}

/** 支払いが通らずプランを変えられなかった。 */
export class PaymentFailedError extends Error {
  constructor() {
    super("payment_failed");
    this.name = "PaymentFailedError";
  }
}

/** 加入中のプランを変える(差額は日割りで、その場で請求・返金される)。支払いが通らなければ変えない。 */
export async function changePlan(accessToken: string, plan: PlanId, prorationDate?: number): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/subscriptions/change-plan`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ plan, prorationDate }),
  });
  if (res.status === 503) throw new SubscriptionUnavailableError();
  if (res.status === 402) throw new PaymentFailedError();
  if (!res.ok) throw new Error("プランを変更できませんでした");
}

/** StripeホステッドのCustomer Portal(解約・支払い方法変更)へ遷移する。 */
export async function openBillingPortal(accessToken: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/subscriptions/portal`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 503) throw new SubscriptionUnavailableError();
  if (!res.ok) throw new Error("契約管理ページを開けませんでした");
  const { url } = (await res.json()) as { url: string };
  window.location.href = url;
}

/** ログイン済みユーザーのサブスク状態(+無料枠残数)を取得するフック。ゲスト(トークン無し)ではnullのまま。 */
export function useSubscriptionStatus(accessToken: string | undefined) {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(Boolean(accessToken));

  const reload = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setStatus(await fetchSubscriptionStatus(accessToken));
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setStatus(null);
      setLoading(false);
      return;
    }
    void reload();
  }, [accessToken, reload]);

  return { status, loading, reload };
}
