"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { startCheckout } from "@/lib/subscription";

const FEATURES = [
  "GEO戦略DB(レンジ分析)を無制限に閲覧",
  "プリフロップ全ポジション・全シナリオのレンジマトリクス",
  "アナリティクス(ポジション別統計・ハンド履歴の全件検索)",
  "今後追加される分析機能への優先アクセス",
];

export default function PricingPage() {
  const { session } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    if (!session) {
      setError("サブスクリプションの登録にはログインが必要です。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await startCheckout(session.access_token);
    } catch {
      setError("チェックアウトの開始に失敗しました。時間をおいて再度お試しください。");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-md mx-auto px-4 pb-16">
        <header className="flex items-center justify-between pt-[calc(env(safe-area-inset-top)+16px)] pb-6">
          <div className="text-[11px] tracking-[0.25em] text-gold-500 font-medium">GTO POKER</div>
          <Link href="/" className="text-[12px] text-ink-600 hover:text-ink-900">
            戻る
          </Link>
        </header>

        <h1 className="text-2xl font-bold text-ink-950 mb-2">GEO戦略DB サブスクリプション</h1>
        <p className="text-[13px] text-ink-700 leading-relaxed mb-6">
          全ハンド・全アクションを記録した実測データベースをもとに、GTO Wizard風のレンジ分析を無制限に利用できます。
        </p>

        <div className="rounded-2xl bg-ink-100 ring-1 ring-ink-400 p-5 mb-6">
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-3xl font-black text-ink-950">¥980</span>
            <span className="text-[13px] text-ink-600">/ 月(税込)</span>
          </div>
          <p className="text-[11px] text-ink-600 mb-4">いつでも解約可能。日割り返金はありません。</p>

          <ul className="space-y-2.5 mb-5">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[13px] text-ink-800">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4 shrink-0 mt-0.5 text-mint-500">
                  <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {f}
              </li>
            ))}
          </ul>

          <button
            onClick={handleSubscribe}
            disabled={submitting}
            className="w-full rounded-xl bg-gold-500 text-ink-950 font-semibold text-sm py-3 shadow-card disabled:opacity-60"
          >
            {submitting ? "処理中…" : "サブスクリプションに登録"}
          </button>
          {error && <p className="text-[11px] text-rose-500 mt-2 text-center">{error}</p>}
        </div>

        <p className="text-[11px] text-ink-600 leading-relaxed mb-2">
          無料プランでも1日{5}回までGEO戦略DBを閲覧できます。決済はStripeを通じて安全に処理され、解約・支払い方法の変更はいつでもマイページから行えます。
          バーチャルチップの購入・換金は一切扱っておらず、実際の金銭を賭けることはできません。
        </p>
        <Link href="/legal/tokushoho" className="text-[11px] text-ink-600 underline">
          特定商取引法に基づく表記
        </Link>
      </div>
    </div>
  );
}
