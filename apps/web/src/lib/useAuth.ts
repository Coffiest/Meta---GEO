"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient, readStoredSession } from "./supabaseClient";
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

function generateTransferCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

/**
 * Sign in with Apple の Services ID(Supabase の Apple プロバイダに設定しているものと同じ公開値)。
 * これが設定されている場合、スタンドアロンPWAでのAppleログインは「Apple公式JSのポップアップ +
 * IDトークン直接連携(signInWithIdToken)」で行う。リダイレクトが一切発生しないため、
 * ブラウザUIへの遷移・Safariへのハンドオフが構造的に起こり得ない最良の方式。
 * 未設定の場合はアプリ内シート方式(oauthSignIn)へフォールバックする。
 * 有効化には Apple Developer Console 側で、この Services ID にアプリのドメインと
 * Return URL(オリジン)が登録されている必要がある。
 */
const APPLE_SERVICES_ID = process.env["NEXT_PUBLIC_APPLE_SERVICES_ID"];

interface AppleIdAuthApi {
  auth: {
    init: (config: { clientId: string; scope: string; redirectURI: string; usePopup: boolean }) => void;
    signIn: () => Promise<{ authorization?: { id_token?: string } }>;
  };
}

let appleJsLoader: Promise<AppleIdAuthApi | null> | null = null;

/**
 * Apple公式JSポップアップが一度でも(キャンセル以外で)失敗したら、このセッション中は
 * 以後シート方式に切り替えるフラグ。失敗直後の自動フォールバックはタップ由来のジェスチャが
 * 切れていて window.open が失敗しがちなので、次のタップから最初からシート方式で開かせる。
 */
let appleJsPopupDisabled = false;

/** Apple公式のSign in with Apple JSを一度だけ読み込む。失敗時はnull(呼び出し側でフォールバック)。 */
function loadAppleJs(): Promise<AppleIdAuthApi | null> {
  if (appleJsLoader) return appleJsLoader;
  appleJsLoader = new Promise((resolve) => {
    const existing = (window as unknown as { AppleID?: AppleIdAuthApi }).AppleID;
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/ja_JP/appleid.auth.js";
    script.async = true;
    script.onload = () => resolve((window as unknown as { AppleID?: AppleIdAuthApi }).AppleID ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return appleJsLoader;
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
  // シート型ログイン開始時にインクリメントし、受け渡しポーリングのeffectを再起動させる。
  const [transferNonce, setTransferNonce] = useState(0);

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
  }, [supabase, session, transferNonce]);

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
    // シート→本体のセッション受け渡し用ワンタイムコードを発行し、本体側で記録(ポーリング用)。
    const transferCode = generateTransferCode();
    try {
      window.localStorage.setItem(AUTH_TRANSFER_CODE_KEY, JSON.stringify({ code: transferCode, ts: Date.now() }));
    } catch {
      /* 書けない環境でも同一パーティションならstorage共有経路でログインできる */
    }
    setTransferNonce((n) => n + 1);

    // タップ直後の同期処理でシートを開く(非同期後のwindow.openはポップアップブロックされうる)。
    let sheet: Window | null = null;
    try {
      sheet = window.open("", "_blank");
      // about:blankは本体と同一オリジン扱いのため、この時点ならシートのsessionStorageへ書き込める。
      // sessionStorageはタブ固有なので、ストレージパーティションが分離していても保持される。
      sheet?.sessionStorage.setItem(AUTH_SHEET_MARKER, "1");
      sheet?.sessionStorage.setItem(AUTH_TRANSFER_CODE_KEY, transferCode);
    } catch {
      /* マーカーを書けなくても ?authdone=1&t= の補助経路が残る */
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        ...baseOptions,
        redirectTo: `${redirectTo}/?authdone=1&t=${transferCode}`,
        skipBrowserRedirect: true,
      },
    });
    if (!error && data?.url && sheet) {
      try {
        sheet.location.href = data.url;
        return;
      } catch {
        /* シートへの書き込みに失敗 → 下のエラー表示へ */
      }
    }
    try {
      sheet?.close();
    } catch {
      /* noop */
    }
    // 【重要】スタンドアロンPWAでは、いかなる場合も本体ウィンドウをリダイレクトしない。
    // 以前はここで window.location.assign にフォールバックしていたが、それが本体ごと
    // Safariへハンドオフされる致命バグ(ブラウザUI付きでアプリを使う羽目になる)の再発経路だった。
    // シートを開けなかった場合(ポップアップ失敗直後の自動再試行でタップ由来のジェスチャが
    // 切れているケース等)は、もう一度タップしてもらえば新しいジェスチャでシートが開ける。
    setOauthError("ログイン画面を開けませんでした。もう一度「Appleでログイン」または「Google」をタップしてください。");
    setOauthErrorRaw(error?.message ?? "sheet_open_failed");
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
      // スタンドアロンPWAでは、可能ならリダイレクト皆無のApple公式JSポップアップ方式を最優先で使う。
      // ポップアップはIDトークンをpostMessageで返して自動で閉じ、着地ページ自体が存在しないため、
      // ブラウザUIに取り残される余地が構造的に無い。失敗時は従来のシート方式へフォールバック。
      if (supabase && redirectTo && APPLE_SERVICES_ID && !appleJsPopupDisabled && isStandalonePwa()) {
        try {
          const appleId = await loadAppleJs();
          if (appleId) {
            appleId.auth.init({
              clientId: APPLE_SERVICES_ID,
              scope: "name email",
              redirectURI: redirectTo,
              usePopup: true,
            });
            const result = await appleId.auth.signIn();
            const idToken = result?.authorization?.id_token;
            if (idToken) {
              const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: idToken });
              if (!error) return; // セッション確立(onAuthStateChangeが反映する)
              console.error("[auth] signInWithIdToken failed, falling back:", error.message);
              appleJsPopupDisabled = true;
              setOauthErrorRaw(`signInWithIdToken: ${error.message}`);
            }
          }
        } catch (err) {
          // ユーザーによるキャンセルもここに来る。キャンセルはフォールバックせず静かに終了する。
          const message = err instanceof Error ? err.message : JSON.stringify(err);
          if (/popup_closed|user_cancelled|user_trigger_new_signin|canceled|cancelled/i.test(message)) return;
          console.error("[auth] Apple JS popup failed, falling back to sheet flow:", err);
          // 以後このセッションではシート方式を使う。原因特定できるよう生エラーは「詳細」から見られるようにする。
          appleJsPopupDisabled = true;
          setOauthErrorRaw(`AppleJS: ${message}`);
        }
      }
      await oauthSignIn("apple");
    },
    signOut: async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
    },
  };
}
