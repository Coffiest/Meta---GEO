"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import type { GameKey } from "@/lib/socket";

/**
 * プライムタイム大会。毎晩21:00(日本時間)に人を集中させ、「人が集まらないから過疎に見える →
 * 離脱」の悪循環を断つための時間同期の仕組み。サーバーのMTTは常時1つ募集中なので、
 * 開催枠そのものは既存のMTTを使い、この画面は「集合時刻の告知・カウントダウン・誘導」を担う。
 *
 * 時刻は日本時間(UTC+9)固定。日本には夏時間がないため、固定オフセットで安全に計算できる。
 */
const PRIME_TIME_HOUR_JST = 21;
const PRIME_TIME_DURATION_MS = 60 * 60 * 1000;
const JST_OFFSET_HOURS = 9;

interface PrimeTimeWindow {
  /** 次回(開催中ならその回)の開始時刻。 */
  start: Date;
  /** 開催終了時刻。 */
  end: Date;
  /** いま開催時間帯の中か。 */
  live: boolean;
  /** 開催中は終了まで、開催前は開始までのミリ秒。 */
  remainingMs: number;
}

/** いまが開催中か、次はいつかを求める(テスト容易性のためnowを受け取る純粋関数)。 */
export function primeTimeWindow(now: Date): PrimeTimeWindow {
  const startUtcHour = PRIME_TIME_HOUR_JST - JST_OFFSET_HOURS; // JST21:00 = UTC12:00(同日)
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), startUtcHour, 0, 0, 0);
  const todayEnd = todayStart + PRIME_TIME_DURATION_MS;
  const nowMs = now.getTime();

  if (nowMs < todayEnd) {
    const live = nowMs >= todayStart;
    return {
      start: new Date(todayStart),
      end: new Date(todayEnd),
      live,
      remainingMs: live ? todayEnd - nowMs : todayStart - nowMs,
    };
  }
  const nextStart = todayStart + 24 * 60 * 60 * 1000;
  return {
    start: new Date(nextStart),
    end: new Date(nextStart + PRIME_TIME_DURATION_MS),
    live: false,
    remainingMs: nextStart - nowMs,
  };
}

/** 集合を告げるSVGグリフ(時計)。絵文字は使わない。 */
function ClockGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** X(旧Twitter)ロゴ。 */
function XLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

export function PrimeTimeCard({ onJoin }: { onJoin: (gameKey: GameKey) => void }) {
  const { t } = useI18n();
  // 30秒ごとに再評価する(秒単位の精度は不要。開始/終了の切り替わりは十分に拾える)。
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const window = primeTimeWindow(now);
  const totalMinutes = Math.max(0, Math.ceil(window.remainingMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const remainingLabel =
    totalMinutes <= 1 ? t("primetime.soon") : hours > 0 ? t("primetime.hm", { h: hours, m: minutes }) : t("primetime.m", { m: minutes });

  function handleShare() {
    const text = window.live ? t("primetime.shareTextLive") : t("primetime.shareText");
    const intent =
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}` +
      `&url=${encodeURIComponent("https://meta-geo-poker.vercel.app")}` +
      `&hashtags=${encodeURIComponent("ポーカーアート,ポーカー")}`;
    try {
      globalThis.open?.(intent, "_blank", "noopener,noreferrer");
    } catch {
      /* ポップアップブロック等。無視する。 */
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-[20px] border-[1.5px] p-4 ${
        window.live ? "border-gold-500 bg-gold-500/10" : "border-ink-950 bg-white"
      }`}
    >
      <div className="flex items-center gap-2">
        <ClockGlyph className="h-4 w-4 text-gold-600" />
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-ink-400">{t("primetime.eyebrow")}</p>
        {window.live && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-gold-500 px-2.5 py-1 text-[10px] font-black text-ink-950">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink-950/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ink-950" />
            </span>
            {t("primetime.live")}
          </span>
        )}
      </div>

      <h3 className="mt-1.5 text-[19px] font-black leading-tight tracking-tight text-ink-950">{t("primetime.title")}</h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-600">{t("primetime.lead")}</p>

      <div className="mt-3.5 flex items-stretch gap-2">
        <div className="flex-1 rounded-xl bg-white/70 px-3.5 py-2.5 ring-1 ring-ink-200">
          <p className="text-[10px] font-bold tracking-wide text-ink-500">{t("primetime.schedule")}</p>
          <p className="mt-0.5 text-[15px] font-black leading-none tabular-nums text-ink-950">{t("primetime.everyday")}</p>
        </div>
        <div className="flex-1 rounded-xl bg-white/70 px-3.5 py-2.5 ring-1 ring-ink-200">
          <p className="text-[10px] font-bold tracking-wide text-ink-500">
            {window.live ? t("primetime.remaining") : t("primetime.startsIn")}
          </p>
          <p className="mt-0.5 text-[15px] font-black leading-none tabular-nums text-ink-950">{remainingLabel}</p>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button
          onClick={() => onJoin("mtt")}
          className={`rounded-xl py-3 text-[13px] font-black transition-transform active:scale-[0.98] ${
            window.live ? "bg-gold-500 text-ink-950" : "border border-ink-950 bg-white text-ink-950"
          }`}
        >
          {window.live ? t("primetime.join") : t("primetime.joinEarly")}
        </button>
        <button
          onClick={handleShare}
          className="flex items-center justify-center gap-2 rounded-xl bg-ink-950 py-3 text-[13px] font-black text-white transition-transform active:scale-[0.98]"
        >
          <XLogo className="h-[15px] w-[15px]" />
          {t("primetime.share")}
        </button>
      </div>

      {/* 観戦ページ(配信者がそのまま画面に出せるライブ状況)への導線。 */}
      <Link href="/watch" className="mt-3 block text-center text-[11.5px] font-semibold text-ink-500 underline decoration-dashed underline-offset-2">
        {t("primetime.watchLink")}
      </Link>
    </motion.div>
  );
}
