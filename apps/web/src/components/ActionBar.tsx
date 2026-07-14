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

/** iOS風のトグルスイッチ(黒枠線・非シェーディング)。ON時は黒トラック+白ノブが右へ、
 * OFF時は白トラック+グレーノブが左。補助機能のON/OFFを一目で分かるようにする。 */
function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={`relative h-4 w-7 shrink-0 rounded-full border transition-colors ${
        on ? "border-ink-950 bg-ink-950" : "border-ink-400 bg-white"
      }`}
    >
      <motion.span
        className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${on ? "bg-white" : "bg-ink-400"}`}
        animate={{ left: on ? 13 : 2 }}
        transition={{ type: "spring", stiffness: 520, damping: 30 }}
      />
    </span>
  );
}

/** チェック/フォールド予約(x/f)のアイコン。チェック記号にスラッシュを重ねたモノクロSVG。 */
function CheckFoldIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 12.5l4 4L20 5" />
      <path d="M5 20L19 6" strokeWidth={1.6} />
    </svg>
  );
}

/** 離席(away)のアイコン。一時停止(pause)を表すモノクロSVG。 */
function AwayIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className}>
      <path d="M9 5v14M15 5v14" />
    </svg>
  );
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
  effectiveStackBehind: number;
}): number | null {
  const { street, potTotal, streetContribution, effectiveStackBehind } = params;
  const streetsRemaining = STREETS_REMAINING[street];
  if (!streetsRemaining || potTotal <= 0) return null;
  // 「まだ賭けられる有効スタック」= ハンドに残っている全プレイヤーのうち最小の残りスタック
  // (=エフェクティブスタック)。これがリバーでちょうどオールインになる比率を求める。
  // 自分のスタックではなく相手を含めた最小スタックを使うことで、相手が自分より短い場合に
  // 過大なベットにならず、正しく「二人が同時にオールインになる」サイズになる。
  const behindStack = effectiveStackBehind;
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
  effectiveStackBehind: number;
}): Preset[] {
  const { street, toCall, minRaiseToAmount, maxRaiseToAmount, potTotal, streetContribution, bigBlind, effectiveStackBehind } = params;
  const clamp = (v: number) => Math.min(maxRaiseToAmount, Math.max(minRaiseToAmount, v));

  // プリフロップでまだ誰もレイズしていない(オープンレイズ想定の)スポットは、bbの倍数プリセット。
  if (street === "preflop" && toCall <= bigBlind) {
    const amounts = [...new Set([2, 2.3, 2.5, 3, 4, 5].map((mult) => clamp(Math.round(bigBlind * mult))))];
    return [
      ...amounts.map((amt) => ({ label: formatBb(amt, bigBlind), toAmount: amt })),
      { label: "オールイン", toAmount: maxRaiseToAmount },
    ];
  }

  // 相手のベット/レイズに直面している場面(toCall > 0)は、相手のベット/レイズ額に対する
  // 倍率(×2〜×6)でレイズサイズを選ぶ。currentBet(=このストリートの現在のベット額)に倍率を掛ける。
  if (toCall > 0) {
    const currentBet = toCall + streetContribution;
    const byAmount = new Map<number, string>();
    for (const mult of [2, 2.5, 3, 4, 5, 6]) {
      const amt = clamp(Math.round(currentBet * mult));
      if (!byAmount.has(amt)) byAmount.set(amt, `×${mult}`);
    }
    return [
      ...[...byAmount.entries()].map(([toAmount, label]) => ({ label, toAmount })),
      { label: "All in", toAmount: maxRaiseToAmount },
    ];
  }

  // それ以外(ポストフロップで自分から先にベットする場面)はポット比率プリセット。
  // ラベルは金額(bb)ではなく比率(%)で表示する(TenFourPokerに合わせてある)。
  // 複数の比率が最小ベット額に丸め込まれて同額になった場合は、最初の比率だけを残す。
  const byAmount = new Map<number, number>();
  for (const pct of POT_PCT_PRESETS) {
    const amt = clamp(Math.round(potTotal * pct) + streetContribution);
    if (!byAmount.has(amt)) byAmount.set(amt, pct);
  }
  const pctPresets: Preset[] = [...byAmount.entries()].map(([amt, pct]) => ({ label: `${Math.round(pct * 100)}%`, toAmount: amt }));

  const geoAmount = computeGeometricToAmount({ street, potTotal, streetContribution, effectiveStackBehind });
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
  effectiveStackBehind,
  onAction,
  timeBank,
  onToggleTimeBank,
  onToggleAway,
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
  /** ハンドに残っている全プレイヤーのうち最小の残りスタック(=エフェクティブスタック)。
   * ジオメトリックサイズをこの値基準で計算する。 */
  effectiveStackBehind: number;
  onAction: (action: PlayerAction) => void;
  /** タイムバンク。テーブル上の座席と同じ領域に浮かせて配置すると表示名の長さや
   * ディーラーボタンの位置次第でどうしても干渉してしまうため、干渉しようがない
   * アクションバー側の専用行に置く。 */
  timeBank?: TimeBankInfo | null;
  onToggleTimeBank?: () => void;
  /** 離席状態をサーバーに通知する(全員の座席に「離席中」を表示するため)。 */
  onToggleAway?: (away: boolean) => void;
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

  // タイムバンク: Switchで使用ON/OFF、残り枚数はピップ(丸ドット)で視覚化。ドット数=残り枚数。
  const timeBankRow = timeBank && (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.96 }}
      onClick={onToggleTimeBank}
      className="flex items-center gap-2 rounded-full border border-ink-950 bg-white pl-2 pr-3 h-9 text-[11px] font-bold text-ink-900 shrink-0"
    >
      <Switch on={timeBank.armed} />
      <span>タイムバンク</span>
      <span className="flex items-center gap-1 border-l border-ink-200 pl-2">
        {timeBank.cards > 0 ? (
          Array.from({ length: timeBank.cards }).map((_, i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-ink-950" />
          ))
        ) : (
          <span className="text-[10px] text-ink-400">残0</span>
        )}
      </span>
    </motion.button>
  );

  // 「離席」トグル: Switchで表示。ONでサーバーへ通知し、全員の座席に「離席中」を表示する。
  const awayRow = (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.96 }}
      onClick={() =>
        setAway((v) => {
          const next = !v;
          onToggleAway?.(next);
          return next;
        })
      }
      className="flex items-center gap-1.5 rounded-full border border-ink-950 bg-white pl-2 pr-3 h-9 text-[11px] font-bold text-ink-900 shrink-0"
    >
      <Switch on={away} />
      離席
    </motion.button>
  );

  if (!isYourTurn) {
    // 手番待ち中も、アクションボタンと同じ丸型ボタンを表示する(「待っています」テキストは廃止)。
    // 左=x/f(チェック/フォールド予約)、中央=白い非活性プレースホルダ、右=離席トグル。
    // 黒枠線+白のApple風で目立たない配色にし、手番が来たら下の色付きボタンに切り替わる。
    return (
      <div className="safe-area-bottom px-4 pb-10 pt-3 bg-white border-t border-ink-200">
        <div className="mx-auto max-w-md space-y-2.5">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">{timeBankRow}</div>

          <div className="flex gap-2.5">
            {/* x/f 予約(普段フォールドがある左スロット) */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setCheckFoldArmed((v) => !v)}
              aria-label="チェック/フォールドを予約"
              className={`flex-1 min-h-[60px] flex flex-col items-center justify-center gap-0.5 rounded-full border transition-colors ${
                checkFoldArmed ? "border-ink-950 bg-ink-950 text-white" : "border-ink-300 bg-white text-ink-400"
              }`}
            >
              <CheckFoldIcon className="h-[18px] w-[18px]" />
              <span className="text-[11px] font-black tracking-wide">x / f</span>
            </motion.button>

            {/* 中央: 手番待ちの非活性プレースホルダ(真っ白・押せない) */}
            <div className="flex-1 min-h-[60px] flex items-center justify-center rounded-full border border-ink-200 bg-white text-ink-300">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-ink-300"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
                  />
                ))}
              </span>
            </div>

            {/* 離席トグル(普段レイズがある右スロット) */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() =>
                setAway((v) => {
                  const next = !v;
                  onToggleAway?.(next);
                  return next;
                })
              }
              aria-label="離席"
              className={`flex-1 min-h-[60px] flex flex-col items-center justify-center gap-0.5 rounded-full border transition-colors ${
                away ? "border-ink-950 bg-ink-950 text-white" : "border-ink-300 bg-white text-ink-400"
              }`}
            >
              <AwayIcon className="h-[18px] w-[18px]" />
              <span className="text-[11px] font-black tracking-wide">離席</span>
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  // プリフロップはブラインドが「最初のベット」に相当するため、常に「レイズ」表記にする。
  const isRaiseLabel = street === "preflop" || toCall > 0;
  const canGoAllIn = maxRaiseToAmount > 0;
  const raiseDisabled = !canRaise || minRaiseToAmount > maxRaiseToAmount;
  const presets = computePresets({ street, toCall, minRaiseToAmount, maxRaiseToAmount, potTotal, streetContribution, bigBlind, effectiveStackBehind });
  const clampToRange = (v: number) => Math.min(maxRaiseToAmount, Math.max(minRaiseToAmount, v));
  const sliderRange = Math.max(1, maxRaiseToAmount - minRaiseToAmount);
  const sliderPct = Math.min(100, Math.max(0, ((raiseTo - minRaiseToAmount) / sliderRange) * 100));

  return (
    <div className="safe-area-bottom px-4 pb-10 pt-3 bg-white border-t border-ink-200">
      <div className="mx-auto max-w-md space-y-2.5">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
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

        {/* ボタン配置: 左=パッシブ(フォールド)、中央=コール/チェック、右=アクティブ(ベット/レイズ)。
            丸型(rounded-full)+極太の黒枠+大胆なタイポのペルソナ5風。押下時は大きく弾ませる。 */}
        <div className="flex gap-2.5">
          {!canCheck && (
            <motion.button
              whileTap={{ scale: 0.88, rotate: -2 }}
              transition={{ type: "spring", stiffness: 600, damping: 18 }}
              onClick={() => onAction({ kind: "fold" })}
              className="flex-1 min-h-[62px] flex items-center justify-center rounded-full bg-azure-500 text-white ring-2 ring-ink-950 transition-transform"
            >
              <span className="text-[16px] font-black uppercase tracking-[0.08em] leading-tight">Fold</span>
            </motion.button>
          )}

          <motion.button
            whileTap={{ scale: 0.88, rotate: canCheck ? 0 : 2 }}
            transition={{ type: "spring", stiffness: 600, damping: 18 }}
            onClick={() => onAction({ kind: canCheck ? "check" : "call" })}
            className="flex-1 min-h-[62px] flex flex-col items-center justify-center rounded-full bg-mint-600 text-white ring-2 ring-ink-950 transition-transform"
          >
            {canCheck ? (
              <span className="text-[16px] font-black uppercase tracking-[0.08em] leading-tight">Check</span>
            ) : (
              <>
                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-white/80">Call</span>
                <span className="text-[16px] font-black tabular-nums leading-tight">{formatBb(toCall, bigBlind)}</span>
              </>
            )}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.88, rotate: 2 }}
            transition={{ type: "spring", stiffness: 600, damping: 18 }}
            disabled={raiseDisabled}
            onClick={() => (canGoAllIn ? onAction({ kind: toCall > 0 ? "raise" : "bet", toAmount: raiseTo }) : undefined)}
            className="flex-1 min-h-[62px] flex flex-col items-center justify-center rounded-full bg-crimson-500 text-white ring-2 ring-ink-950 transition-transform disabled:opacity-30 disabled:pointer-events-none"
          >
            <span className="text-[9px] font-black uppercase tracking-[0.16em] text-white/80">
              {raiseTo >= maxRaiseToAmount ? "All In" : isRaiseLabel ? "Raise" : "Bet"}
            </span>
            <span className="text-[16px] font-black tabular-nums leading-tight">
              {formatBb(raiseTo >= maxRaiseToAmount ? maxRaiseToAmount : raiseTo, bigBlind)}
            </span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
