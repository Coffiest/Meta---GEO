"use client";

import { useEffect, useState } from "react";
import type { PlayerAction } from "@meta-geo/engine";
import { formatBb } from "@/lib/format";

interface Preset {
  label: string;
  toAmount: number;
}

function computePresets(params: {
  toCall: number;
  minRaiseToAmount: number;
  maxRaiseToAmount: number;
  potTotal: number;
  streetContribution: number;
  bigBlind: number;
}): Preset[] {
  const { toCall, minRaiseToAmount, maxRaiseToAmount, potTotal, streetContribution, bigBlind } = params;
  const clamp = (v: number) => Math.min(maxRaiseToAmount, Math.max(minRaiseToAmount, v));

  // 誰もまだ3ベットしていないオープンレイズ想定のスポットでは、bbの倍数プリセットを出す。
  if (toCall <= bigBlind) {
    const amounts = [...new Set([2, 2.3, 2.5, 3, 4, 5].map((mult) => clamp(Math.round(bigBlind * mult))))];
    return amounts.map((amt) => ({ label: formatBb(amt, bigBlind), toAmount: amt }));
  }

  // 誰かが既にレイズしているスポットでは、ポット比率プリセットにする。
  const amounts = [...new Set([0.5, 0.75, 1, 1.5].map((pct) => clamp(Math.round(potTotal * pct) + streetContribution)))];
  return amounts.map((amt) => ({ label: formatBb(amt, bigBlind), toAmount: amt }));
}

export function ActionBar({
  isYourTurn,
  canCheck,
  toCall,
  minRaiseToAmount,
  maxRaiseToAmount,
  potTotal,
  streetContribution,
  canRaise,
  bigBlind,
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
  bigBlind: number;
  onAction: (action: PlayerAction) => void;
}) {
  const [raiseTo, setRaiseTo] = useState(minRaiseToAmount);
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    setRaiseTo(minRaiseToAmount);
    setShowCustom(false);
  }, [minRaiseToAmount, isYourTurn]);

  if (!isYourTurn) {
    return (
      <div className="safe-area-bottom px-4 pb-4 pt-3">
        <div className="mx-auto max-w-md rounded-2xl bg-navy-900/70 ring-1 ring-navy-700/50 py-3 text-center text-xs text-navy-400 tracking-wide">
          相手のアクションを待っています…
        </div>
      </div>
    );
  }

  const canGoAllIn = maxRaiseToAmount > 0;
  const raiseDisabled = !canRaise || minRaiseToAmount > maxRaiseToAmount;
  const presets = computePresets({ toCall, minRaiseToAmount, maxRaiseToAmount, potTotal, streetContribution, bigBlind });
  const clampToRange = (v: number) => Math.min(maxRaiseToAmount, Math.max(minRaiseToAmount, v));

  return (
    <div className="safe-area-bottom px-4 pb-4 pt-3">
      <div className="mx-auto max-w-md space-y-2">
        {!raiseDisabled && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {presets.map((preset) => (
              <button
                key={preset.toAmount}
                onClick={() => setRaiseTo(preset.toAmount)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold tabular-nums transition-colors ${
                  raiseTo === preset.toAmount
                    ? "bg-navy-100 text-navy-950"
                    : "bg-navy-800 text-navy-200 ring-1 ring-navy-600/60"
                }`}
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => setShowCustom((v) => !v)}
              className="shrink-0 rounded-full h-8 w-8 flex items-center justify-center bg-navy-800 text-navy-300 ring-1 ring-navy-600/60"
              aria-label="カスタム額を指定"
            >
              {showCustom ? "︿" : "︾"}
            </button>
          </div>
        )}

        {showCustom && !raiseDisabled && (
          <input
            type="range"
            min={minRaiseToAmount}
            max={Math.max(minRaiseToAmount, maxRaiseToAmount)}
            value={raiseTo}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
            className="w-full accent-crimson-500"
          />
        )}

        <div className="flex gap-2">
          <button
            disabled={raiseDisabled}
            onClick={() => (canGoAllIn ? onAction({ kind: toCall > 0 ? "raise" : "bet", toAmount: raiseTo }) : undefined)}
            className="flex-1 rounded-xl bg-crimson-500 text-white text-sm font-semibold py-3.5 shadow-card active:scale-[0.97] transition-transform disabled:opacity-30 disabled:pointer-events-none"
          >
            {raiseTo >= maxRaiseToAmount ? "オールイン" : `${toCall > 0 ? "レイズ" : "ベット"} ${formatBb(raiseTo, bigBlind)}`}
          </button>
          {!raiseDisabled && (
            <input
              type="number"
              inputMode="decimal"
              step={0.1}
              value={Math.round((raiseTo / (bigBlind || 1)) * 10) / 10}
              onChange={(e) => {
                const bb = Number(e.target.value);
                if (Number.isNaN(bb)) return;
                setRaiseTo(clampToRange(Math.round(bb * bigBlind)));
              }}
              className="w-16 rounded-xl bg-navy-800 text-navy-100 text-sm text-center tabular-nums ring-1 ring-navy-600/60 focus:outline-none focus:ring-mint-500"
            />
          )}
        </div>

        <button
          onClick={() => onAction({ kind: canCheck ? "check" : "call" })}
          className="w-full rounded-xl bg-mint-500 text-white text-sm font-semibold py-3.5 active:scale-[0.97] transition-transform"
        >
          {canCheck ? "チェック" : `コール ${formatBb(toCall, bigBlind)}`}
        </button>

        <button
          onClick={() => onAction({ kind: "fold" })}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-azure-500 text-white text-sm font-medium py-3.5 active:scale-[0.97] transition-transform"
        >
          フォールド
        </button>
      </div>
    </div>
  );
}
