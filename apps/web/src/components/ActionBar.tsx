"use client";

import { useEffect, useState } from "react";
import type { PlayerAction } from "@meta-geo/engine";
import { formatBb } from "@/lib/format";

interface Preset {
  label: string;
  toAmount: number;
}

// ポストフロップ(および3ベット以降)のポット比率プリセット。TenFourPokerに合わせてある。
const POT_PCT_PRESETS = [0.1, 0.2, 0.33, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5];

const STREETS_REMAINING: Record<string, number> = { flop: 3, turn: 2, river: 1 };

/**
 * ジオメトリックベットサイズ: 各ストリートで同じ比率のポットベットを続けた場合に
 * リバーでちょうどオールインになるサイズ。
 *   growthFactor = (pot + 2*stack) / pot
 *   fraction = 0.5 * (growthFactor^(1/残りストリート数) - 1)
 * (出典: GTO Wizard "Pot Geometry" / Run It Once "How to solve for Geometric Bet Sizing")
 */
function computeGeometricToAmount(params: {
  street: string;
  potTotal: number;
  streetContribution: number;
  maxRaiseToAmount: number;
}): number | null {
  const { street, potTotal, streetContribution, maxRaiseToAmount } = params;
  const streetsRemaining = STREETS_REMAINING[street];
  if (!streetsRemaining || potTotal <= 0) return null;
  const behindStack = maxRaiseToAmount - streetContribution;
  if (behindStack <= 0) return null;

  const growthFactor = (potTotal + 2 * behindStack) / potTotal;
  const fraction = 0.5 * (Math.pow(growthFactor, 1 / streetsRemaining) - 1);
  return Math.round(potTotal * fraction) + streetContribution;
}

function computePresets(params: {
  street: string;
  toCall: number;
  minRaiseToAmount: number;
  maxRaiseToAmount: number;
  potTotal: number;
  streetContribution: number;
  bigBlind: number;
}): Preset[] {
  const { street, toCall, minRaiseToAmount, maxRaiseToAmount, potTotal, streetContribution, bigBlind } = params;
  const clamp = (v: number) => Math.min(maxRaiseToAmount, Math.max(minRaiseToAmount, v));

  // プリフロップでまだ誰もレイズしていない(オープンレイズ想定の)スポットは、bbの倍数プリセット。
  if (street === "preflop" && toCall <= bigBlind) {
    const amounts = [...new Set([2, 2.3, 2.5, 3, 4, 5].map((mult) => clamp(Math.round(bigBlind * mult))))];
    return [
      ...amounts.map((amt) => ({ label: formatBb(amt, bigBlind), toAmount: amt })),
      { label: "オールイン", toAmount: maxRaiseToAmount },
    ];
  }

  // それ以外(ポストフロップ全般、およびプリフロップの3ベット以降)はポット比率プリセット。
  // ラベルは金額(bb)ではなく比率(%)で表示する(TenFourPokerに合わせてある)。
  // 複数の比率が最小ベット額に丸め込まれて同額になった場合は、最初の比率だけを残す。
  const byAmount = new Map<number, number>();
  for (const pct of POT_PCT_PRESETS) {
    const amt = clamp(Math.round(potTotal * pct) + streetContribution);
    if (!byAmount.has(amt)) byAmount.set(amt, pct);
  }
  const pctPresets: Preset[] = [...byAmount.entries()].map(([amt, pct]) => ({ label: `${Math.round(pct * 100)}%`, toAmount: amt }));

  const geoAmount = computeGeometricToAmount({ street, potTotal, streetContribution, maxRaiseToAmount });
  const geoPreset: Preset[] =
    geoAmount !== null && !byAmount.has(clamp(geoAmount)) ? [{ label: "ジオメトリック", toAmount: clamp(geoAmount) }] : [];

  return [...pctPresets, ...geoPreset, { label: "オールイン", toAmount: maxRaiseToAmount }];
}

export function ActionBar({
  isYourTurn,
  street,
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
  street: string;
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
      <div className="safe-area-bottom px-4 pb-4 pt-3 bg-white border-t border-ink-200">
        <div className="mx-auto max-w-md rounded-2xl bg-ink-100 py-3 text-center text-xs text-ink-500 tracking-wide">
          相手のアクションを待っています…
        </div>
      </div>
    );
  }

  // プリフロップはブラインドが「最初のベット」に相当するため、常に「レイズ」表記にする。
  const isRaiseLabel = street === "preflop" || toCall > 0;
  const canGoAllIn = maxRaiseToAmount > 0;
  const raiseDisabled = !canRaise || minRaiseToAmount > maxRaiseToAmount;
  const presets = computePresets({ street, toCall, minRaiseToAmount, maxRaiseToAmount, potTotal, streetContribution, bigBlind });
  const clampToRange = (v: number) => Math.min(maxRaiseToAmount, Math.max(minRaiseToAmount, v));

  return (
    <div className="safe-area-bottom px-4 pb-4 pt-3 bg-white border-t border-ink-200">
      <div className="mx-auto max-w-md space-y-2">
        {!raiseDisabled && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => setRaiseTo(preset.toAmount)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold tabular-nums border transition-colors ${
                  raiseTo === preset.toAmount
                    ? "bg-ink-950 text-white border-ink-950"
                    : "bg-white text-ink-800 border-ink-950"
                }`}
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => setShowCustom((v) => !v)}
              className="shrink-0 rounded-full h-8 w-8 flex items-center justify-center bg-white text-ink-800 border border-ink-950"
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
            className="flex-1 rounded-xl bg-crimson-500 text-white text-sm font-semibold py-3.5 active:scale-[0.97] transition-transform disabled:opacity-30 disabled:pointer-events-none"
          >
            {raiseTo >= maxRaiseToAmount ? "オールイン" : `${isRaiseLabel ? "レイズ" : "ベット"} ${formatBb(raiseTo, bigBlind)}`}
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
              className="w-16 rounded-xl bg-white text-ink-950 text-sm text-center tabular-nums border border-ink-950 focus:outline-none"
            />
          )}
        </div>

        <button
          onClick={() => onAction({ kind: canCheck ? "check" : "call" })}
          className="w-full rounded-xl bg-mint-600 text-white text-sm font-semibold py-3.5 active:scale-[0.97] transition-transform"
        >
          {canCheck ? "チェック" : `コール ${formatBb(toCall, bigBlind)}`}
        </button>

        {!canCheck && (
          <button
            onClick={() => onAction({ kind: "fold" })}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-azure-500 text-white text-sm font-medium py-3.5 active:scale-[0.97] transition-transform"
          >
            フォールド
          </button>
        )}
      </div>
    </div>
  );
}
