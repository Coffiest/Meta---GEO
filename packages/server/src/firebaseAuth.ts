import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { VerifiedUser } from "./tokenCache.js";

/**
 * RRPoker(Firebase Auth)のアカウントで Poker ART にログインできるようにするための、
 * Firebase IDトークンの検証。
 *
 * Poker ART本体の認証は従来どおり Supabase のままで、ここは「もう一つの入口」を足すだけ。
 * 既存の Supabase ユーザーの経路には一切手を触れない。
 *
 * 返す authId には `firebase:` の接頭辞を付ける。Supabase のユーザーIDはUUIDなので、
 * 接頭辞を付けておけば両者が同じ `User.authId` 空間に入っても絶対に衝突しない。
 */

/** Firebase 由来のユーザーであることを示す authId の接頭辞。 */
export const FIREBASE_AUTH_ID_PREFIX = "firebase:";

/** Firebase IDトークンの発行者。トークンの振り分けに使う。 */
const FIREBASE_ISSUER_PREFIX = "https://securetoken.google.com/";

let app: App | null | undefined;

/**
 * firebase-admin を遅延初期化する。認証情報が無い環境(ローカル開発・単体サイトのみの構成)では
 * null を返し、Firebase 経由のログインだけが無効になる(Supabase側は影響を受けない)。
 *
 * 資格情報は次の順で探す:
 *  1. FIREBASE_SERVICE_ACCOUNT … サービスアカウントJSONをそのまま入れた環境変数
 *  2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY … 分割して渡す形
 */
function getFirebaseApp(): App | null {
  if (app !== undefined) return app;

  try {
    const existing = getApps();
    if (existing.length > 0) {
      app = existing[0]!;
      return app;
    }

    const raw = process.env["FIREBASE_SERVICE_ACCOUNT"];
    if (raw) {
      const parsed = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        app = initializeApp({
          credential: cert({
            projectId: parsed.project_id,
            clientEmail: parsed.client_email,
            // 環境変数に入れる都合で改行が \n にエスケープされていることがある。
            privateKey: parsed.private_key.replace(/\\n/g, "\n"),
          }),
        });
        return app;
      }
    }

    const projectId = process.env["FIREBASE_PROJECT_ID"];
    const clientEmail = process.env["FIREBASE_CLIENT_EMAIL"];
    const privateKey = process.env["FIREBASE_PRIVATE_KEY"];
    if (projectId && clientEmail && privateKey) {
      app = initializeApp({
        credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") }),
      });
      return app;
    }
  } catch (err) {
    console.error("[auth] failed to initialise firebase-admin:", err);
  }

  app = null;
  return app;
}

/** このトークンが Firebase の IDトークンかどうか(発行者で判定する)。 */
export function isFirebaseIssuer(issuer: string | null): boolean {
  return issuer !== null && issuer.startsWith(FIREBASE_ISSUER_PREFIX);
}

/** Firebase 経由のログインが使える環境かどうか。 */
export function firebaseAuthAvailable(): boolean {
  return getFirebaseApp() !== null;
}

/** authId から Firebase の uid を取り出す。Firebase 由来でなければ null。 */
export function firebaseUidFromAuthId(authId: string): string | null {
  return authId.startsWith(FIREBASE_AUTH_ID_PREFIX) ? authId.slice(FIREBASE_AUTH_ID_PREFIX.length) : null;
}

/**
 * Firebase の IDトークンを検証して、Poker ART 内部の識別子に変換する。
 * 失効・改ざん・プロジェクト不一致はすべて firebase-admin 側で弾かれる。
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedUser | null> {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  try {
    const decoded = await getAuth(firebaseApp).verifyIdToken(idToken);
    return { authId: `${FIREBASE_AUTH_ID_PREFIX}${decoded.uid}`, email: decoded.email ?? null };
  } catch {
    // 期限切れ・不正なトークン。呼び出し側では「未認証」として扱えば足りる。
    return null;
  }
}

/**
 * Firebase Auth 側のユーザーを削除する(退会処理の仕上げ)。
 * Supabase 側の deleteAuthUser と同じ役割を Firebase 由来のユーザーに対して果たす。
 */
export async function deleteFirebaseUser(uid: string): Promise<boolean> {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return false;
  try {
    await getAuth(firebaseApp).deleteUser(uid);
    return true;
  } catch (err) {
    console.error("[auth] failed to delete firebase user:", err);
    return false;
  }
}
