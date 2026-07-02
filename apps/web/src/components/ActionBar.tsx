"use client";

import { useEffect, useState } from "react";
import type { PlayerAction } from "@meta-geo/engine";

export function ActionBar({
  isYourTurn,
  canCheck,
  toCall,
  minRaiseToAmount,
  maxRaiseToAmount,
  potTotal,
  streetContribution,
  canRaise,
  onAction,
}: {
  isYourTurn: boolean;
  canCheck: boolean;
  toCall: number;
  minRaiseToAmount: number;
  maxRaiseToAmount: number;
  potTotal: number;
  streetContribution: number;
  canRaise: boolean;
  onAction: (action: PlayerAction) => void;
}) {
  const [raiseTo, setRaiseTo] = useState(minRaiseToAmount);
  const [showRaise, setShowRaise] = useState(false);

  useEffect(() => {
    setRaiseTo(minRaiseToAmount);
    setShowRaise(false);
  }, [minRaiseToAmount, isYourTurn]);

  if (!isYourTurn) {
    return (
      <div className="safe-area-bottom px-4 pb-4 pt-3">
        <div className="mx-auto max-w-md rounded-2xl bg-ink-900/70 ring-1 ring-ink-700/50 py-3 text-center text-xs text-ink-400 tracking-wide">
          相手のアクションを待っています…
        </div>
      </div>
    );
  }

  const canGoAllIn = maxRaiseToAmount > 0;
  const raiseDisabled = !canRaise || minRaiseToAmount > maxRaiseToAmount;

  const presetPct = (pct: number) => {
    const target = Math.round(potTotal * pct) + streetContribution;
    return Math.min(maxRaiseToAmount, Math.max(minRaiseToAmount, target));
  };

  return (
    <div className="safe-area-bottom px-4 pb-4 pt-3">
      <div className="mx-auto max-w-md space-y-3">
        {showRaise && (
          <div className="rounded-2xl bg-ink-900/90 backdrop-blur ring-1 ring-ink-700/60 p-4 shadow-panel animate-deal-in">
            <div className="flex items-center justify-between text-xs text-ink-300 mb-2">
              <span>レイズ額</span>
              <span className="text-gold-400 font-semibold tabular-nums">{raiseTo.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min={minRaiseToAmount}
              max={Math.max(minRaiseToAmount, maxRaiseToAmount)}
              value={raiseTo}
              onChange={(e) => setRaiseTo(Number(e.target.value))}
              className="w-full accent-gold-500"
            />
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[0.5, 0.75, 1, 1.5].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setRaiseTo(presetPct(pct))}
                  className="rounded-full bg-ink-800 text-ink-200 text-[11px] py-1.5 ring-1 ring-ink-600/60 hover:bg-ink-700 transition-colors"
                >
                  {pct === 1 ? "POT" : `${pct}x`}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setShowRaise(false)}
                className="flex-1 rounded-xl bg-ink-800 text-ink-300 text-sm py-2.5 ring-1 ring-ink-600/60"
              >
                キャンセル
              </button>
              <button
                onClick={() => onAction({ kind: toCall > 0 ? "raise" : "bet", toAmount: raiseTo })}
                className="flex-1 rounded-xl bg-gold-500 text-ink-950 text-sm font-semibold py-2.5 shadow-card active:scale-[0.98] transition-transform"
              >
                {raiseTo >= maxRaiseToAmount ? "オールイン" : "確定"}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => onAction({ kind: "fold" })}
            className="rounded-xl bg-ink-900/80 text-rose-400 text-sm font-medium py-3.5 ring-1 ring-rose-500/25 active:scale-[0.97] transition-transform"
          >
            フォールド
          </button>
          <button
            onClick={() => onAction({ kind: canCheck ? "check" : "call" })}
            className="rounded-xl bg-ink-800 text-ink-50 text-sm font-medium py-3.5 ring-1 ring-ink-600/60 active:scale-[0.97] transition-transform"
          >
            {canCheck ? "チェック" : `コール ${toCall.toLocaleString()}`}
          </button>
          <button
            disabled={raiseDisabled}
            onClick={() => (canGoAllIn ? setShowRaise(true) : undefined)}
            className="rounded-xl bg-gold-500 text-ink-950 text-sm font-semibold py-3.5 shadow-card active:scale-[0.97] transition-transform disabled:opacity-30 disabled:pointer-events-none"
          >
            {toCall > 0 ? "レイズ" : "ベット"}
          </button>
        </div>
      </div>
    </div>
  );
}
