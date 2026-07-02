"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PublicHandState } from "@meta-geo/engine";
// deck.ts(node:crypto に依存)を含むバレル経由だとブラウザバンドルが壊れるため、
// cardToString は依存の少ないサブモジュールから直接インポートする。
import { cardToString } from "@meta-geo/engine/src/types/card.js";
import { PlayingCard } from "./PlayingCard";
import { Seat } from "./Seat";

const SEAT_LAYOUT: Record<number, string> = {
  1: "top-[4%] left-1/2 -translate-x-1/2",
  2: "top-[16%] left-[6%]",
  3: "top-[16%] right-[6%]",
  4: "top-[42%] left-[1%]",
  5: "top-[42%] right-[1%]",
};

/**
 * `public/table/felt.png` が存在すればそれをテーブル背景として使い、無ければ現行の
 * グラデーション描画にフォールバックする(詳細は public/table/README.md 参照)。
 * グラデーションは常にベースとして描画し、画像は読み込めた場合だけその上にフェードインする
 * ので、読み込み中や画像が無い場合でもテーブルが崩れて見えることはない。
 */
function TableFelt() {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="absolute inset-x-[6%] top-[12%] bottom-[20%] rounded-[46%] bg-gradient-to-b from-felt-800 to-felt-900 ring-1 ring-black/40 shadow-[inset_0_2px_24px_rgba(0,0,0,0.55)] overflow-hidden">
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/table/felt.png"
          alt=""
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
          style={{ opacity: loaded ? 1 : 0 }}
        />
      )}
      <div className="absolute inset-3 rounded-[46%] ring-1 ring-white/[0.04]" />
    </div>
  );
}

export function PokerTable({
  state,
  yourSeatIndex,
  yourCards,
  seatCount,
  revealedHoleCards,
}: {
  state: PublicHandState | null;
  yourSeatIndex: number | null;
  yourCards: string[];
  seatCount: number;
  revealedHoleCards: Record<number, string[]> | null;
}) {
  const seatsByIndex = new Map((state?.seats ?? []).map((s) => [s.seatIndex, s]));

  return (
    <div className="relative w-full aspect-[3/4] max-w-md mx-auto">
      {/* felt table */}
      <TableFelt />

      {/* pot + board, centered on felt */}
      <div className="absolute inset-x-0 top-[32%] flex flex-col items-center gap-3">
        <AnimatePresence mode="popLayout">
          {state && state.potTotal > 0 && (
            <motion.div
              key={state.potTotal}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-full bg-black/40 backdrop-blur px-3 py-1 text-xs font-medium text-gold-400 tabular-nums ring-1 ring-gold-600/30"
            >
              POT {state.potTotal.toLocaleString()}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex gap-1.5 h-14 items-center">
          {(state?.board ?? []).map((card, i) => (
            <PlayingCard key={`${cardToString(card)}-${i}`} card={cardToString(card)} size="md" dealDelay={i * 0.06} />
          ))}
        </div>
      </div>

      {/* opponent seats */}
      {[1, 2, 3, 4, 5].map((seatIndex) => {
        if (seatIndex >= seatCount) return null;
        const seat = seatsByIndex.get(seatIndex);
        const revealed = revealedHoleCards?.[seatIndex];
        return (
          <div key={seatIndex} className={`absolute ${SEAT_LAYOUT[seatIndex]}`}>
            <Seat
              seatIndex={seatIndex}
              name={`BOT-${seatIndex}`}
              stack={seat?.stack ?? 0}
              streetContribution={seat?.streetContribution ?? 0}
              status={seat?.status ?? "empty"}
              isActingSeat={state?.actingSeatIndex === seatIndex}
              isButton={state?.buttonFixedPos === seatIndex}
              isHero={false}
              holeCards={revealed ? revealed : [null, null]}
              revealCards={Boolean(revealed)}
            />
          </div>
        );
      })}

      {/* hero seat, bottom center, larger */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
        <Seat
          seatIndex={yourSeatIndex ?? 0}
          name="YOU"
          stack={(yourSeatIndex !== null ? seatsByIndex.get(yourSeatIndex)?.stack : undefined) ?? 0}
          streetContribution={(yourSeatIndex !== null ? seatsByIndex.get(yourSeatIndex)?.streetContribution : undefined) ?? 0}
          status={(yourSeatIndex !== null ? seatsByIndex.get(yourSeatIndex)?.status : undefined) ?? "empty"}
          isActingSeat={yourSeatIndex !== null && state?.actingSeatIndex === yourSeatIndex}
          isButton={yourSeatIndex !== null && state?.buttonFixedPos === yourSeatIndex}
          isHero
          holeCards={yourCards.length ? yourCards : [null, null]}
          revealCards
          size="lg"
        />
      </div>
    </div>
  );
}
