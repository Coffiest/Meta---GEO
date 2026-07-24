"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabaseClient";
import { isStandalonePwa } from "./pwa";

export interface AuthState {
  /** Supabaseの環境変数が未設定の場合はfalse(ログイン機能そのものが使えない) */
  authAvailable: boolean;
  loading: boolean;
  session: Session | null;
  /** Google/AppleログインのコールバックURLにエラーが付いて戻ってきた場合のメッセージ */
  oauthError: string | null;
  /** oauthErrorの元になった、Supabase/Googleが返した生のエラー文字列(原因特定用) */
  oauthErrorRaw: string | null;
  clearOauthError: () => void;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  /** 確認メールの再送(新規登録後にメールが届かない場合)。 */
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * スタンドアロンPWAのシート型OAuthログインで、認証用シート(window.open)自身に付けるマーカーの
 * sessionStorageキー。シートのタブにのみ存在し、認証プロバイダを経由して戻ってきても保持される。
 * page.tsx はこれを見て、シートにはアプリ本体ではなく「ログイン完了・閉じて戻る」画面を表示する。
 */
export const AUTH_SHEET_MARKER = "pokerart-auth-sheet";

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
function readOauthErrorFromLocation(): { translated: string; raw: string } | null {
  if (typeof window === "undefined") return null;
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const description = search.get("error_description") ?? hash.get("error_description");
  const code = search.get("error") ?? hash.get("error");
  if (!description && !code) return null;

  // 読み終えたらURLからエラー情報を消す(再読み込みのたびに同じエラーが出ないように)。
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, "", cleanUrl);

  const raw = description ?? code ?? "";
  return { translated: translateAuthError(raw), raw };
}

export function useAuth(): AuthState {
  const supabase = getSupabaseClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthErrorRaw, setOauthErrorRaw] = useState<string | null>(null);

  useEffect(() => {
    const result = readOauthErrorFromLocation();
    setOauthError(result?.translated ?? null);
    setOauthErrorRaw(result?.raw ?? null);
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

  // スタンドアロンPWAのシート型ログイン(下のoauthSignIn参照)では、認証はアプリ内シートで
  // 完了し、セッションは同一オリジンのlocalStorageに書かれる。本体ウィンドウ側はここで
  // フォーカス復帰・storageイベントを合図にセッションを拾い直し、ログイン状態へ遷移する。
  useEffect(() => {
    if (!supabase) return;
    const refresh = () => {
      supabase.auth.getSession().then(({ data }) => {
        // nullで上書きしない(サインアウトはonAuthStateChangeが正しく反映する)。
        if (data.session) setSession(data.session);
      });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase]);

  const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;

  /**
   * Google/AppleのOAuthログイン。
   *
   * 通常ブラウザ: 従来どおり同一ウィンドウのフルリダイレクト(実績ある挙動を変えない)。
   *
   * スタンドアロンPWA(ホーム画面起動): 本体ウィンドウを遷移させると、特にAppleの認証ページが
   * コンテキストをSafari本体へハンドオフしてしまい、以後「ブラウザのUI付き」でアプリを使う羽目に
   * なる致命的な問題があった(iOSはPWAとSafariのストレージが別なので、セッションもPWAに入らない)。
   * そこで本体は一切遷移させず、認証はアプリ内シート(window.open)で行う。シートはPWAと同一
   * オリジン・同一ストレージのため、認証完了時にセッションがlocalStorageへ保存され、本体は上の
   * フォーカス/storage監視で自動的にログイン状態になる。
   *
   * シートの識別は2重化している:
   *  1. シートを開いた直後(about:blank=同一オリジンのうち)に、シート自身の sessionStorage へ
   *     マーカーを書き込む。sessionStorage はタブ単位で保持されるため、Apple/Supabase を経由して
   *     このオリジンへ戻ってきてもマーカーが残り、page.tsx が確実に「閉じて戻る」画面を出せる。
   *     (SupabaseのリダイレクトURL許可リスト照合でクエリが剥がされても機能する、設定非依存の主経路)
   *  2. redirectTo の ?authdone=1(許可リストが許す場合の補助経路)。
   */
  const oauthSignIn = async (provider: "google" | "apple", queryParams?: Record<string, string>) => {
    if (!supabase || !redirectTo) return;
    const baseOptions = queryParams ? { redirectTo, queryParams } : { redirectTo };
    if (!isStandalonePwa()) {
      await supabase.auth.signInWithOAuth({ provider, options: baseOptions });
      return;
    }
    // タップ直後の同期処理でシートを開く(非同期後のwindow.openはポップアップブロックされうる)。
    let sheet: Window | null = null;
    try {
      sheet = window.open("", "_blank");
      // about:blankは本体と同一オリジン扱いのため、この時点ならシートのsessionStorageへ書き込める。
      sheet?.sessionStorage.setItem(AUTH_SHEET_MARKER, "1");
    } catch {
      /* マーカーを書けなくても ?authdone=1 の補助経路が残る */
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { ...baseOptions, redirectTo: `${redirectTo}/?authdone=1`, skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      try {
        sheet?.close();
      } catch {
        /* noop */
      }
      // URLが作れなかった場合は従来のリダイレクトにフォールバック(ログイン不能よりはるかに良い)。
      await supabase.auth.signInWithOAuth({ provider, options: baseOptions });
      return;
    }
    if (sheet) {
      try {
        sheet.location.href = data.url;
        return;
      } catch {
        /* シートへの書き込みに失敗したら下のフォールバックへ */
      }
    }
    // シートを開けない環境ではやむを得ず従来のフルリダイレクト。
    window.location.assign(data.url);
  };

  return {
    authAvailable: Boolean(supabase),
    loading,
    session,
    oauthError,
    oauthErrorRaw,
    clearOauthError: () => {
      setOauthError(null);
      setOauthErrorRaw(null);
    },
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
    resendConfirmation: async (email: string) => {
      if (!supabase) return { error: "認証機能が設定されていません" };
      const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } });
      return { error: error ? translateAuthError(error.message) : null };
    },
    resetPassword: async (email: string) => {
      if (!supabase) return { error: "認証機能が設定されていません" };
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      return { error: error ? translateAuthError(error.message) : null };
    },
    signInWithGoogle: async () => {
      // prompt=select_account: ブラウザにログイン済みのGoogleセッションを黙って再利用させず、
      // 毎回アカウント選択画面を出す(別のGoogleアカウントでログインし直せるようにするため)。
      await oauthSignIn("google", { prompt: "select_account" });
    },
    signInWithApple: async () => {
      await oauthSignIn("apple");
    },
    signOut: async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
    },
  };
}
