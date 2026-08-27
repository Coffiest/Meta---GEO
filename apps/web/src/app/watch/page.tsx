"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { APP_VERSION } from "@/lib/version";
import { Icon } from "@/components/Icon";
import { PROD_URL, shareOrTweet } from "@/lib/share";

/**
 * 観戦(配信者)ページ。ログイン不要で「いま何人が戦っているのか」が見られる。
 * 配信画面にそのまま出せること、視聴者がワンタップで参加へ回れることが目的。
 *
 * ホールカードや進行中のアクションは一切表示しない(サーバー側も返さない)。
 * 覗き見による不正の余地を作らないための、意図的な設計。
 */

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";
const POLL_INTERVAL_MS = 10_000;

interface LiveStatus {
  remaining: number;
  total: number;
  averageStack: number;
  bigBlind: number;
  isFinalTable: boolean;
  prizePoolTotal: number;
  chipLeader: { displayName: string; bbStack: number } | null;
  updatedAt: number;
}

function XLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <Icon name="logo-x" className={className} />
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3.5">
      <p className="text-[10px] font-bold tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-[26px] font-black leading-none tabular-nums text-ink-950">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-ink-500">{sub}</p>}
    </div>
  );
}

export default function WatchPage() {
  const { t } = useI18n();
  const [live, setLive] = useState<LiveStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetch(`${SERVER_URL}/api/lobby/live`)
        .then((res) => (res.ok ? (res.json() as Promise<{ live: LiveStatus | null }>) : null))
        .then((json) => {
          if (cancelled) return;
          setLive(json?.live ?? null);
          setLoaded(true);
        })
        .catch(() => {
          if (!cancelled) setLoaded(true);
        });
    };
    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  /** 観戦ページを共有する。端末の共有シートを優先し、使えなければXへ落とす(share.ts に集約)。 */
  async function handleShare() {
    const text = live
      ? t("watch.shareTextLive", { remaining: live.remaining, total: live.total })
      : t("watch.shareText");
    await shareOrTweet({
      text,
      url: `${PROD_URL}/watch`,
      surface: "result",
      hashtags: ["ポーカーアート", "ポーカー"],
    });
  }

  return (
    <div className="min-h-screen bg-ink-50 text-ink-950">
      <div className="mx-auto w-full max-w-2xl px-6 pb-16 pt-[calc(env(safe-area-inset-top)+28px)]">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-gold-500" />
          <span className="text-[13px] font-extrabold uppercase tracking-[0.22em]">Poker ART</span>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-ink-400">{t("watch.eyebrow")}</p>
          {live && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-crimson-500 px-2.5 py-1 text-[10px] font-black text-white">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
              </span>
              {t("watch.liveBadge")}
            </span>
          )}
        </div>
        <h1 className="mt-2 text-[34px] font-black leading-[1.08] tracking-tight">
          {live ? t("watch.titleLive") : t("watch.titleIdle")}
          <span className="text-gold-500">.</span>
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-600">
          {live ? t("watch.leadLive") : t("watch.leadIdle")}
        </p>

        {!loaded ? (
          <div className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-ink-200 bg-white p-10 text-sm text-ink-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-950 border-t-transparent" />
            {t("watch.loading")}
          </div>
        ) : live ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 space-y-3"
          >
            {live.isFinalTable && (
              <div className="rounded-2xl border-[1.5px] border-gold-500 bg-gold-500/10 px-4 py-3 text-center text-[13px] font-black text-ink-950">
                {t("watch.finalTable")}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label={t("watch.remaining")}
                value={`${live.remaining}`}
                sub={t("watch.ofEntrants", { total: live.total })}
              />
              <Stat label={t("watch.averageStack")} value={live.averageStack.toLocaleString()} />
              <Stat label={t("watch.bigBlind")} value={live.bigBlind.toLocaleString()} />
              <Stat label={t("watch.prizePool")} value={live.prizePoolTotal.toLocaleString()} />
            </div>
            {live.chipLeader && (
              <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3.5">
                <p className="text-[10px] font-bold tracking-wide text-ink-500">{t("watch.chipLeader")}</p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="truncate text-[19px] font-black tracking-tight text-ink-950">
                    {live.chipLeader.displayName}
                  </span>
                  <span className="shrink-0 text-[13px] font-bold tabular-nums text-gold-600">
                    {live.chipLeader.bbStack.toLocaleString()} BB
                  </span>
                </p>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="mt-7 rounded-2xl border border-ink-200 bg-white px-5 py-8 text-center">
            <p className="text-[14px] font-bold text-ink-800">{t("watch.idleTitle")}</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-500">{t("watch.idleBody")}</p>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Link
            href="/"
            className="flex items-center justify-center rounded-xl bg-gold-500 py-3.5 text-[13px] font-black text-ink-950 transition-transform active:scale-[0.98]"
          >
            {t("watch.join")}
          </Link>
          <button
            onClick={() => void handleShare()}
            className="flex items-center justify-center gap-2 rounded-xl bg-ink-950 py-3.5 text-[13px] font-black text-white transition-transform active:scale-[0.98]"
          >
            <XLogo className="h-[15px] w-[15px]" />
            {t("watch.share")}
          </button>
        </div>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-ink-400">{t("watch.fairnessNote")}</p>
        <p className="mt-4 text-center text-[11px] tracking-wide text-ink-400">
          Poker ART v{APP_VERSION} ・ © 2026 Poker ART
        </p>
      </div>
    </div>
  );
}
