"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * ブラウザ用のSupabaseクライアント(シングルトン)。NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定の場合はnullを返し、呼び出し側でログイン機能自体を
 * 無効化できるようにする(開発初期やこれらの値が未設定のデプロイでもアプリ全体がクラッシュしないため)。
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const anonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  if (!url || !anonKey) return null;
  // セッションをlocalStorageへ永続化し、期限切れ前に自動リフレッシュする。これにより
  // 一度ログインしたら、明示的にログアウトするまでアプリを閉じても再ログイン不要になる。
  // (storageKeyは既定のまま変更しない — 変えると既存ユーザーのセッションが全て無効になる)
  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
