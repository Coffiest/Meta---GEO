"use client";

import { motion, AnimatePresence } from "framer-motion";
import { PlayingCard } from "./PlayingCard";

export interface SeatViewProps {
  seatIndex: number;
  name: string;
  stack: number;
  streetContribution: number;
  status: "active" | "folded" | "allIn" | "empty";
  isActingSeat: boolean;
  isButton: boolean;
  isHero: boolean;
  holeCards: (string | null)[];
  revealCards: boolean;
  size?: "sm" | "lg";
}

export function Seat({
  name,
  stack,
  streetContribution,
  status,
  isActingSeat,
  isButton,
  isHero,
  holeCards,
  revealCards,
  size = "sm",
}: SeatViewProps) {
  const isEmpty = status === "empty";
  const folded = status === "folded";

  return (
    <div className={`flex flex-col items-center gap-1.5 ${size === "lg" ? "w-24" : "w-20"}`}>
      <div className="flex gap-1">
        {holeCards.map((c, i) =>
          isEmpty ? null : (
            <PlayingCard
              key={i}
              card={revealCards ? c ?? undefined : undefined}
              faceDown={!revealCards}
              size={size === "lg" ? "md" : "sm"}
              dealDelay={i * 0.05}
            />
          ),
        )}
      </div>

      <div
        className={`relative rounded-2xl px-3 py-2 min-w-[76px] text-center transition-all duration-300 ${
          isEmpty
            ? "bg-transparent"
            : folded
              ? "bg-ink-850/60 opacity-40"
              : "bg-ink-850/90 backdrop-blur ring-1 ring-ink-600/50 shadow-seat"
        } ${isActingSeat ? "ring-2 ring-gold-500 animate-pulse-ring" : ""}`}
      >
        {isButton && !isEmpty && (
          <div className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-gold-500 text-ink-950 text-[10px] font-bold flex items-center justify-center shadow-card">
            D
          </div>
        )}
        {!isEmpty && (
          <>
            <div className={`text-[11px] font-medium truncate ${isHero ? "text-gold-400" : "text-ink-200"}`}>
              {name}
            </div>
            <div className="text-[13px] font-semibold text-ink-50 tabular-nums">{stack.toLocaleString()}</div>
            {status === "allIn" && <div className="text-[10px] text-rose-400 font-medium mt-0.5">ALL IN</div>}
          </>
        )}
      </div>

      <AnimatePresence>
        {streetContribution > 0 && !isEmpty && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className="flex items-center gap-1 rounded-full bg-ink-800/90 ring-1 ring-gold-600/40 px-2 py-0.5 text-[10px] font-medium text-gold-400 tabular-nums"
          >
            <span className="h-2 w-2 rounded-full bg-gold-500" />
            {streetContribution.toLocaleString()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
