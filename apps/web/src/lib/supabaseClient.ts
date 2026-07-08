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
  client = createClient(url, anonKey);
  return client;
}
