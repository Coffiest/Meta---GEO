"use client";

import { useState } from "react";
import type { AuthState } from "@/lib/useAuth";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6">
      <path
        fill="#EA4335"
        d="M12 5.04c1.62 0 3.06.56 4.2 1.66l3.12-3.12C17.4 1.8 14.9.75 12 .75 7.55.75 3.73 3.3 1.9 7.02l3.66 2.84C6.44 7.1 8.99 5.04 12 5.04Z"
      />
      <path
        fill="#4285F4"
        d="M23.25 12.26c0-.8-.07-1.57-.2-2.31H12v4.51h6.33c-.28 1.44-1.1 2.66-2.34 3.48l3.58 2.78c2.09-1.94 3.68-4.8 3.68-8.46Z"
      />
      <path
        fill="#FBBC05"
        d="M5.56 14.14a6.9 6.9 0 0 1 0-4.28L1.9 7.02a11.24 11.24 0 0 0 0 9.96l3.66-2.84Z"
      />
      <path
        fill="#34A853"
        d="M12 23.25c3.04 0 5.6-1 7.46-2.72l-3.58-2.78c-.99.67-2.28 1.06-3.88 1.06-3.01 0-5.56-2.06-6.44-4.82L1.9 16.98c1.83 3.72 5.65 6.27 10.1 6.27Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white">
      <path d="M16.98 12.83c.03 3.02 2.65 4.03 2.68 4.04-.02.07-.42 1.44-1.38 2.85-.83 1.22-1.7 2.43-3.06 2.46-1.34.02-1.77-.8-3.3-.8-1.53 0-2 .77-3.27.82-1.31.05-2.31-1.32-3.15-2.53C3.78 17.18 2.47 12.66 4.23 9.6c.88-1.53 2.44-2.5 4.14-2.52 1.29-.02 2.51.87 3.3.87.79 0 2.27-1.07 3.83-.92.65.03 2.48.26 3.66 1.99-.1.06-2.19 1.28-2.18 3.81ZM14.46 5.4c.7-.85 1.17-2.03 1.04-3.2-1.01.04-2.22.67-2.94 1.51-.65.75-1.21 1.95-1.06 3.1 1.12.09 2.26-.57 2.96-1.41Z" />
    </svg>
  );
}

type Mode = "login" | "signup" | "reset";

/** ログイン / 新規登録画面。参考デザイン(タイトル→ソーシャルログイン→メール/パスワード入力
 * →送信ボタン→下部リンク)を元に、実際に配線されている認証手段だけで構成している。
 * メール+パスワードでのログイン・新規登録はSupabase Authが別々のAPIを持つため、ここでは
 * ログイン/新規登録を見た目だけでなく実際に別の処理として扱う(以前のマジックリンク方式とは
 * 異なり、両モードは完全に別物)。 */
export function LoginScreen({ auth }: { auth: AuthState }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetFeedback = () => {
    setError(null);
    setInfo(null);
    auth.clearOauthError();
  };

  const goTo = (next: Mode) => {
    setMode(next);
    resetFeedback();
  };

  const handleSubmit = async () => {
    if (!email.trim()) return;
    if (mode !== "reset" && !password) return;

    setSubmitting(true);
    resetFeedback();

    if (mode === "login") {
      const { error } = await auth.signInWithPassword(email.trim(), password);
      if (error) setError(error);
    } else if (mode === "signup") {
      const { error, needsConfirmation } = await auth.signUpWithPassword(email.trim(), password);
      if (error) setError(error);
      else if (needsConfirmation) setInfo(`${email} 宛に確認メールを送りました。メール内のリンクを開くと登録が完了します。`);
    } else {
      const { error } = await auth.resetPassword(email.trim());
      if (error) setError(error);
      else setInfo(`${email} 宛にパスワード再設定用のリンクを送りました。`);
    }

    setSubmitting(false);
  };

  const title = mode === "login" ? "ログイン" : mode === "signup" ? "新規登録" : "パスワードの再設定";
  const submitLabel = mode === "login" ? "ログイン" : mode === "signup" ? "新規登録" : "リセットリンクを送る";

  return (
    <div className="min-h-screen flex flex-col items-center px-5 pt-14 pb-10 bg-white">
      <h1 className="text-2xl font-bold text-ink-950 mb-6">{title}</h1>

      <div className="w-full max-w-sm rounded-2xl border border-ink-300 p-6 space-y-5">
        {mode !== "reset" && (
          <>
            <div className="flex items-center justify-center gap-8">
              <button
                onClick={() => auth.signInWithGoogle()}
                className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
              >
                <span className="h-14 w-14 rounded-full border border-ink-300 flex items-center justify-center">
                  <GoogleIcon />
                </span>
                <span className="text-[12px] text-ink-800">Google</span>
              </button>
              <button
                onClick={() => auth.signInWithApple()}
                className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
              >
                <span className="h-14 w-14 rounded-full bg-ink-950 flex items-center justify-center">
                  <AppleIcon />
                </span>
                <span className="text-[12px] text-ink-800">Apple</span>
              </button>
            </div>

            <div className="h-px bg-ink-200" />
          </>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-ink-950 mb-1.5">メールアドレス</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !password && mode === "reset" && handleSubmit()}
              type="email"
              placeholder="mail@example.com"
              className="w-full rounded-lg border border-ink-300 px-3.5 py-2.5 text-sm text-ink-950 placeholder:text-ink-400 focus:outline-none focus:border-ink-950"
            />
          </div>

          {mode !== "reset" && (
            <div>
              <label className="block text-[13px] font-semibold text-ink-950 mb-1.5">パスワード</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                type="password"
                placeholder="8文字以上"
                className="w-full rounded-lg border border-ink-300 px-3.5 py-2.5 text-sm text-ink-950 placeholder:text-ink-400 focus:outline-none focus:border-ink-950"
              />
            </div>
          )}

          {mode === "login" && (
            <button onClick={() => goTo("reset")} className="text-[12px] text-ink-600 underline underline-offset-2">
              パスワードを忘れた方
            </button>
          )}
        </div>

        {auth.oauthError && (
          <p className="text-[12px] text-crimson-500">
            Google/Appleログインに失敗しました: {auth.oauthError}
          </p>
        )}
        {error && <p className="text-[12px] text-crimson-500">{error}</p>}
        {info && <p className="text-[12px] text-mint-700">{info}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !email.trim() || (mode !== "reset" && !password)}
          className="w-full rounded-lg bg-ink-950 text-white font-semibold py-3 active:scale-[0.98] transition-transform disabled:opacity-40"
        >
          {submitting ? "処理中…" : submitLabel}
        </button>
      </div>

      <div className="mt-6 text-[13px]">
        {mode === "login" && (
          <button onClick={() => goTo("signup")} className="text-ink-950 underline underline-offset-2">
            会員登録はこちら
          </button>
        )}
        {mode === "signup" && (
          <button onClick={() => goTo("login")} className="text-ink-950 underline underline-offset-2">
            ログインはこちら
          </button>
        )}
        {mode === "reset" && (
          <button onClick={() => goTo("login")} className="text-ink-950 underline underline-offset-2">
            ログイン画面に戻る
          </button>
        )}
      </div>
    </div>
  );
}
