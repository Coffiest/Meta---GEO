"use client";

import { useState } from "react";
import type { AuthState } from "@/lib/useAuth";

export function LoginScreen({ auth }: { auth: AuthState }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-8 bg-navy-950">
      <div className="text-center space-y-2">
        <div className="text-[13px] tracking-[0.3em] text-mint-500 font-medium">TEN FOUR POKER</div>
        <h1 className="text-2xl font-semibold text-navy-50">ログイン</h1>
        <p className="text-sm text-navy-400 max-w-xs mx-auto">
          バーチャルチップのみで遊べるトーナメントです。実際の金銭のやり取りはありません。
        </p>
      </div>

      <div className="w-full max-w-xs space-y-3">
        {sent ? (
          <div className="rounded-xl bg-navy-900 ring-1 ring-navy-700 px-4 py-4 text-sm text-navy-200 text-center">
            <span className="font-medium text-mint-400">{email}</span> 宛にログインリンクを送りました。
            メール内のリンクを開くとログインできます。
          </div>
        ) : (
          <>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendLink()}
              type="email"
              placeholder="メールアドレス"
              className="w-full rounded-xl bg-navy-900 ring-1 ring-navy-700 px-4 py-3 text-sm text-navy-50 placeholder:text-navy-500 focus:outline-none focus:ring-mint-500"
            />
            {error && <p className="text-xs text-crimson-400 px-1">{error}</p>}
            <button
              onClick={handleSendLink}
              disabled={sending || !email.trim()}
              className="w-full rounded-xl bg-mint-500 text-white font-semibold py-3 shadow-card active:scale-[0.98] transition-transform disabled:opacity-40"
            >
              {sending ? "送信中…" : "メールでログイン"}
            </button>
          </>
        )}

        <div className="flex items-center gap-3 py-1">
          <div className="h-px flex-1 bg-navy-700" />
          <span className="text-[11px] text-navy-500">または</span>
          <div className="h-px flex-1 bg-navy-700" />
        </div>

        <button
          onClick={() => auth.signInWithGoogle()}
          className="w-full rounded-xl bg-navy-900 ring-1 ring-navy-700 text-navy-100 font-medium py-3 active:scale-[0.98] transition-transform"
        >
          Googleでログイン
        </button>
        <button
          onClick={() => auth.signInWithApple()}
          className="w-full rounded-xl bg-navy-900 ring-1 ring-navy-700 text-navy-100 font-medium py-3 active:scale-[0.98] transition-transform"
        >
          Appleでログイン
        </button>
      </div>
    </div>
  );
}
