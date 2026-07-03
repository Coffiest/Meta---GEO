"use client";

import { motion, AnimatePresence } from "framer-motion";
import { PlayingCard } from "./PlayingCard";
import { formatBb } from "@/lib/format";

export type SeatBadgeTone = "timer" | "raise" | "call" | "fold" | "win" | "lose";

export interface SeatBadge {
  text: string;
  tone: SeatBadgeTone;
}

const BADGE_TONE_CLASS: Record<SeatBadgeTone, string> = {
  timer: "bg-mint-500 text-white",
  call: "bg-mint-500 text-white",
  win: "bg-mint-500 text-white",
  raise: "bg-crimson-500 text-white",
  lose: "bg-crimson-500 text-white",
  fold: "bg-azure-500 text-white",
};

export interface SeatViewProps {
  name: string;
  position: string;
  stack: number;
  streetContribution: number;
  bigBlind: number;
  status: "active" | "folded" | "allIn" | "empty";
  isActingSeat: boolean;
  isHero: boolean;
  holeCards: (string | null)[];
  revealCards: boolean;
  badge?: SeatBadge | null;
  size?: "sm" | "lg";
}

export function Seat({
  name,
  position,
  stack,
  streetContribution,
  bigBlind,
  status,
  isActingSeat,
  isHero,
  holeCards,
  revealCards,
  badge,
  size = "sm",
}: SeatViewProps) {
  const isEmpty = status === "empty";
  const folded = status === "folded";

  return (
    <div className={`flex flex-col items-center gap-1.5 ${size === "lg" ? "w-28" : "w-20"}`}>
      <div className="flex gap-1">
        {holeCards.map((c, i) =>
          isEmpty ? null : (
            <PlayingCard
              key={i}
              card={revealCards ? c ?? undefined : undefined}
              faceDown={!revealCards}
              size={size === "lg" ? "xl" : "sm"}
              dealDelay={i * 0.05}
            />
          ),
        )}
      </div>

      <div
        className={`relative rounded-xl px-3 py-1.5 min-w-[84px] text-center transition-all duration-300 ${
          isEmpty
            ? "bg-transparent"
            : folded
              ? "bg-navy-850/60 opacity-40"
              : "bg-navy-850/90 backdrop-blur ring-1 ring-navy-600/60 shadow-seat"
        } ${isActingSeat ? "ring-2 ring-mint-500" : ""}`}
      >
        {!isEmpty && (
          <>
            <div className="text-[12px] font-medium truncate text-navy-100">{name}</div>
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              {position && (
                <span className="rounded bg-mint-500 text-white text-[9px] font-bold uppercase tracking-wide px-1.5 py-[1px]">
                  {position}
                </span>
              )}
              <span className="text-[12px] font-semibold text-navy-100 tabular-nums">{formatBb(stack, bigBlind)}</span>
            </div>
            {status === "allIn" && <div className="text-[10px] text-crimson-400 font-medium mt-0.5">ALL IN</div>}
          </>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        {badge && !isEmpty ? (
          <motion.div
            key={`badge-${badge.tone}-${badge.text}`}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold tabular-nums ${BADGE_TONE_CLASS[badge.tone]}`}
          >
            {badge.text}
          </motion.div>
        ) : (
          streetContribution > 0 &&
          !isEmpty && (
            <motion.div
              key="contribution"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              className="rounded-full bg-navy-800/90 ring-1 ring-navy-600/60 px-2.5 py-0.5 text-[10px] font-medium text-navy-200 tabular-nums"
            >
              {formatBb(streetContribution, bigBlind)}
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  );
}
