import { sendPushToAll } from "./push.js";

/**
 * プライムタイム(毎晩21:00 JST)の開始10分前に、購読者全員へ集合の通知を送る。
 *
 * 「時間を決めて人を同時に集める」のがプライムタイムの目的なので、思い出させる仕組みまで
 * 揃えて初めて機能する。時刻は日本時間(UTC+9)固定 — 日本には夏時間がないため固定オフセットで安全。
 *
 * 送信済みかどうかは「JSTでの日付」で記録する(プロセス再起動で1日1回の保証は失われるが、
 * 二重送信のリスクは分単位のチェック間隔に対して十分小さく、通知1件の重複より
 * 送信漏れの方が体験上の損失が大きい)。
 */

const PRIME_TIME_HOUR_JST = 21;
const NOTIFY_MINUTES_BEFORE = 10;
const CHECK_INTERVAL_MS = 60_000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 通知を送るべき時刻か(JSTで20:50台に入っているか)を判定する純粋関数。 */
export function shouldNotifyAt(now: Date): boolean {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const targetMinutes = PRIME_TIME_HOUR_JST * 60 - NOTIFY_MINUTES_BEFORE;
  const nowMinutes = jst.getUTCHours() * 60 + jst.getUTCMinutes();
  return nowMinutes === targetMinutes;
}

/** JSTでの日付キー("YYYY-MM-DD")。1日1回の判定に使う。 */
export function jstDateKey(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

let lastNotifiedDate: string | null = null;

/** 毎分チェックしてプライムタイム10分前に通知を送る常駐タイマーを開始する。 */
export function startPrimeTimeNotifier(): void {
  setInterval(() => {
    const now = new Date();
    if (!shouldNotifyAt(now)) return;
    const key = jstDateKey(now);
    if (lastNotifiedDate === key) return;
    lastNotifiedDate = key;

    void sendPushToAll({
      title: "まもなくプライムタイム",
      body: "21:00から、みんなで卓を埋める時間です。今すぐ席に着こう。",
      path: "/",
      tag: "prime-time",
    })
      .then((sent) => {
        if (sent > 0) console.log(`[push] prime time reminder sent to ${sent} subscription(s)`);
      })
      .catch((err) => console.error("[push] prime time reminder failed:", err));
  }, CHECK_INTERVAL_MS).unref?.();
}
