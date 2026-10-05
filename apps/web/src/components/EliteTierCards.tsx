"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./Icon";
import { useI18n } from "@/lib/i18n";
import { SPRING_MOVE, SPRING_SNAPPY } from "@/lib/motion";
import { GAME_KEY_BY_TIER, SNG_TIERS, TIER_LABEL, qualifiesForTier, type EliteStats, type SngTier } from "@/lib/sngTiers";
import type { GameKey } from "@/lib/socket";

/** サーバーの /api/lobby/elite の応答。 */
export interface EliteInfo {
  stats: EliteStats;
  frame: "silver" | "gold" | null;
}

type EliteTier = Exclude<SngTier, "regular">;

const ELITE_TIERS: readonly EliteTier[] = ["highRoller", "superHighRoller"];

function signed(n: number): string {
  return `${n >= 0 ? "+" : ""}${Math.round(n).toLocaleString()}`;
}

/** ボタンの色(Play と同じ意匠の銀・金)。資格者のアイコン枠と同じ色で、どの卓の資格がどの枠かを結び付ける。 */
function lineClass(tier: EliteTier): string {
  return tier === "superHighRoller" ? "line-fill-btn-gold" : "line-fill-btn-silver";
}

/** 上辺の帯の素材(条件のポップアップの上辺)。資格者のアイコン枠と同じ銀・金。 */
function bandClass(tier: EliteTier): string {
  return tier === "superHighRoller" ? "avatar-frame-gold" : "avatar-frame-silver";
}

/**
 * ホームの「Play」の下に並ぶ High Roller / Super High Roller の卓。
 *
 * 「Play」と同じ意匠(縁取りのピル・大きい卓名・小さい副題・右に矢印)で、色だけ銀・金(オーナー指示)。
 * 縦に2段で並べ、条件はボタンに書かない。
 * 資格が無い卓は薄く描き、右上を錠にして「押せない」ことを見た目で伝える。押すと参加はせず、
 * 条件と今の値をポップアップで出す(なぜ押せないか・あと何が足りないかが、押した場所ですぐ分かる)。
 * 資格の判定はサーバーでも必ず行う(この画面の錠は案内であって、守りではない)。
 */
export function EliteTierCards({ elite, onJoin }: { elite: EliteInfo | null; onJoin: (key: GameKey) => void }) {
  const { t } = useI18n();
  const [requirementsFor, setRequirementsFor] = useState<EliteTier | null>(null);

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {ELITE_TIERS.map((tier, i) => {
          const cfg = SNG_TIERS[tier];
          const eligible = elite ? qualifiesForTier(tier, elite.stats) : false;
          return (
            <motion.div
              key={tier}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: eligible ? 1 : 0.45, y: 0 }}
              transition={{ ...SPRING_MOVE, delay: 0.05 * (i + 1) }}
              className="pressable-lg w-full"
            >
              <button
                type="button"
                onClick={() => (eligible ? onJoin(GAME_KEY_BY_TIER[tier]) : setRequirementsFor(tier))}
                aria-label={`${TIER_LABEL[tier]} ${eligible ? t("play.enter") : t("tier.requirements")}`}
                className={`line-fill-btn ${lineClass(tier)} flex w-full items-center gap-4 px-5 py-4 text-left`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[19px] font-black leading-none tracking-[-0.02em]">{TIER_LABEL[tier]}</span>
                  <span className="mt-1.5 block truncate text-[12px] font-bold uppercase tracking-[0.08em] opacity-70">
                    {t("play.buyIn")} {cfg.buyIn.toLocaleString()} · {t("tier.meta", { bb: cfg.startingStack / 200, min: cfg.levelDurationMs / 60_000 })}
                  </span>
                </span>
                <Icon name={eligible ? "arrow-right" : "lock"} className={`h-5 w-5 shrink-0 ${eligible ? "line-fill-arrow" : ""}`} />
              </button>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {requirementsFor && (
          <TierRequirementsModal tier={requirementsFor} stats={elite?.stats ?? null} onClose={() => setRequirementsFor(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

/** 参加条件のポップアップ。満たしている条件はチェック、まだの条件は横線で、今の値と必要な値を並べる。 */
function TierRequirementsModal({ tier, stats, onClose }: { tier: EliteTier; stats: EliteStats | null; onClose: () => void }) {
  const { t } = useI18n();
  const req = SNG_TIERS[tier].requirement!;
  const rows: { label: string; current: string; need: string; met: boolean }[] = [
    {
      label: t("tier.req.profit"),
      current: stats ? signed(stats.profit) : "--",
      need: signed(req.minProfit),
      met: Boolean(stats && stats.profit >= req.minProfit),
    },
  ];
  if (req.minRating !== undefined) {
    rows.push({
      label: t("tier.req.rating"),
      current: stats?.rating != null ? stats.rating.toFixed(1) : "--",
      need: String(req.minRating),
      met: Boolean(stats?.rating != null && stats.rating >= req.minRating),
    });
  }
  if (req.minRoiPct !== undefined) {
    rows.push({
      label: t("tier.req.roi"),
      current: stats?.roiPct != null ? `${signed(stats.roiPct)}%` : "--",
      need: `+${req.minRoiPct}%`,
      met: Boolean(stats?.roiPct != null && stats.roiPct >= req.minRoiPct),
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-8"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`${TIER_LABEL[tier]} ${t("tier.requirements")}`}
        initial={{ scale: 0.92, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 16, opacity: 0 }}
        transition={SPRING_SNAPPY}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[320px] overflow-hidden rounded-2xl bg-surface-2 p-5 pt-6 shadow-e4"
      >
        <span aria-hidden className={`absolute inset-x-0 top-0 h-[3px] ${bandClass(tier)}`} />
        <div className="flex items-center gap-2">
          <Icon name="lock" className="h-4 w-4 shrink-0 text-fg-2" />
          <p className="text-[11px] font-black tracking-[0.08em] text-fg-2">{t("tier.requirements")}</p>
        </div>
        <h2 className="mt-1 text-[18px] font-black tracking-tight text-fg">{TIER_LABEL[tier]}</h2>

        <ul className="mt-4 space-y-2.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2.5 text-[13px] tabular-nums">
              <Icon name={r.met ? "check" : "minus"} className={`h-4 w-4 shrink-0 ${r.met ? "text-accent" : "text-fg-3"}`} />
              <span className="min-w-0 flex-1 text-fg-2">{r.label}</span>
              <span className="shrink-0 font-black text-fg">
                {r.current}
                <span className="font-semibold text-fg-3"> / {r.need}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[11px] leading-relaxed text-fg-3">{t("tier.requirementsHint")}</p>

        <button
          type="button"
          onClick={onClose}
          className="pressable mt-4 w-full rounded-full bg-surface-3 py-2.5 text-[13px] font-bold text-fg"
        >
          {t("common.close")}
        </button>
      </motion.div>
    </motion.div>
  );
}
