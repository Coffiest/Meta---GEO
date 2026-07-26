"use client";

/**
 * PWAプッシュ通知のクライアント側。Service Workerの登録・通知許可・購読の作成/解除を担う。
 *
 * iOSではホーム画面に追加したスタンドアロンPWAでのみプッシュが使える(Safariのタブでは
 * PushManagerごと存在しない)。そのため「使えるかどうか」の判定は必ず実行時に行い、
 * 使えない環境では通知UIそのものを出さない。
 */

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

export interface PushConfig {
  /** サーバー側でVAPID鍵が設定されているか。 */
  available: boolean;
  publicKey: string | null;
  /** このアカウントが1台でも通知を購読しているか。 */
  subscribed: boolean;
}

/** この端末・ブラウザがWeb Pushに対応しているか。 */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** 通知許可の現在の状態。未対応環境では "unsupported"。 */
export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

export async function fetchPushConfig(accessToken: string): Promise<PushConfig | null> {
  const res = await fetch(`${SERVER_URL}/api/lobby/push/config`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as PushConfig;
}

/**
 * VAPID公開鍵(base64url)をpushManager.subscribeが要求するバイト列へ変換する。
 * applicationServerKey は ArrayBuffer 実体を持つビューでなければ受け付けられないため、
 * ArrayBuffer を明示的に確保してから書き込む。
 */
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js");
}

/**
 * 通知を有効にする(許可要求 → 購読作成 → サーバーへ保存)。
 * 許可されなかった場合や未対応環境ではfalseを返す。
 */
export async function enablePush(accessToken: string, publicKey: string): Promise<boolean> {
  if (!pushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = await registerServiceWorker();
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const res = await fetch(`${SERVER_URL}/api/lobby/push/subscribe`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  return res.ok;
}

/** 通知を無効にする(この端末の購読を解除し、サーバーからも削除する)。 */
export async function disablePush(accessToken: string): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => undefined);
  await fetch(`${SERVER_URL}/api/lobby/push/unsubscribe`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => undefined);
}
