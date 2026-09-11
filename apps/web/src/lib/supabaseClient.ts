"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * localStorageを安全に読み書きするストレージアダプタ。
 *
 * これを明示的に渡す理由: iOS等のスタンドアロンPWA(ホーム画面から起動したWebView)や
 * プライベートブラウズでは、Supabaseの内部ストレージ自動検出が localStorage を「使えない」と
 * 誤判定し、セッションをメモリ保存へフォールバックすることがある。メモリ保存だとアプリを閉じた
 * 瞬間にセッションが消え、「開くたびに毎回ログイン」を強いられる。
 * 明示的に localStorage を渡し、例外は握りつぶすことで、使える環境では必ず永続化させる。
 */
function createSafeLocalStorage() {
  return {
    getItem: (key: string): string | null => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key: string, value: string): void => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* プライベートブラウズ等で書き込み不可でもクラッシュさせない */
      }
    },
    removeItem: (key: string): void => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* 同上 */
      }
    },
  };
}

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
  // storageは明示的にlocalStorageを渡す(自動検出のメモリ保存フォールバックによる「毎回ログアウト」対策)。
  // storageKeyは既定のまま変更しない — 変えると既存ユーザーのセッションが全て無効になる。
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...(typeof window !== "undefined" ? { storage: createSafeLocalStorage() } : {}),
    },
  });
  return client;
}
