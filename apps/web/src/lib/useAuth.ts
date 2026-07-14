"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabaseClient";

export interface AuthState {
  /** Supabaseの環境変数が未設定の場合はfalse(ログイン機能そのものが使えない) */
  authAvailable: boolean;
  loading: boolean;
  session: Session | null;
  /** Google/AppleログインのコールバックURLにエラーが付いて戻ってきた場合のメッセージ */
  oauthError: string | null;
  clearOauthError: () => void;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
}

/** SupabaseのAuthエラーメッセージ(英語)を、画面にそのまま出せる日本語メッセージへ変換する。 */
function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "メールアドレスまたはパスワードが正しくありません";
  if (lower.includes("user already registered") || lower.includes("already registered"))
    return "このメールアドレスは既に登録されています。ログインをお試しください";
  if (lower.includes("email not confirmed")) return "メール認証が完了していません。届いた確認メールをご確認ください";
  if (lower.includes("password should be at least")) return "パスワードは6文字以上で入力してください";
  if (lower.includes("unable to validate email") || lower.includes("invalid email"))
    return "メールアドレスの形式が正しくありません";
  if (lower.includes("rate limit")) return "しばらく時間をおいてから再度お試しください";
  if (lower.includes("access_denied") || lower.includes("access denied"))
    return "ログインがキャンセルされました";
  if (lower.includes("database error") || lower.includes("unable to exchange") || lower.includes("server_error") || lower.includes("server error"))
    return "認証サーバーでエラーが発生しました。時間をおいて再度お試しいただくか、サポートまでご連絡ください";
  return "エラーが発生しました。しばらくしてから再度お試しください";
}

/**
 * Google/AppleのOAuthコールバック後にURLへ付与されるエラー情報(?error=...や#error=...)を読み取る。
 * PKCEフローではクエリ文字列、実装によってはハッシュフラグメントに載るため両方見る。
 */
function readOauthErrorFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const description = search.get("error_description") ?? hash.get("error_description");
  const code = search.get("error") ?? hash.get("error");
  if (!description && !code) return null;

  // 読み終えたらURLからエラー情報を消す(再読み込みのたびに同じエラーが出ないように)。
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, "", cleanUrl);

  return translateAuthError(description ?? code ?? "");
}

export function useAuth(): AuthState {
  const supabase = getSupabaseClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    setOauthError(readOauthErrorFromLocation());
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;

  return {
    authAvailable: Boolean(supabase),
    loading,
    session,
    oauthError,
    clearOauthError: () => setOauthError(null),
    signInWithPassword: async (email: string, password: string) => {
      if (!supabase) return { error: "認証機能が設定されていません" };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ? translateAuthError(error.message) : null };
    },
    signUpWithPassword: async (email: string, password: string) => {
      if (!supabase) return { error: "認証機能が設定されていません", needsConfirmation: false };
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
      if (error) return { error: translateAuthError(error.message), needsConfirmation: false };
      // メール確認が有効なプロジェクトでは、登録直後はまだセッションが発行されない
      // (確認メール内のリンクを踏んで初めてログイン状態になる)。
      return { error: null, needsConfirmation: !data.session };
    },
    resetPassword: async (email: string) => {
      if (!supabase) return { error: "認証機能が設定されていません" };
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      return { error: error ? translateAuthError(error.message) : null };
    },
    signInWithGoogle: async () => {
      if (!supabase) return;
      // prompt=select_account: ブラウザにログイン済みのGoogleセッションを黙って再利用させず、
      // 毎回アカウント選択画面を出す(別のGoogleアカウントでログインし直せるようにするため)。
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, queryParams: { prompt: "select_account" } },
      });
    },
    signInWithApple: async () => {
      if (!supabase) return;
      await supabase.auth.signInWithOAuth({ provider: "apple", options: { redirectTo } });
    },
    signOut: async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
    },
  };
}
