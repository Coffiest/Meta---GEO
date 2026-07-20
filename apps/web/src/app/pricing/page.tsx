"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { startCheckout, SubscriptionUnavailableError, useSubscriptionStatus, openBillingPortal } from "@/lib/subscription";

const FEATURES = [
  "棋譜解析を24時間の待ち時間なしで無制限に実行",
  "全アクションをGTO基準で採点するGTO精度スコア",
  "失ったEV(EVロス)の可視化とワースト・ベストのハイライト",
  "全ハンドを1手ずつ通し再生できるリプレイ",
];

export default function PricingPage() {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const { status } = useSubscriptionStatus(accessToken);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    if (!accessToken) {
      setError("ご登録にはログインが必要です。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await startCheckout(accessToken);
    } catch (e) {
      setSubmitting(false);
      if (e instanceof SubscriptionUnavailableError) {
        setError("決済は現在準備中です。まもなくご利用いただけます。");
      } else {
        setError("チェックアウトの開始に失敗しました。時間をおいて再度お試しください。");
      }
    }
  }

  async function handleManage() {
    if (!accessToken) return;
    try {
      await openBillingPortal(accessToken);
    } catch {
      setError("契約管理ページを開けませんでした。");
    }
  }

  const active = status?.active ?? false;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-md mx-auto px-4 pb-16">
        <header className="flex items-center justify-between pt-[calc(env(safe-area-inset-top)+16px)] pb-6">
          <div className="text-[11px] tracking-[0.25em] text-gold-600 font-semibold">POKER ART</div>
          <Link href="/" className="text-[12px] text-ink-600 hover:text-ink-900">
            戻る
          </Link>
        </header>

        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-gold-600">Subscription</p>
        <h1 className="mt-1 text-[26px] font-black leading-tight tracking-tight text-ink-950">
          棋譜解析 使い放題プラン<span className="text-gold-500">.</span>
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
          無料プランは24時間に1回まで。加入すると、トーナメントの棋譜解析を待ち時間なく無制限に実行できます。
        </p>

        <div className="mt-5 rounded-2xl border-2 border-gold-500 bg-white p-5 shadow-[0_10px_30px_-14px_rgba(242,169,0,0.5)]">
          <div className="flex items-baseline gap-1">
            <span className="text-[40px] font-black text-ink-950 tabular-nums leading-none">¥980</span>
            <span className="text-[13px] font-bold text-ink-500">/ 月(税込)</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-500">いつでも解約可能・日割り返金はありません。</p>

          <ul className="mt-5 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[13px] font-medium text-ink-800">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth={3} className="h-3 w-3">
                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {f}
              </li>
            ))}
          </ul>

          {active ? (
            <div className="mt-5">
              <div className="flex items-center justify-center gap-1.5 rounded-full bg-gold-500/10 py-2.5 text-[13px] font-black text-gold-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
                  <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                使い放題プランに加入中
              </div>
              <button
                onClick={handleManage}
                className="mt-2 w-full rounded-full border border-ink-950 py-3 text-[13px] font-bold text-ink-950 active:scale-[0.99] transition-transform"
              >
                契約を管理する
              </button>
            </div>
          ) : (
            <button
              onClick={handleSubscribe}
              disabled={submitting}
              className="mt-5 flex h-12 w-full items-center justify-center gap-1.5 rounded-full bg-gold-500 text-[14px] font-black text-ink-950 active:opacity-90 transition disabled:opacity-60"
            >
              {submitting ? (
                <span className="h-4 w-4 rounded-full border-2 border-ink-950 border-t-transparent animate-spin" />
              ) : (
                "使い放題プランに登録"
              )}
            </button>
          )}
          {error && <p className="mt-2 text-center text-[11px] font-bold text-crimson-500">{error}</p>}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-ink-500">
          決済はStripeを通じて安全に処理され、解約・支払い方法の変更はいつでも契約管理ページから行えます。
          本アプリはバーチャルチップ専用で、チップの購入・換金や実際の金銭を賭けることは一切できません。
        </p>
        <Link href="/legal/tokushoho" className="mt-2 inline-block text-[11px] text-ink-500 underline decoration-dotted underline-offset-2">
          特定商取引法に基づく表記
        </Link>
      </div>
    </div>
  );
}
