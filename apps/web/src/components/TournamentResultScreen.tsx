"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { TournamentOverInfo } from "@/lib/socket";
import { useCountUp } from "@/lib/useCountUp";
import { useI18n } from "@/lib/i18n";
import { prewarmTournamentReview } from "@/lib/reviewApi";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

/** 結果画面で使う、集計スタッツ+偏差値のスナップショット。 */
export interface ResultStatsSnapshot {
  profit: number;
  roi: number;
  itmRate: number;
  nationalRank: number | null;
  totalRankedPlayers: number;
}

/** ログイン中ユーザーのスタッツ+全国順位を取得してスナップショットにまとめる。 */
export async function fetchResultSnapshot(accessToken: string): Promise<ResultStatsSnapshot | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/lobby/stats`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const s = (await res.json()) as ResultStatsSnapshot;
    return {
      profit: s.profit ?? 0,
      roi: s.roi ?? 0,
      itmRate: s.itmRate ?? 0,
      nationalRank: s.nationalRank ?? null,
      totalRankedPlayers: s.totalRankedPlayers ?? 0,
    };
  } catch {
    return null;
  }
}

/** target値まで滑らかにカウントアップするフック(before→afterのアニメ表示用)。 */
type DeltaTone = "up" | "down" | "flat";

/** 1つの指標カード: ラベル + カウントアップする現在値 + 「+OO / -OO」の増減バッジ。 */
function MetricCard({
  label,
  from,
  to,
  format,
  delta,
  deltaText,
  deltaTone,
  delay,
}: {
  label: string;
  from: number;
  to: number;
  format: (v: number) => string;
  delta: boolean;
  deltaText: string;
  deltaTone: DeltaTone;
  delay: number;
}) {
  const v = useCountUp(from, to, 1200, delay);
  const toneClass = deltaTone === "up" ? "text-mint-700 bg-mint-500/10" : deltaTone === "down" ? "text-crimson-600 bg-crimson-500/10" : "text-ink-500 bg-ink-100";
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-ink-950 bg-white p-4"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-ink-400">{label}</p>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-[22px] font-black tabular-nums text-ink-950">{format(v)}</span>
        {delta && (
          <motion.span
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: delay / 1000 + 1.1, type: "spring", stiffness: 520, damping: 20 }}
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${toneClass}`}
          >
            {deltaText}
          </motion.span>
        )}
      </div>
    </motion.div>
  );
}

const PROD_URL = "https://meta-geo-poker.vercel.app";

/** 英語の序数表記(1st / 2nd / 3rd / 4th ...)。着順を「1th.」風に大きく見せるために使う。 */
function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * トーナメント結果画面。上半分に着順を超特大表示(SNGは「1st.」風の序数、MTTは「6 / 521」の
 * 着順/エントリー数)。その下に獲得プライズと、今回で自分の成績(収支/ROI/インマネ率/全国ランク)が
 * どう変化したかを数字カウントアップ+増減バッジで表示。さらに目立つ「棋譜解析」ボタン、
 * 最後に「閉じる(ホームへ)」「シェア」ボタンをバランスよく並べる。
 */
export function TournamentResultScreen({
  info,
  accessToken,
  statsBefore,
  tournamentId,
  gameKey,
  totalEntrants,
  onExit,
}: {
  info: TournamentOverInfo;
  accessToken: string | undefined;
  statsBefore: ResultStatsSnapshot | null;
  /** このトーナメントのDB ID。あれば「棋譜解析へ」導線を出す。 */
  tournamentId?: string | null;
  /** ゲーム種別。MTTは着順/エントリー数表記にする。 */
  gameKey?: "sng" | "mtt";
  /** 総エントリー数(MTTの「6 / 521」表記用)。 */
  totalEntrants?: number | null;
  onExit: () => void;
}) {
  const { t } = useI18n();
  const [after, setAfter] = useState<ResultStatsSnapshot | null>(null);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    void fetchResultSnapshot(accessToken).then(setAfter);
  }, [accessToken]);

  // 事前計算: リザルトを見ている間に棋譜解析のソルバー計算をバックグラウンドで先回りして始める。
  useEffect(() => {
    if (!accessToken || !tournamentId) return;
    void prewarmTournamentReview(tournamentId, accessToken);
  }, [accessToken, tournamentId]);

  const isWin = info.yourFinishPosition === 1;
  const before = statsBefore;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const roiPct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const signed = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString()}`;

  const pos = info.yourFinishPosition;
  // MTTは「着順 / 総エントリー数」、それ以外(SNG)は「1st.」風の英語序数で超特大表示する。
  const useRatio = gameKey === "mtt" && pos != null && totalEntrants != null && totalEntrants > 0;
  const rankPlain = pos == null ? t("result.finished") : useRatio ? `${pos} / ${totalEntrants}` : ordinal(pos);

  async function handleShare() {
    const parts = [t("common.appName")];
    if (pos != null) parts.push(useRatio ? `${pos} / ${totalEntrants}` : ordinal(pos));
    if (info.yourPayout > 0) parts.push(`${t("result.prizePrefix")} +${info.yourPayout.toLocaleString()}`);
    const text = parts.join(" · ");
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: t("common.appName"), text, url: PROD_URL });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${text}\n${PROD_URL}`);
        setShared(true);
        window.setTimeout(() => setShared(false), 1600);
      }
    } catch {
      /* ユーザーが共有シートをキャンセルした等。無視する。 */
    }
  }

  // 各指標の増減。beforeが取れないゲスト等では増減バッジは出さず現在値のみ表示。
  function delta(cur: number, prev: number | undefined, fmt: (v: number) => string, higherBetter = true): { text: string; tone: DeltaTone; show: boolean } {
    if (prev === undefined || before === null) return { text: "", tone: "flat", show: false };
    const d = cur - prev;
    const tone: DeltaTone = Math.abs(d) < 1e-9 ? "flat" : (d > 0) === higherBetter ? "up" : "down";
    return { text: `${d > 0 ? "+" : d < 0 ? "" : "±"}${fmt(Math.abs(d)).replace("+", "")}`, tone, show: true };
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-white/97 backdrop-blur px-5 py-8"
    >
      <div className="w-full max-w-sm">
        {/* 着順ヘッダー(上半分・超特大) */}
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 360, damping: 22 }}
          className="mb-6 pt-4 text-center"
        >
          {isWin && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 h-14 w-14 text-gold-500">
              <path d="M7 4h10v4.5a5 5 0 0 1-10 0V4Z" />
              <path d="M7 5.4H4.4A2.6 2.6 0 0 0 7 8.6M17 5.4h2.6A2.6 2.6 0 0 1 17 8.6" />
              <path d="M12 13.5v3.5M8.5 21h7M9.5 21v-1.2a2.5 2.5 0 0 1 5 0V21" />
            </svg>
          )}
          <p className="text-[11px] font-black uppercase tracking-[0.34em] text-ink-400">Tournament Result</p>
          <p
            className={`mt-2 font-black leading-[0.9] tracking-tight text-ink-950 tabular-nums ${
              useRatio ? "text-[64px]" : "text-[88px]"
            }`}
          >
            {rankPlain}
            {!useRatio && pos != null && <span className="text-gold-500">.</span>}
          </p>
          {info.yourPayout > 0 && (
            <motion.p
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.25, type: "spring", stiffness: 460, damping: 20 }}
              className="mt-3 inline-block rounded-full bg-gold-500/15 px-5 py-1.5 text-[18px] font-black tabular-nums text-gold-700"
            >
              {t("result.prizePrefix")} +{info.yourPayout.toLocaleString()}
            </motion.p>
          )}
        </motion.div>

        {/* 指標カード群(収支/ROI/インマネ率/全国ランク) = 成績がどう変化したか */}
        {after ? (
          <div className="grid grid-cols-2 gap-2.5">
            <MetricCard
              label={t("result.m.profit")}
              from={before?.profit ?? after.profit}
              to={after.profit}
              format={(v) => signed(v)}
              delta={(before?.profit ?? undefined) !== undefined}
              {...(() => {
                const d = delta(after.profit, before?.profit, (v) => Math.round(v).toLocaleString());
                return { deltaText: d.text, deltaTone: d.tone, delay: 200 };
              })()}
            />
            <MetricCard
              label="ROI"
              from={before?.roi ?? after.roi}
              to={after.roi}
              format={roiPct}
              delta={before?.roi !== undefined}
              {...(() => {
                const d = delta(after.roi, before?.roi, (v) => `${Math.round(v * 100)}pt`);
                return { deltaText: d.text, deltaTone: d.tone, delay: 320 };
              })()}
            />
            <MetricCard
              label={t("result.m.itmRate")}
              from={before?.itmRate ?? after.itmRate}
              to={after.itmRate}
              format={pct}
              delta={before?.itmRate !== undefined}
              {...(() => {
                const d = delta(after.itmRate, before?.itmRate, (v) => `${(v * 100).toFixed(1)}pt`);
                return { deltaText: d.text, deltaTone: d.tone, delay: 440 };
              })()}
            />
            <MetricCard
              label={t("result.m.rank")}
              from={before?.nationalRank ?? after.nationalRank ?? 0}
              to={after.nationalRank ?? 0}
              format={(v) => (after.nationalRank ? t("result.place", { n: Math.round(v) }) : "—")}
              delta={before?.nationalRank != null && after.nationalRank != null}
              {...(() => {
                // 順位は小さいほど良い。before-after が正なら順位が上がった(↑)。
                if (before?.nationalRank == null || after.nationalRank == null) return { deltaText: "", deltaTone: "flat" as DeltaTone, delay: 560 };
                const up = before.nationalRank - after.nationalRank;
                const tone: DeltaTone = up > 0 ? "up" : up < 0 ? "down" : "flat";
                return { deltaText: up === 0 ? "±0" : `${up > 0 ? "↑" : "↓"}${Math.abs(up)}`, deltaTone: tone, delay: 560 };
              })()}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-ink-100" />
            ))}
          </div>
        )}

        {/* 棋譜解析(局後検討)への導線 = 一番目立たせる主役CTA。tournamentIdがあるときだけ。 */}
        {tournamentId && (
          <Link
            href={`/review/tournament/${tournamentId}`}
            className="group mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gold-500 py-5 text-[17px] font-black text-white shadow-[0_10px_28px_-8px_rgba(212,145,10,0.6)] ring-1 ring-gold-600/40 transition-transform active:scale-[0.98]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="M4 19V5M4 15l4-4 3 3 6-6M14 8h3v3" />
            </svg>
            {t("result.reviewCta")}
          </Link>
        )}

        {/* 閉じる(ホームへ) / シェア をバランスよく並べる */}
        <div className={`grid grid-cols-2 gap-2.5 ${tournamentId ? "mt-3" : "mt-6"}`}>
          <button
            onClick={onExit}
            className="rounded-2xl border border-ink-950 bg-white py-3.5 text-sm font-black text-ink-950 transition-transform active:scale-[0.98]"
          >
            {t("common.close")}
          </button>
          <button
            onClick={handleShare}
            className="flex items-center justify-center gap-2 rounded-2xl bg-ink-950 py-3.5 text-sm font-black text-white transition-transform active:scale-[0.98]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
              <circle cx="18" cy="5" r="2.6" />
              <circle cx="6" cy="12" r="2.6" />
              <circle cx="18" cy="19" r="2.6" />
              <path d="M8.3 10.8 15.7 6.4M8.3 13.2l7.4 4.4" />
            </svg>
            {shared ? t("result.shareDone") : t("result.share")}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
