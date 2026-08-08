import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

/**
 * 管理者パスコードの検証を1か所に集約する。
 *
 * 背景(このリポジトリは public):
 *  - 以前は `value === adminPasscode()` の単純比較で、レート制限もタイミングセーフ比較も無かった。
 *    4桁の既定値 `2357` が deploy.yml に未設定=本番で有効なうえ、クライアントにも平文で載っていた。
 *  - 現状は「移行期間」対応: 既定値は当面残すが、(1) タイミングセーフ比較、
 *    (2) IPあたりのレート制限、(3) 既定値運用時の起動時警告 で総当たり・情報漏れを塞ぐ。
 *  - オーナーが GitHub Secrets に ADMIN_PASSCODE を設定したら、既定値の削除へ進む。
 */

/** 既定パスコード。ADMIN_PASSCODE 未設定時のフォールバック(移行期間中のみ)。 */
const DEFAULT_PASSCODE = "2357";

export function adminPasscode(): string {
  // 空文字("")は「未設定」とみなす(CIが誤って空で上書きしても既定値へフォールバックし、
  // 空パスコードで誰でも通る状態を作らない)。
  const v = process.env["ADMIN_PASSCODE"];
  return v && v.length > 0 ? v : DEFAULT_PASSCODE;
}

/** 既定値のまま運用しているか(起動時警告・診断表示用)。 */
export function isUsingDefaultAdminPasscode(): boolean {
  const v = process.env["ADMIN_PASSCODE"];
  return !v || v.length === 0;
}

/**
 * 長さの違いでも早期returnせず、常に固定長のバッファ同士を比較して
 * 実行時間から桁数・一致度が漏れないようにする。
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual は長さ不一致で throw するため、長い方に合わせた同長バッファで比較する。
  const len = Math.max(bufA.length, bufB.length, 1);
  const padA = Buffer.alloc(len);
  const padB = Buffer.alloc(len);
  bufA.copy(padA);
  bufB.copy(padB);
  // 長さ自体の一致も結果に織り込む(パディングだけ一致しても通さない)。
  return timingSafeEqual(padA, padB) && bufA.length === bufB.length;
}

// --- IPあたりのレート制限(総当たり対策) ---
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; windowStartedAt: number }>();

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

export type AdminAuthResult = "ok" | "unauthorized" | "rate_limited";

/**
 * 管理者リクエストを検証する。レート超過なら "rate_limited"、
 * パスコード不一致なら "unauthorized"、一致なら "ok"。
 * 成功時はそのIPの失敗カウンタをリセットする。
 */
export function checkAdminAuth(req: IncomingMessage): AdminAuthResult {
  const ip = clientIp(req);
  const now = Date.now();
  const bucket = attempts.get(ip);
  const windowActive = bucket && now - bucket.windowStartedAt < RATE_WINDOW_MS;
  if (windowActive && bucket.count >= RATE_MAX_ATTEMPTS) return "rate_limited";

  const header = req.headers["x-admin-passcode"];
  const value = Array.isArray(header) ? header[0] : header;
  const ok = typeof value === "string" && safeEqual(value, adminPasscode());

  if (ok) {
    attempts.delete(ip);
    return "ok";
  }

  // 失敗を記録(ウィンドウを跨いだらリセット)。溜まり過ぎたら掃除する。
  if (!windowActive) {
    attempts.set(ip, { count: 1, windowStartedAt: now });
    if (attempts.size > 5_000) {
      for (const [key, v] of attempts) if (now - v.windowStartedAt > RATE_WINDOW_MS) attempts.delete(key);
    }
  } else {
    bucket!.count += 1;
  }
  return "unauthorized";
}

/**
 * 準備中モード(MTT)の解錠コードが正しいかをタイミングセーフに判定する。
 * クライアント側の判定だけでは `joinGame {gameKey:"mtt"}` の直送で突破できるため、
 * サーバー側ゲートでもこの関数で照合する。
 */
export function isValidUnlockCode(code: unknown): boolean {
  return typeof code === "string" && code.length > 0 && safeEqual(code, adminPasscode());
}

/** 起動時に既定パスコード運用を警告する(deploy.yml へ Secret を設定する動機づけ)。 */
export function warnIfDefaultAdminPasscode(): void {
  if (isUsingDefaultAdminPasscode()) {
    console.warn(
      "[admin] ADMIN_PASSCODE が未設定です。既定パスコードで稼働しています。" +
        "本番では GitHub Secrets / Fly secrets に ADMIN_PASSCODE を設定してください。",
    );
  }
}
