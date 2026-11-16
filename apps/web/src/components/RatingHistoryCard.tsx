"use client";

import { motion } from "framer-motion";
import { SPRING_MOVE } from "@/lib/motion";
import { useI18n } from "@/lib/i18n";
import type { TournamentHistoryPoint } from "./RRRatingCard";

/**
 * レートの推移(chess.com のプロフィールにあるレートのグラフと同じ考え方)。
 * いまのレートを大きく、直近のトーナメントごとのレートを折れ線で出す。レートを入れる前のトナメは飛ばす。
 */
export function RatingHistoryCard({ history }: { history: TournamentHistoryPoint[] }) {
  const { t } = useI18n();
  const pts = history.map((h) => h.ratingAfter).filter((r): r is number => typeof r === "number");
  if (pts.length === 0) return null;
  const current = pts[pts.length - 1]!;
  const first = pts.length > 1 ? pts[0]! : current;
  const diff = current - first;
  const W = 300;
  const H = 72;
  const min = Math.min(...pts) - 5;
  const max = Math.max(...pts) + 5;
  const x = (i: number) => (pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * W);
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * H;
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const tone = diff > 0 ? "text-accent" : diff < 0 ? "text-[#e5484d]" : "text-fg-2";
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_MOVE}
      className="rounded-3xl bg-surface p-4 shadow-e1"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-bold text-fg-2">{t("result.rating")}</span>
        <span className="ml-auto text-[28px] font-black leading-none tabular-nums text-fg">{current}</span>
        {pts.length > 1 && (
          <span className={`text-[13px] font-black tabular-nums ${tone}`}>{diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "±0"}</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-[72px] w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
        <motion.path
          d={d}
          fill="none"
          stroke="rgb(var(--accent))"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ ...SPRING_MOVE, duration: 1.2 }}
        />
        <circle cx={x(pts.length - 1)} cy={y(current)} r={3.5} fill="rgb(var(--accent))" />
      </svg>
    </motion.section>
  );
}
