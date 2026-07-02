"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const SUIT_GLYPH: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

function isRed(suit: string): boolean {
  return suit === "h" || suit === "d";
}

function dimsFor(size: "sm" | "md" | "lg"): string {
  return size === "sm" ? "h-[38px] w-[27px] text-[10px]" : size === "lg" ? "h-20 w-14 text-lg" : "h-14 w-10 text-sm";
}

/**
 * `public/cards/{code}.png` (例: As.png, 10h.png, Kh.png) が存在すればそれを描画に使い、
 * 無ければ現行のCSS描画にフォールバックする。デザイン画像を後から public/cards/ に
 * 置くだけで、コード変更なしに反映される(詳細は public/cards/README.md 参照)。
 */
function CardFace({ card, dims }: { card: string; dims: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);

  if (!imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 差し込みデザインは静的最適化不要な小さな画像のため素のimgでよい
      <img
        src={`/cards/${card}.png`}
        alt={card}
        draggable={false}
        onError={() => setImgFailed(true)}
        className={`${dims} rounded-md object-contain shadow-card select-none`}
      />
    );
  }

  const red = isRed(suit);
  return (
    <div
      className={`${dims} rounded-md bg-ink-50 shadow-card ring-1 ring-black/10 flex flex-col items-center justify-center leading-none select-none`}
    >
      <span className={`font-semibold ${red ? "text-rose-500" : "text-ink-900"}`}>{rank}</span>
      <span className={red ? "text-rose-500" : "text-ink-900"}>{SUIT_GLYPH[suit]}</span>
    </div>
  );
}

function CardBack({ dims }: { dims: string }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (!imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/cards/back.png"
        alt=""
        draggable={false}
        onError={() => setImgFailed(true)}
        className={`${dims} rounded-md object-contain shadow-card select-none`}
      />
    );
  }

  return (
    <div className={`${dims} rounded-md bg-gradient-to-br from-ink-700 to-ink-800 shadow-card ring-1 ring-black/40 relative overflow-hidden`}>
      <div className="absolute inset-[3px] rounded-[5px] border border-ink-500/30" />
      <div className="absolute inset-0 flex items-center justify-center text-ink-500/50 text-[10px] tracking-widest">♠</div>
    </div>
  );
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
  const dims = dimsFor(size);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: dealDelay, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      {faceDown || !card ? <CardBack dims={dims} /> : <CardFace card={card} dims={dims} />}
    </motion.div>
  );
}
