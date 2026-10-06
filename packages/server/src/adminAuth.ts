import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { authAvailable, verifyAccessToken } from "./auth.js";

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

// ---------------------------------------------------------------------------
// 管理者アカウント(パスコードに加えて、ログイン中のアカウントも確かめる)
//
// パスコードはこのリポジトリと昔のクライアントに平文で載っていたため、それだけでは守りにならない。
// 管理者の操作は「パスコード」かつ「管理者のアカウントでログインしている」ときだけ通す。
//  - 管理者のアカウントは、メールアドレスの SHA-256(下の一覧と env ADMIN_EMAILS)か、ユーザーID(env ADMIN_USER_IDS)で決める。
//    メールアドレスそのものはソースに書かない(ハッシュだけ)。
//  - 認証そのものが無い開発環境(!authAvailable())では、パスコードだけで通す。
// ---------------------------------------------------------------------------

/** オーナーのアカウントのメールアドレスの SHA-256(小文字・前後の空白なし)。 */
const BUILTIN_ADMIN_EMAIL_SHA256 = ["541bf50f1a6c1a9c8e3a48a6c381c1b55064be3b603a6a8719111598aac20460"];

function sha256(v: string): string {
  return createHash("sha256").update(v.trim().toLowerCase()).digest("hex");
}

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/** そのメールアドレス / ユーザーID が管理者か。 */
export function isAdminIdentity(email: string | null | undefined, userId: string | null | undefined): boolean {
  if (userId && envList("ADMIN_USER_IDS").includes(userId)) return true;
  if (!email) return false;
  const h = sha256(email);
  if (BUILTIN_ADMIN_EMAIL_SHA256.includes(h)) return true;
  return envList("ADMIN_EMAILS").some((e) => sha256(e) === h);
}

function bearerOf(req: IncomingMessage): string | undefined {
  const header = req.headers["authorization"];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.startsWith("Bearer ") ? value.slice("Bearer ".length) : undefined;
}

export type AdminAccessResult =
  | { status: "ok" }
  | { status: "rate_limited" }
  | { status: "unauthorized" }
  /** パスコードは正しいが、ログインしていない / 管理者のアカウントではない。userId は画面に出して登録に使う。 */
  | { status: "not_admin"; userId: string | null };

/** 管理者のリクエストを検証する(パスコード + 管理者のアカウント)。 */
export async function checkAdminAccess(req: IncomingMessage): Promise<AdminAccessResult> {
  const pass = checkAdminAuth(req);
  if (pass === "rate_limited") return { status: "rate_limited" };
  if (pass !== "ok") return { status: "unauthorized" };
  if (!authAvailable()) return { status: "ok" };
  const verified = await verifyAccessToken(bearerOf(req)).catch(() => null);
  if (!verified) return { status: "not_admin", userId: null };
  const { prisma } = await import("@meta-geo/db");
  const user = await prisma.user.findUnique({ where: { authId: verified.authId }, select: { id: true, email: true } });
  const email = verified.email ?? user?.email ?? null;
  if (isAdminIdentity(email, user?.id ?? null)) return { status: "ok" };
  return { status: "not_admin", userId: user?.id ?? null };
}
