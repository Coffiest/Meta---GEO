"use client";

import { useState } from "react";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS: { key: string; symbol: string; colorClass: string }[] = [
  { key: "s", symbol: "♠", colorClass: "text-suit-s" },
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-navy-900 ring-1 ring-navy-700 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-navy-100">
            ボードカードを選択({selected.length}/{cardsNeeded})
          </p>
          <button onClick={onClose} className="text-navy-400 text-xs">
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
                  <button
                    key={card}
                    disabled={isUsed}
                    onClick={() => toggle(card)}
                    className={`aspect-[3/4] rounded flex flex-col items-center justify-center text-[10px] font-bold transition-colors ${
                      isUsed
                        ? "bg-navy-800/40 text-navy-700 cursor-not-allowed"
                        : isSelected
                          ? "bg-gold-500 text-navy-950 ring-2 ring-white"
                          : "bg-navy-800 ring-1 ring-navy-600/60 " + suit.colorClass
                    }`}
                  >
                    <span>{rank}</span>
                    <span>{suit.symbol}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <button
          onClick={() => selected.length === cardsNeeded && onConfirm(selected)}
          disabled={selected.length !== cardsNeeded}
          className="w-full mt-4 rounded-xl bg-gold-500 text-navy-950 font-semibold py-3 disabled:opacity-30 disabled:pointer-events-none"
        >
          確定
        </button>
      </div>
    </div>
  );
}
