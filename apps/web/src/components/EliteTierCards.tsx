"use client";

import { motion } from "framer-motion";
import { Icon } from "./Icon";
import { useI18n } from "@/lib/i18n";
import { SPRING_MOVE } from "@/lib/motion";
import { GAME_KEY_BY_TIER, SNG_TIERS, TIER_LABEL, qualifiesForTier, type EliteStats, type SngTier } from "@/lib/sngTiers";
import type { GameKey } from "@/lib/socket";

/** サーバーの /api/lobby/elite の応答。 */
export interface EliteInfo {
  stats: EliteStats;
  frame: "silver" | "gold" | null;
}

const ELITE_TIERS: readonly Exclude<SngTier, "regular">[] = ["highRoller", "superHighRoller"];

function signed(n: number): string {
  return `${n >= 0 ? "+" : ""}${Math.round(n).toLocaleString()}`;
}

/**
 * ホームの「Play」の下に並ぶ High Roller / Super High Roller の卓。
 *
 * 上辺の細い帯は、資格者のアイコン枠と同じ銀・金の素材(どの卓の資格がどの枠かを一目で結び付ける)。
 * 資格が無い卓は押せず、錠のアイコンと「条件と今の値」を並べる(あとどれだけで届くかが分かるように)。
 * 資格の判定はサーバーでも必ず行う(この画面の錠は案内であって、守りではない)。
 */
export function EliteTierCards({ elite, onJoin }: { elite: EliteInfo | null; onJoin: (key: GameKey) => void }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 items-start gap-2.5">
      {ELITE_TIERS.map((tier, i) => {
        const cfg = SNG_TIERS[tier];
        const req = cfg.requirement!;
        const stats = elite?.stats ?? null;
        const eligible = stats ? qualifiesForTier(tier, stats) : false;
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
          <motion.button
            key={tier}
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_MOVE, delay: 0.05 * (i + 1) }}
            disabled={!eligible}
            onClick={() => eligible && onJoin(GAME_KEY_BY_TIER[tier])}
            aria-label={`${TIER_LABEL[tier]} ${eligible ? t("play.enter") : t("tier.locked")}`}
            className={`relative flex flex-col overflow-hidden rounded-2xl bg-surface p-3.5 pt-4 text-left shadow-e1 ${
              eligible ? "pressable-lg" : "cursor-default"
            }`}
          >
            <span
              aria-hidden
              className={`absolute inset-x-0 top-0 h-[3px] ${tier === "superHighRoller" ? "avatar-frame-gold" : "avatar-frame-silver"}`}
            />
            <span className="flex items-start justify-between gap-2">
              <span className="text-[14px] font-black leading-tight tracking-tight text-fg">{TIER_LABEL[tier]}</span>
              <Icon
                name={eligible ? "arrow-right" : "lock"}
                className={`mt-0.5 h-4 w-4 shrink-0 ${eligible ? "text-accent" : "text-fg-3"}`}
              />
            </span>
            <span className="mt-1 text-[11px] font-bold tabular-nums text-fg-2">
              {t("play.buyIn")} {cfg.buyIn.toLocaleString()}
            </span>
            <span className="mt-0.5 text-[10px] font-semibold tabular-nums text-fg-3">
              {t("tier.meta", { bb: cfg.startingStack / 200, min: cfg.levelDurationMs / 60_000 })}
            </span>
            {/* 条件と今の値。満たしている行はチェック、まだの行は横線。項目名と値は2段にして、狭い幅でも切らない。 */}
            <span className="mt-2.5 flex flex-col gap-1.5 border-t border-line pt-2">
              {rows.map((r) => (
                <span key={r.label} className="flex flex-col text-[10px] tabular-nums">
                  <span className="flex items-center gap-1 text-fg-2">
                    <Icon name={r.met ? "check" : "minus"} className={`h-3 w-3 shrink-0 ${r.met ? "text-accent" : "text-fg-3"}`} />
                    {r.label}
                  </span>
                  <span className="pl-4 font-bold text-fg">
                    {r.current}
                    <span className="font-semibold text-fg-3"> / {r.need}</span>
                  </span>
                </span>
              ))}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
