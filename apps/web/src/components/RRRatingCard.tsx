"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface RRRatingData {
  rrRating: number;
  roi: number;
  tournamentsPlayed: number;
  nationalRank: number | null;
  totalRankedPlayers: number;
}

/** RRPokerと同じく、下位帯(50未満で目安45未満)は細かい数値を伏せて「< 45」とだけ表示する。 */
function displayRating(rr: number): string {
  return rr < 45 ? "< 45" : rr.toFixed(2);
}

/**
 * 「トナメ偏差値」(RRRating)カード。RRPokerのホーム画面ヒーローカードと同じデザイン言語
 * (ゴールドグラデーションのヒーロー部+下部の統計グリッド)で、ROIベースの偏差値を表示する。
 * 計算ロジックはpackages/db/src/rrRating.tsでRRPokerの実装と全く同じ式を再現している。
 */
export function RRRatingCard({
  data,
  itmRate,
  onViewLeaderboard,
}: {
  data: RRRatingData | null;
  itmRate: number;
  onViewLeaderboard: () => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl bg-ink-100 ring-1 ring-ink-400 overflow-hidden shadow-card"
    >
      <div className="relative bg-gradient-to-br from-gold-500 to-gold-600 px-5 pt-4 pb-5 overflow-hidden">
        <div className="pointer-events-none absolute -top-10 -right-8 h-40 w-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-6 -left-6 h-28 w-28 rounded-full bg-white/5" />

        <div className="relative flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-white/70">トナメ偏差値</p>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setInfoOpen((v) => !v)}
            aria-label="トナメ偏差値について"
            className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center text-white/85"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5.5M12 8v.01" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>
        </div>

        <div className="relative flex items-end gap-2.5">
          {!data || data.tournamentsPlayed === 0 ? (
            <p className="text-4xl font-black text-white/75 tracking-tight">集計中</p>
          ) : (
            <>
              <motion.p
                key={data.rrRating}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-5xl font-black text-white tracking-tight tabular-nums"
              >
                {displayRating(data.rrRating)}
              </motion.p>
              {data.nationalRank != null && (
                <div className="mb-1.5 rounded-full bg-black/20 px-2.5 py-1">
                  <p className="text-xs font-bold text-white">全国{data.nationalRank.toLocaleString()}位</p>
                </div>
              )}
            </>
          )}
        </div>

        <AnimatePresence>
          {infoOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className="relative mt-3 rounded-xl bg-white/95 p-3 text-[11px] leading-relaxed text-ink-800"
            >
              ROIをもとにトーナメントの実力を偏差値(平均50)で表したもの。参加数が少ないうちは変動しにくく、参加すればするほど実力に近い値になります。
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-3 gap-2 mb-3">
          <MiniStat label="参加数" value={(data?.tournamentsPlayed ?? 0).toLocaleString()} />
          <MiniStat label="ROI" value={`${((data?.roi ?? 0) * 100).toFixed(0)}%`} accent />
          <MiniStat label="インマネ率" value={`${(itmRate * 100).toFixed(0)}%`} accent />
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onViewLeaderboard}
          className="w-full h-11 rounded-xl border-[1.5px] border-gold-500/50 text-gold-600 text-[13px] font-bold flex items-center justify-center gap-1.5"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
            <path d="M7 4h10v4.5a5 5 0 0 1-10 0V4Z" strokeLinejoin="round" />
            <path d="M7 5.2H4.6A2.4 2.4 0 0 0 7 8.4M17 5.2h2.4A2.4 2.4 0 0 1 17 8.4" strokeLinecap="round" />
          </svg>
          ランキングを見る
        </motion.button>
      </div>
    </motion.div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-2.5 text-center ${accent ? "bg-gold-500/10" : "bg-ink-200/70"}`}>
      <div className="text-[10px] text-ink-600 mb-0.5">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${accent ? "text-gold-600" : "text-ink-950"}`}>{value}</div>
    </div>
  );
}
