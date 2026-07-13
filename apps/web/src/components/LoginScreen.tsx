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

type Mode = "login" | "signup";

/**
 * ログイン / 新規登録画面。Supabase Authはサインアップとログインを区別しない(存在しなければ
 * 自動作成)ため、実際の認証手段(Apple/Google/メールリンク)はどちらのモードでも全く同じだが、
 * UI上は見出し・ボタン文言・下部リンクだけをモードに応じて出し分け、通常のログイン/新規登録
 * 二画面フローに見えるようにしてある。
 */
export function LoginScreen({ auth }: { auth: AuthState }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const isLogin = mode === "login";

  const switchMode = () => {
    setMode(isLogin ? "signup" : "login");
    setSent(false);
    setError(null);
  };

  const handleSendLink = async () => {
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    const { error } = await auth.sendMagicLink(email.trim());
    setSending(false);
    if (error) setError(error);
    else setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-ink-100">
      <div className="w-full max-w-sm rounded-[28px] bg-white ring-[1.5px] ring-ink-950 overflow-hidden">
        {/* ヒーロー部: 北欧風デザインの黒地+波カーブをごく一部だけ引用。下端をborder-radiusの
            楕円カーブ(50% 28px)で一峰の波型に切る(SVGの絶対配置による重ね合わせより
            確実に描画できる)。 */}
        <div
          className="bg-ink-950 pt-8 pb-11 px-6 text-center"
          style={{ borderBottomLeftRadius: "50% 28px", borderBottomRightRadius: "50% 28px" }}
        >
          <div className="flex items-center justify-center gap-1.5 mb-3">
            <span className="rounded-md border border-white/40 px-1.5 py-0.5 text-[12px] font-black text-white">A♠</span>
            <span className="rounded-md border border-white/40 px-1.5 py-0.5 text-[12px] font-black text-white">R♥</span>
          </div>
          <h1 className="text-[26px] font-black text-white tracking-tight">{isLogin ? "ログイン" : "新規登録"}</h1>
          <p className="text-[12px] text-white/60 mt-1">バーチャルチップ専用。実際の金銭のやり取りはありません。</p>
        </div>

        <div className="px-6 pt-8 pb-7 space-y-5">
          <div>
            <p className="text-[11px] font-bold text-ink-600 text-center mb-3 tracking-wide">
              {isLogin ? "アカウントで続ける" : "アカウントを作成"}
            </p>
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => auth.signInWithApple()}
                className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
              >
                <span className="h-14 w-14 rounded-full bg-ink-950 flex items-center justify-center">
                  <AppleIcon />
                </span>
                <span className="text-[11px] font-semibold text-ink-800">Apple</span>
              </button>
              <button
                onClick={() => auth.signInWithGoogle()}
                className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
              >
                <span className="h-14 w-14 rounded-full bg-white border border-ink-950 flex items-center justify-center">
                  <GoogleIcon />
                </span>
                <span className="text-[11px] font-semibold text-ink-800">Google</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-ink-300" />
            <span className="text-[11px] text-ink-500 shrink-0">または メールで続ける</span>
            <div className="h-px flex-1 bg-ink-300" />
          </div>

          {sent ? (
            <div className="rounded-xl bg-ink-100 border border-ink-300 px-4 py-4 text-sm text-ink-850 text-center">
              <span className="font-semibold text-ink-950">{email}</span> 宛に{isLogin ? "ログイン" : "登録"}リンクを送りました。
              メール内のリンクを開くと{isLogin ? "ログイン" : "登録"}できます。
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[12px] font-bold text-ink-800 mb-1.5">メールアドレス</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendLink()}
                  type="email"
                  placeholder="mail@example.com"
                  className="w-full rounded-xl bg-white border border-ink-300 px-4 py-3 text-sm text-ink-950 placeholder:text-ink-400 focus:outline-none focus:border-ink-950"
                />
              </div>
              {error && <p className="text-xs text-crimson-500 px-1">{error}</p>}
              <button
                onClick={handleSendLink}
                disabled={sending || !email.trim()}
                className="w-full rounded-xl bg-ink-950 text-white font-semibold py-3.5 active:scale-[0.98] transition-transform disabled:opacity-40"
              >
                {sending ? "送信中…" : isLogin ? "ログインリンクを送る" : "登録リンクを送る"}
              </button>
            </>
          )}

          <p className="text-[10px] text-ink-500 text-center leading-relaxed">
            同じメールアドレスのApple/Googleアカウントは、同じプレイヤーアカウントとして扱われます。
          </p>

          <p className="text-center text-[13px] pt-1">
            <button onClick={switchMode} className="text-ink-950 font-semibold underline decoration-dashed underline-offset-4">
              {isLogin ? "アカウントをお持ちでない方はこちら" : "すでにアカウントをお持ちの方はこちら"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
