import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createTokenVerifier, readTokenIssuer, type TokenCacheStats, type VerifiedUser } from "./tokenCache.js";
import {
  deleteFirebaseUser,
  firebaseAuthAvailable,
  firebaseUidFromAuthId,
  isFirebaseIssuer,
  verifyFirebaseIdToken,
} from "./firebaseAuth.js";

let adminClient: SupabaseClient | null | undefined;

/**
 * サーバー側でSupabaseのアクセストークンを検証するための管理クライアント。
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定の場合はnull(認証機能自体が無効)。
 */
function getAdminClient(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const url = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  adminClient = url && serviceRoleKey ? createClient(url, serviceRoleKey) : null;
  return adminClient;
}

export type { VerifiedUser } from "./tokenCache.js";
export type AuthStats = TokenCacheStats;

/**
 * トークンを発行元へ検証しに行く。受け付ける入口は2つ:
 *  - Supabase … Poker ART 単体サイトのアカウント(従来からの経路。挙動は一切変えない)
 *  - Firebase … RRPoker のアカウント(RRPoker から Poker ART を遊ぶための入口)
 *
 * どちらかは iss クレームで振り分ける。iss 自体は署名検証していないが、これは
 * 「どちらの発行元に検証を頼むか」を選ぶだけで、選んだ先が改めて署名を検証する。
 * Firebase のトークンを Supabase に投げても(その逆でも)弾かれるだけなので、
 * ここでの振り分けが誤っても認証が甘くなることはない。
 */
async function verifyWithIssuer(accessToken: string): Promise<VerifiedUser | null> {
  if (isFirebaseIssuer(readTokenIssuer(accessToken))) {
    return verifyFirebaseIdToken(accessToken);
  }
  const client = getAdminClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { authId: data.user.id, email: data.user.email ?? null };
}

/**
 * トークン検証は結果をキャッシュし、同時に来た同一トークンの検証は1本にまとめる。
 * 詳しい理由と安全性は tokenCache.ts のコメントを参照。
 * 発行元が Supabase でも Firebase でも同じキャッシュに乗る。
 */
const verifier = createTokenVerifier(verifyWithIssuer);

/**
 * 認証基盤側のユーザーを削除する(退会処理の仕上げ)。
 * これを行わないと、DB側を匿名化しても同じアカウントでログインし直せてしまう。
 * authId の接頭辞で削除先(Supabase / Firebase)を選ぶ。
 * 認証が無効な環境(ローカル開発)では false を返すだけで、退会自体は成立させる。
 */
export async function deleteAuthUser(authId: string): Promise<boolean> {
  const firebaseUid = firebaseUidFromAuthId(authId);
  if (firebaseUid) return deleteFirebaseUser(firebaseUid);

  const client = getAdminClient();
  if (!client) return false;
  const { error } = await client.auth.admin.deleteUser(authId);
  if (error) {
    console.error("[auth] failed to delete supabase user:", error.message);
    return false;
  }
  return true;
}

/**
 * クライアントから受け取ったアクセストークン(Supabase または Firebase)を検証し、
 * 認証済みユーザー情報を返す。
 */
export async function verifyAccessToken(accessToken: string | undefined): Promise<VerifiedUser | null> {
  if (!accessToken) return null;
  // その発行元の認証がそもそも無効な環境では、往復もキャッシュもせずに弾く。
  const wantsFirebase = isFirebaseIssuer(readTokenIssuer(accessToken));
  if (wantsFirebase ? !firebaseAuthAvailable() : !getAdminClient()) return null;
  return verifier.verify(accessToken);
}

/** 検証コストの実測値(診断ページで「認証が重いのか」を切り分けるために使う)。 */
export function getAuthStats(): AuthStats {
  return verifier.stats();
}

/** サインアウト等でトークンを即座に無効化したいときに使う。 */
export function invalidateAccessToken(accessToken: string): void {
  verifier.invalidate(accessToken);
}

/** 何らかの手段でログインできる環境かどうか。 */
export function authAvailable(): boolean {
  return getAdminClient() !== null || firebaseAuthAvailable();
}

/** RRPoker(Firebase)アカウントでのログインが使えるか。クライアントへの案内に使う。 */
export function rrPokerAuthAvailable(): boolean {
  return firebaseAuthAvailable();
}
