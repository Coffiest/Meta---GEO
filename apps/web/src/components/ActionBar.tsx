"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { PlayerAction } from "@meta-geo/engine";
import { formatBb } from "@/lib/format";
import type { TimeBankInfo } from "@/lib/socket";

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
  timeBank,
  onToggleTimeBank,
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
  /** タイムバンク。テーブル上の座席と同じ領域に浮かせて配置すると表示名の長さや
   * ディーラーボタンの位置次第でどうしても干渉してしまうため、干渉しようがない
   * アクションバー側の専用行に置く。 */
  timeBank?: TimeBankInfo | null;
  onToggleTimeBank?: () => void;
}) {
  const [raiseTo, setRaiseTo] = useState(minRaiseToAmount);
  // 「チェック/フォールドを予約」: 手番でない間にONにしておくと、次に手番が来た瞬間に
  // 一度だけ自動でチェック(できなければフォールド)する。よくあるポーカーアプリの
  // 事前アクション予約と同じく、発火後は自動でOFFに戻る(毎回のハンドで明示的に予約し直す)。
  const [checkFoldArmed, setCheckFoldArmed] = useState(false);
  // 「離席」: ONの間は手番が来るたびに毎回自動でチェック/フォールドし続ける。手動でOFFに
  // するまで持続する点がチェック/フォールド予約(一度きり)との違い。
  const [away, setAway] = useState(false);
  const wasYourTurnRef = useRef(isYourTurn);

  useEffect(() => {
    setRaiseTo(minRaiseToAmount);
  }, [minRaiseToAmount, isYourTurn]);

  // 手番が「来た瞬間」(false→trueに変わった瞬間)だけ発火させる。isYourTurnがtrueの間
  // ずっとレンダリングされ続けても多重発火しないよう、直前の値をrefで見て立ち上がりを検出する。
  useEffect(() => {
    const justBecameYourTurn = isYourTurn && !wasYourTurnRef.current;
    wasYourTurnRef.current = isYourTurn;
    if (!justBecameYourTurn) return;
    if (away || checkFoldArmed) {
      onAction({ kind: canCheck ? "check" : "fold" });
      if (!away) setCheckFoldArmed(false);
    }
  }, [isYourTurn, away, checkFoldArmed, canCheck, onAction]);

  const timeBankRow = timeBank && (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onToggleTimeBank}
      className={`flex items-center gap-1.5 rounded-full px-2.5 h-8 text-[11px] font-semibold transition-colors border ${
        timeBank.armed ? "bg-ink-950 text-white border-ink-950" : "bg-white text-ink-900 border-ink-950"
      }`}
    >
      <span className={`h-3.5 w-3.5 rounded-sm flex items-center justify-center shrink-0 ${timeBank.armed ? "bg-white/20" : "ring-1 ring-ink-400"}`}>
        {timeBank.armed ? "✓" : ""}
      </span>
      タイムバンクを使用({timeBank.cards})
    </motion.button>
  );

  // 「離席」トグル: 席替えボタンなど座席側の要素と同じ空間に置くと表示名の長さ次第で干渉するため、
  // タイムバンクと同じアクションバー側の行に、同じピル型トグルの見た目で並べて配置する。
  const awayRow = (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={() => setAway((v) => !v)}
      className={`flex items-center gap-1.5 rounded-full px-2.5 h-8 text-[11px] font-semibold transition-colors border shrink-0 ${
        away ? "bg-ink-950 text-white border-ink-950" : "bg-white text-ink-900 border-ink-950"
      }`}
    >
      <span className={`h-3.5 w-3.5 rounded-sm flex items-center justify-center shrink-0 ${away ? "bg-white/20" : "ring-1 ring-ink-400"}`}>
        {away ? "✓" : ""}
      </span>
      離席
    </motion.button>
  );

  if (!isYourTurn) {
    return (
      <div className="safe-area-bottom px-4 pb-6 pt-3 bg-white border-t border-ink-200">
        <div className="mx-auto max-w-md space-y-2">
          <div className="flex items-center gap-2">
            {timeBankRow}
            {awayRow}
          </div>
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => setCheckFoldArmed((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 h-8 text-[11px] font-semibold transition-colors border ${
              checkFoldArmed ? "bg-ink-950 text-white border-ink-950" : "bg-white text-ink-900 border-ink-950"
            }`}
          >
            <span
              className={`h-3.5 w-3.5 rounded-sm flex items-center justify-center shrink-0 ${checkFoldArmed ? "bg-white/20" : "ring-1 ring-ink-400"}`}
            >
              {checkFoldArmed ? "✓" : ""}
            </span>
            チェック/フォールドを予約
          </motion.button>
          <div className="rounded-2xl bg-ink-100 py-3 text-center text-xs text-ink-500 tracking-wide">相手のアクションを待っています…</div>
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
  const sliderRange = Math.max(1, maxRaiseToAmount - minRaiseToAmount);
  const sliderPct = Math.min(100, Math.max(0, ((raiseTo - minRaiseToAmount) / sliderRange) * 100));

  return (
    <div className="safe-area-bottom px-4 pb-6 pt-3 bg-white border-t border-ink-200">
      <div className="mx-auto max-w-md space-y-2">
        <div className="flex items-center gap-2">
          {timeBankRow}
          {awayRow}
        </div>

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
          </div>
        )}

        {!raiseDisabled && (
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={minRaiseToAmount}
              max={Math.max(minRaiseToAmount, maxRaiseToAmount)}
              value={raiseTo}
              onChange={(e) => setRaiseTo(Number(e.target.value))}
              className="bet-slider flex-1"
              style={{ background: `linear-gradient(to right, #0a0a0a ${sliderPct}%, #e5e5e5 ${sliderPct}%)` }}
            />
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
              className="w-16 shrink-0 rounded-xl bg-white text-ink-950 text-sm text-center tabular-nums border border-ink-950 focus:outline-none"
            />
          </div>
        )}

        <div className="flex gap-2">
          <button
            disabled={raiseDisabled}
            onClick={() => (canGoAllIn ? onAction({ kind: toCall > 0 ? "raise" : "bet", toAmount: raiseTo }) : undefined)}
            className="flex-1 rounded-xl bg-crimson-500 text-white text-[13px] font-semibold py-3 active:scale-[0.97] transition-transform disabled:opacity-30 disabled:pointer-events-none"
          >
            {raiseTo >= maxRaiseToAmount ? "All In" : `${isRaiseLabel ? "Raise" : "Bet"} ${formatBb(raiseTo, bigBlind)}`}
          </button>

          <button
            onClick={() => onAction({ kind: canCheck ? "check" : "call" })}
            className="flex-1 rounded-xl bg-mint-600 text-white text-[13px] font-semibold py-3 active:scale-[0.97] transition-transform"
          >
            {canCheck ? "Check" : `Call ${formatBb(toCall, bigBlind)}`}
          </button>

          {!canCheck && (
            <button
              onClick={() => onAction({ kind: "fold" })}
              className="flex-1 rounded-xl bg-azure-500 text-white text-[13px] font-medium py-3 active:scale-[0.97] transition-transform"
            >
              Fold
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
