"use client";

import { useCallback, useEffect, useState } from "react";

export interface SubscriptionStatus {
  active: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
  dailyViewsRemaining: number;
  dailyViewLimit: number;
}

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

export async function fetchSubscriptionStatus(accessToken: string): Promise<SubscriptionStatus | null> {
  const res = await fetch(`${SERVER_URL}/api/subscriptions/status`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as SubscriptionStatus;
}

/** Stripe Checkoutセッションを作成し、決済ページへ遷移する。 */
export async function startCheckout(accessToken: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/subscriptions/checkout`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("チェックアウトの開始に失敗しました");
  const { url } = (await res.json()) as { url: string };
  window.location.href = url;
}

/** StripeホステッドのCustomer Portal(解約・支払い方法変更)へ遷移する。 */
export async function openBillingPortal(accessToken: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/subscriptions/portal`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
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
