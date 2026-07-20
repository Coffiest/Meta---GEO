"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { startCheckout, SubscriptionUnavailableError } from "@/lib/subscription";

/**
 * 棋譜解析の無料枠(24時間ローリング1回)を使い切ったときに、モーダル総括の代わりに表示する
 * ペイウォール。ロックされた解析のチラ見せ → 使い放題プラン(¥980/月)の価値訴求 → 単一の
 * 強いCTA(Stripe Checkout)で加入導線を提示する。デザインは ink+gold・SVGアイコンのみ。
 */

const BENEFITS: { title: string; desc: string; icon: React.ReactNode }[] = [
  {
    title: "棋譜解析が使い放題",
    desc: "24時間の待ち時間なし。トーナメントを何度でも解析。",
    icon: (
      <path d="M4 12a8 8 0 1 1 8 8M4 12H2m2 0 3-3m-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    title: "GTO精度スコア & EVロス",
    desc: "全アクションをGTO基準で採点し、失ったEVを可視化。",
    icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    title: "ワースト・ベスト & 通し再生",
    desc: "痛恨のミスと会心の一手をハイライト。全ハンド1手ずつ再生。",
    icon: (
      <>
        <path d="M7 4h10v4.5a5 5 0 0 1-10 0V4Z" strokeLinejoin="round" />
        <path d="M12 13v4M9 21h6" strokeLinecap="round" />
      </>
    ),
  },
];

function nextFreeText(nextFreeAt: string | null): string | null {
  if (!nextFreeAt) return null;
  const ms = new Date(nextFreeAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `次の無料解析まで あと約${h}時間` : `次の無料解析まで あと約${Math.max(1, m)}分`;
}

export function ReviewPaywall({
  tournamentId,
  accessToken,
  nextFreeAt,
}: {
  tournamentId: string;
  accessToken: string | undefined;
  nextFreeAt: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onSubscribe = async () => {
    if (!accessToken) {
      setMsg("ご登録にはログインが必要です。");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await startCheckout(accessToken, tournamentId); // 成功時は Stripe へリダイレクト
    } catch (e) {
      setBusy(false);
      if (e instanceof SubscriptionUnavailableError) {
        setMsg("決済は現在準備中です。まもなくご利用いただけます。");
      } else {
        setMsg("チェックアウトを開始できませんでした。時間をおいてお試しください。");
      }
    }
  };

  const countdown = nextFreeText(nextFreeAt);

  return (
    <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
      {/* ロックされた解析のチラ見せ */}
      <motion.div
        variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
        className="relative overflow-hidden rounded-2xl border border-ink-950 bg-ink-950 p-5"
      >
        {/* 背面: ぼかしたスコアのプレビュー */}
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-between px-5 opacity-20 blur-[3px]">
          <span className="text-6xl font-black text-white tabular-nums">87%</span>
          <span className="text-right text-white">
            <span className="block text-[10px] font-bold uppercase tracking-widest">総ロスEV</span>
            <span className="block text-2xl font-black tabular-nums">−12.4bb</span>
          </span>
        </div>
        <div className="relative flex flex-col items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth={2.2} className="h-5 w-5">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
            </svg>
          </span>
          <p className="mt-3 text-[17px] font-black leading-tight text-white">
            このトーナメントの解析は<br />使い放題プランで開放
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-400">
            無料枠(24時間に1回)は使い切りました。
            {countdown ? `${countdown}。` : ""}
            <br />今すぐ全ハンドをGTO解析するには—
          </p>
        </div>
      </motion.div>

      {/* プランカード(ゴールド強調) */}
      <motion.div
        variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
        className="mt-3 rounded-2xl border-2 border-gold-500 bg-white p-4 shadow-[0_8px_28px_-12px_rgba(242,169,0,0.5)]"
      >
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-600">使い放題プラン</p>
            <p className="mt-0.5 text-[13px] font-bold text-ink-950">棋譜解析 無制限</p>
          </div>
          <p className="text-ink-950">
            <span className="text-[34px] font-black tabular-nums leading-none">¥980</span>
            <span className="ml-1 text-[12px] font-bold text-ink-500">/月</span>
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {BENEFITS.map((b) => (
            <motion.div
              key={b.title}
              variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
              className="flex items-start gap-3"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink-950">
                <svg viewBox="0 0 24 24" fill="none" stroke="#f7c548" strokeWidth={2} className="h-4 w-4">
                  {b.icon}
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-black text-ink-950 leading-tight">{b.title}</p>
                <p className="text-[11px] leading-snug text-ink-500">{b.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.button
          variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
          whileTap={{ scale: 0.98 }}
          onClick={onSubscribe}
          disabled={busy}
          className="mt-4 flex h-12 w-full items-center justify-center gap-1.5 rounded-full bg-gold-500 text-[14px] font-black text-ink-950 active:opacity-90 disabled:opacity-60"
        >
          {busy ? (
            <span className="h-4 w-4 rounded-full border-2 border-ink-950 border-t-transparent animate-spin" />
          ) : (
            <>
              使い放題プランに登録
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-4 w-4">
                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </motion.button>

        {msg && <p className="mt-2 text-center text-[11px] font-bold text-crimson-500">{msg}</p>}

        <p className="mt-3 text-center text-[10px] leading-relaxed text-ink-400">
          いつでも解約可能・クレジットカード決済(Stripe)
          <br />
          <Link href="/legal/tokushoho" className="underline decoration-dotted underline-offset-2 hover:text-ink-600">
            特定商取引法に基づく表記
          </Link>
        </p>
      </motion.div>
    </motion.div>
  );
}
