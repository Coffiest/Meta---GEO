import webpush from "web-push";
import { prisma } from "@meta-geo/db";

/**
 * PWAプッシュ通知(Web Push)の送信基盤。
 *
 * VAPID鍵(VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)が未設定の場合は機能全体が無効になり、
 * 購読APIは503を返し、送信は黙ってスキップする(Supabase/Stripe未設定時と同じ流儀。
 * 鍵が無いだけでサーバーが落ちたり、他の機能が巻き添えで壊れたりしない)。
 *
 * iOSではホーム画面に追加したスタンドアロンPWAでのみプッシュが届く(Safariのタブでは不可)。
 * その案内はクライアント側のUIで行う。
 */

let configured: boolean | undefined;

function ensureConfigured(): boolean {
  if (configured !== undefined) return configured;
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  // 送信元の連絡先。プッシュサービスが送信者を識別するために要求する。
  webpush.setVapidDetails(process.env["VAPID_SUBJECT"] ?? "https://meta-geo-poker.vercel.app", publicKey, privateKey);
  configured = true;
  return true;
}

/** プッシュ通知が利用可能か(VAPID鍵が設定されているか)。 */
export function pushAvailable(): boolean {
  return ensureConfigured();
}

/** クライアントが購読を作るために必要な公開鍵。未設定ならnull。 */
export function pushPublicKey(): string | null {
  return ensureConfigured() ? process.env["VAPID_PUBLIC_KEY"] ?? null : null;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** 購読を保存する(同じendpointの再購読は上書き。端末の付け替えでも重複しない)。 */
export async function savePushSubscription(userId: string, sub: PushSubscriptionInput): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
}

/** 購読を解除する(通知オフ)。 */
export async function deletePushSubscription(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

/** そのユーザーが1台でも通知を購読しているか(UIの状態表示用)。 */
export async function hasPushSubscription(userId: string): Promise<boolean> {
  return (await prisma.pushSubscription.count({ where: { userId } })) > 0;
}

export interface PushPayload {
  title: string;
  body: string;
  /** 通知タップ時に開くパス(既定はホーム)。 */
  path?: string;
  /** 同種の通知を1つにまとめるためのタグ。 */
  tag?: string;
}

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function sendToSubscriptions(subs: StoredSubscription[], payload: PushPayload): Promise<number> {
  if (!ensureConfigured() || subs.length === 0) return 0;
  const body = JSON.stringify(payload);
  let sent = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent += 1;
      } catch (err) {
        // 410 Gone / 404 は購読が失効している。その場で消して死んだ購読を溜めない。
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } }).catch(() => undefined);
        } else {
          console.error("[push] send failed:", statusCode ?? err);
        }
      }
    }),
  );
  return sent;
}

/** 特定ユーザーの全端末へ送る(招待成立の通知など)。 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;
  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true, p256dh: true, auth: true },
  });
  return sendToSubscriptions(subs, payload);
}

/** 購読している全ユーザーへ送る(プライムタイム開始の告知など)。 */
export async function sendPushToAll(payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;
  const subs = await prisma.pushSubscription.findMany({
    select: { endpoint: true, p256dh: true, auth: true },
  });
  return sendToSubscriptions(subs, payload);
}
