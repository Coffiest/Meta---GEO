import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createTokenVerifier, type TokenCacheStats, type VerifiedUser } from "./tokenCache.js";

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
 * トークン検証は結果をキャッシュし、同時に来た同一トークンの検証は1本にまとめる。
 * 詳しい理由と安全性は tokenCache.ts のコメントを参照。
 */
const verifier = createTokenVerifier(async (accessToken) => {
  const client = getAdminClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { authId: data.user.id, email: data.user.email ?? null };
});

/**
 * Supabase Auth 側のユーザーを削除する(退会処理の仕上げ)。
 * これを行わないと、DB側を匿名化しても同じアカウントでログインし直せてしまう。
 * 認証が無効な環境(ローカル開発)では false を返すだけで、退会自体は成立させる。
 */
export async function deleteAuthUser(authId: string): Promise<boolean> {
  const client = getAdminClient();
  if (!client) return false;
  const { error } = await client.auth.admin.deleteUser(authId);
  if (error) {
    console.error("[auth] failed to delete supabase user:", error.message);
    return false;
  }
  return true;
}

/** クライアントから受け取ったSupabaseアクセストークンを検証し、認証済みユーザー情報を返す。 */
export async function verifyAccessToken(accessToken: string | undefined): Promise<VerifiedUser | null> {
  if (!accessToken) return null;
  // 認証自体が無効な環境では往復もキャッシュもせずに弾く。
  if (!getAdminClient()) return null;
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

export function authAvailable(): boolean {
  return getAdminClient() !== null;
}
