import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

export interface VerifiedUser {
  authId: string;
  email: string | null;
}

/** クライアントから受け取ったSupabaseアクセストークンを検証し、認証済みユーザー情報を返す。 */
export async function verifyAccessToken(accessToken: string | undefined): Promise<VerifiedUser | null> {
  if (!accessToken) return null;
  const client = getAdminClient();
  if (!client) return null;

  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { authId: data.user.id, email: data.user.email ?? null };
}

export function authAvailable(): boolean {
  return getAdminClient() !== null;
}
