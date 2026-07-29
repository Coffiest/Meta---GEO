"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient, readStoredSession } from "./supabaseClient";

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

/**
 * シート→本体のセッション受け渡し用ワンタイムコード。
 * - シート側: sessionStorageのこのキーにコードが入る(シートを開いた瞬間に本体が書き込む)
 * - 本体側: localStorageのこのキーに {code, ts} が入る(ポーリングの再開にも使う)
 *
 * iOSのスタンドアロンPWAでは、シート(window.open)のストレージが本体と共有されない
 * パーティション分離が起こりうる。その場合localStorage経由のセッション共有は機能しないため、
 * シートが認証完了後にサーバー(/api/lobby/session-transfer)へトークンを預け、
 * 本体がこのコードでポーリング受領してセッションを確立する。
 */
export const AUTH_TRANSFER_CODE_KEY = "pokerart-auth-transfer";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";
const TRANSFER_MAX_AGE_MS = 3 * 60 * 1000;

function readPendingTransfer(): { code: string; ts: number } | null {
  try {
    const raw = window.localStorage.getItem(AUTH_TRANSFER_CODE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code?: string; ts?: number };
    if (typeof parsed.code !== "string" || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > TRANSFER_MAX_AGE_MS) return null;
    return { code: parsed.code, ts: parsed.ts };
  } catch {
    return null;
  }
}

function clearPendingTransfer(): void {
  try {
    window.localStorage.removeItem(AUTH_TRANSFER_CODE_KEY);
  } catch {
    /* noop */
  }
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

    // --- 楽観復元(「一度ログインしたらログアウトまでログイン済み」挙動の要) ---
    // getSession() はアクセストークン失効時にネットワーク越しの更新を待ち、その更新が
    // 一時的に失敗しただけでもセッションnullを返すため、従来は「保存済みセッションがあるのに
    // 起動のたびにログイン画面」が起きえた。ここでは保存値を同期的に読み、あれば即ログイン
    // 状態で起動する。トークン更新は裏で走り、失敗が確定的(ストレージからも消された)な場合
    // だけログアウト扱いにする。
    const isOauthCallback =
      /[?#&](code|access_token|error)=/.test(window.location.search + window.location.hash);
    const stored = readStoredSession();
    let loadingCap: ReturnType<typeof setTimeout> | null = null;
    if (stored && !isOauthCallback) {
      setSession(stored);
      // アクセストークンがまだ有効なら待ち時間ゼロでホームへ。失効していれば裏の更新完了まで
      // 少しだけローディングを維持する(失効トークンでAPIを叩いて一瞬エラー画面が出るのを防ぐ)。
      // ただし更新が遅い(リトライ中など)場合に待たせ続けないよう、最大4秒で必ず画面を開く。
      const expiresAtMs = (stored.expires_at ?? 0) * 1000;
      if (expiresAtMs > Date.now() + 10_000) setLoading(false);
      else loadingCap = setTimeout(() => setLoading(false), 4000);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session);
      } else if (!readStoredSession()) {
        // ストレージにも無い=本当に未ログイン(またはトークン無効化で削除済み)。
        // 一時的なネットワーク失敗ではストレージが残るため、その場合は楽観セッションを維持し、
        // autoRefreshTokenの再試行・フォーカス時の再取得で自然に回復させる。
        setSession(null);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (newSession) {
        setSession(newSession);
      } else if (event === "SIGNED_OUT") {
        // 明示的なログアウト/トークン無効化のみログイン画面へ。それ以外のnull(初期化中の
        // INITIAL_SESSION等)で楽観復元済みセッションを消さない。
        setSession(null);
      }
    });
    return () => {
      listener.subscription.unsubscribe();
      if (loadingCap) clearTimeout(loadingCap);
    };
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

  // シートで完了したログインをサーバー経由で受け取るポーリング。
  // 未ログインかつ受け渡しコードが有効な間だけ回る(ログイン確立・期限切れで自動停止)。
  // アプリをタスキルして開き直した場合も、localStorageのコードが生きていれば再開する。
  useEffect(() => {
    if (!supabase || session) {
      if (session) clearPendingTransfer();
      return;
    }
    const pending = readPendingTransfer();
    if (!pending) return;
    let stopped = false;
    const claim = async () => {
      if (stopped) return;
      try {
        const r = await fetch(`${SERVER_URL}/api/lobby/session-transfer?code=${pending.code}`);
        if (!r.ok) return;
        const t = (await r.json()) as { access_token?: string; refresh_token?: string };
        if (!t.access_token || !t.refresh_token) return;
        stopped = true;
        clearInterval(interval);
        clearPendingTransfer();
        // 受け取ったトークンで本体のセッションを確立(以後は本体のlocalStorageに永続化され、
        // 「ログアウトするまでログイン済み」の楽観復元の対象になる)。
        const { error } = await supabase.auth.setSession({
          access_token: t.access_token,
          refresh_token: t.refresh_token,
        });
        if (error) console.error("[auth] session-transfer setSession failed:", error.message);
      } catch {
        /* サーバー未応答等は次のポーリングで再試行 */
      }
    };
    const interval = setInterval(() => void claim(), 2000);
    void claim();
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [supabase, session]);

  const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;

  /**
   * Google/AppleのOAuthログイン。
   *
   * 【方式について】全コンテキスト共通の「同一ウィンドウ・フルリダイレクト」(v2.83まで長期間
   * 実績のあった方式)に統一している。スタンドアロンPWA向けに試した代替方式は、いずれもiOSの
   * 実機で致命的に失敗したため使わない:
   *  - Apple公式JSポップアップ: 完了通知(web_message)が本体へ届かず、Appleネイティブシートが
   *    「登録を完了できませんでした」で毎回失敗しログイン不能になる。
   *  - アプリ内シート(window.open)+セッション受け渡し: iOSのストレージパーティション分離で
   *    シートへの目印が届かず、SupabaseのリダイレクトURL照合でクエリも剥がされるため、
   *    シートにアプリ本体が表示されてしまい受け渡しが成立しない。
   * フルリダイレクトは認証後にブラウザUI付きのコンテキストへ着地することがあるが、
   * 「確実にログインできる」ことを最優先する。
   */
  const oauthSignIn = async (provider: "google" | "apple", queryParams?: Record<string, string>) => {
    if (!supabase || !redirectTo) return;
    const baseOptions = queryParams ? { redirectTo, queryParams } : { redirectTo };
    await supabase.auth.signInWithOAuth({ provider, options: baseOptions });
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
      // 【重要】Apple公式JSポップアップ(signInWithIdToken)方式は使わない。
      // iOSのスタンドアロンPWAでは、ポップアップからの完了通知(web_message)が本体へ届かず、
      // Appleのネイティブシートが「登録を完了できませんでした」で必ず失敗し、ユーザーが
      // ログイン不能に陥る事故が実機で確認された(ドメイン登録の有無に関わらず発生)。
      // Appleログインはシート方式+サーバー経由セッション受け渡し(oauthSignIn)に一本化する。
      await oauthSignIn("apple");
    },
    signOut: async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
    },
  };
}
