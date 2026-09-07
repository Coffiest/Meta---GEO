"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { SPRING_SNAPPY } from "@/lib/motion";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
// 4色デッキ: スペード=前景色, ハート=赤, ダイヤ=青, クラブ=緑。
// (スペードだけは suit-s トークンではなく前景色を使う。暗い面では前景色の方がはっきり出る)
const SUITS: { key: string; symbol: string; colorClass: string }[] = [
  { key: "s", symbol: "♠", colorClass: "text-fg" },
  { key: "h", symbol: "♥", colorClass: "text-suit-h" },
  { key: "d", symbol: "♦", colorClass: "text-suit-d" },
  { key: "c", symbol: "♣", colorClass: "text-suit-c" },
];

function cardCode(rank: string, suit: string): string {
  return `${rank === "T" ? "10" : rank}${suit}`;
}

/**
 * 52枚のカードをランク×スート4段で選ばせるモーダル。フロップ(3枚)/ターン/リバー(各1枚)の
 * 追加カード選択に使う。既に確定済みのボードカードは選択不可(グレーアウト)にする。
 */
export function BoardCardPicker({
  cardsNeeded,
  usedCards,
  onConfirm,
  onClose,
}: {
  cardsNeeded: number;
  usedCards: string[];
  onConfirm: (cards: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const usedSet = new Set(usedCards);

  function toggle(card: string) {
    if (usedSet.has(card)) return;
    setSelected((prev) => {
      if (prev.includes(card)) return prev.filter((c) => c !== card);
      if (prev.length >= cardsNeeded) return prev;
      return [...prev, card];
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70"
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={SPRING_SNAPPY}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto glass-sheet rounded-t-sheet sm:rounded-sheet p-4 shadow-e4"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-extrabold tracking-tight text-fg">
            ボードカードを選択({selected.length}/{cardsNeeded})
          </p>
          <button onClick={onClose} className="text-fg-2 text-xs font-semibold">
            閉じる
          </button>
        </div>

        <div className="space-y-1.5">
          {SUITS.map((suit) => (
            <div key={suit.key} className="grid gap-1" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
              {RANKS.map((rank) => {
                const card = cardCode(rank, suit.key);
                const isUsed = usedSet.has(card);
                const isSelected = selected.includes(card);
                return (
                  <motion.button
                    key={card}
                    disabled={isUsed}
                    whileTap={isUsed ? undefined : { scale: 0.85 }}
                    animate={isSelected ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => toggle(card)}
                    className={`aspect-[3/4] rounded flex flex-col items-center justify-center text-[10px] font-bold transition-colors border ${
                      isUsed
                        ? "bg-surface text-fg-faint border-line cursor-not-allowed"
                        : isSelected
                          ? "bg-accent text-on-accent border-accent"
                          : "bg-surface border-line " + suit.colorClass
                    }`}
                  >
                    <span>{rank}</span>
                    <span>{suit.symbol}</span>
                  </motion.button>
                );
              })}
            </div>
          ))}
        </div>

        <motion.button
          whileTap={selected.length === cardsNeeded ? { scale: 0.97 } : undefined}
          onClick={() => selected.length === cardsNeeded && onConfirm(selected)}
          disabled={selected.length !== cardsNeeded}
          className="w-full mt-4 rounded-xl bg-accent text-on-accent font-bold py-3 disabled:opacity-30 disabled:pointer-events-none"
        >
          確定
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
