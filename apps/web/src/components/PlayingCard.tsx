"use client";

import { motion } from "framer-motion";

const SUIT_GLYPH: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const RANK_LABEL: Record<string, string> = { T: "10" };

function isRed(suit: string): boolean {
  return suit === "h" || suit === "d";
}

export function PlayingCard({
  card,
  size = "md",
  faceDown = false,
  dealDelay = 0,
}: {
  card?: string;
  size?: "sm" | "md" | "lg";
  faceDown?: boolean;
  dealDelay?: number;
}) {
  const dims = size === "sm" ? "h-[38px] w-[27px] text-[10px]" : size === "lg" ? "h-20 w-14 text-lg" : "h-14 w-10 text-sm";

  if (faceDown || !card) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.85 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: dealDelay, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className={`${dims} rounded-md bg-gradient-to-br from-ink-700 to-ink-800 shadow-card ring-1 ring-black/40 relative overflow-hidden`}
      >
        <div className="absolute inset-[3px] rounded-[5px] border border-ink-500/30" />
        <div className="absolute inset-0 flex items-center justify-center text-ink-500/50 text-[10px] tracking-widest">
          ♠
        </div>
      </motion.div>
    );
  }

  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const rankLabel = RANK_LABEL[rank] ?? rank;
  const red = isRed(suit);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: dealDelay, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={`${dims} rounded-md bg-ink-50 shadow-card ring-1 ring-black/10 flex flex-col items-center justify-center leading-none select-none`}
    >
      <span className={`font-semibold ${red ? "text-rose-500" : "text-ink-900"}`}>{rankLabel}</span>
      <span className={`${red ? "text-rose-500" : "text-ink-900"}`}>{SUIT_GLYPH[suit]}</span>
    </motion.div>
  );
}
