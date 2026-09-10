"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { PlayerAction } from "@meta-geo/engine";
import { formatAmount, type AmountDisplayMode } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Icon } from "./Icon";
import { CheckMark } from "./ui/CheckMark";

interface Preset {
  label: string;
  toAmount: number;
}

/** 離席(away)のアイコン。一時停止(pause)を表すモノクロSVG。 */
function AwayIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <Icon name="pause" className={className} />
  );
}

/**
 * アクションボタン。
 *
 * 面の中を発光する円がゆっくり漂う(意匠の出典: uiverse.io by Ashon-G / CSSは globals.css の
 * `.action-glow`)。色は意味に対応させる: フォールド=青(降りる) / チェック・コール=緑(応答) /
 * ベット・レイズ=赤(強い意思表示)。
 */
function ActionButton({
  tone,
  onClick,
  disabled = false,
  ariaLabel,
  children,
}: {
  tone: "fold" | "call" | "raise";
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={onClick}
      data-tone={tone}
      className="action-glow pressable flex h-[50px] flex-1 items-center justify-center shadow-e2"
    >
      <span aria-hidden className="ag-wrapper">
        <span className="ag-circle ag-1" />
        <span className="ag-circle ag-2" />
        <span className="ag-circle ag-3" />
        <span className="ag-circle ag-4" />
        <span className="ag-circle ag-5" />
      </span>
      <span className="ag-label">{children}</span>
    </button>
  );
}

/**
 * 手番待ち中の予約系トグル(チェック/フォールド予約・離席)。
 *
 * 以前はアクションボタンと同じ 62px の大ボタン2つだったが、それだけで画面の高さを
 * 100px 近く食っていた。卓を大きく見せるほうが優先なので、枠の左右下隅に置く極小の
 * ピルにしてある。ONの間だけアクセント色が点く。
 */
function TinyToggle({
  active,
  onClick,
  ariaLabel,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`pressable absolute bottom-0 flex h-7 items-center gap-1 rounded-full px-2 text-[9px] font-bold leading-none transition-colors ${className} ${
        active ? "bg-accent/20 text-accent-hi ring-1 ring-inset ring-accent/60" : "glass-panel text-fg-3"
      }`}
    >
      {children}
    </button>
  );
}

/* 卓上のアクション名は、意匠として全ロケール共通の英字にする(オーナー指示)。
   読み上げ用の aria-label は t() の各言語のまま残してあるので、
   日本語話者がスクリーンリーダーで使えなくなることはない。 */
const ACTION_EN = {
  fold: "FOLD",
  check: "CHECK",
  call: "CALL",
  bet: "BET",
  raise: "RAISE",
  allIn: "ALL IN",
} as const;

// ポストフロップ(および3ベット以降)のポット比率プリセット。実戦で使うサイズを一通り並べてある。
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
  displayMode: AmountDisplayMode;
  t: (key: string) => string;
}): Preset[] {
  const { street, toCall, minRaiseToAmount, maxRaiseToAmount, potTotal, streetContribution, bigBlind, effectiveStackBehind, displayMode, t } = params;
  const clamp = (v: number) => Math.min(maxRaiseToAmount, Math.max(minRaiseToAmount, v));
  // クランプでAll in(=max)と同額に丸まったプリセットを除外する。末尾に必ずAll inピルを
  // 付けるため、残すと同額の2ピルが同時ハイライトされて紛らわしい。
  const withAllIn = (list: Preset[]): Preset[] => [
    ...list.filter((p) => p.toAmount < maxRaiseToAmount),
    // 「オールイン」だけはアクション名でもあるので、ボタンと同じ英字表記に揃える。
    { label: ACTION_EN.allIn, toAmount: maxRaiseToAmount },
  ];

  // プリフロップでまだ誰もレイズしていない(オープンレイズ想定の)スポットは、bbの倍数プリセット。
  if (street === "preflop" && toCall <= bigBlind) {
    const amounts = [...new Set([2, 2.3, 2.5, 3, 4, 5].map((mult) => clamp(Math.round(bigBlind * mult))))];
    return withAllIn(amounts.map((amt) => ({ label: formatAmount(amt, bigBlind, displayMode), toAmount: amt })));
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
    return withAllIn([...byAmount.entries()].map(([toAmount, label]) => ({ label, toAmount })));
  }

  // それ以外(ポストフロップで自分から先にベットする場面)はポット比率プリセット。
  // ラベルは金額(bb)ではなく比率(%)で表示する(ポットに対する大きさで考える方が判断が速いため)。
  // 複数の比率が最小ベット額に丸め込まれて同額になった場合は、最初の比率だけを残す。
  const byAmount = new Map<number, number>();
  for (const pct of POT_PCT_PRESETS) {
    const amt = clamp(Math.round(potTotal * pct) + streetContribution);
    if (!byAmount.has(amt)) byAmount.set(amt, pct);
  }
  const pctPresets: Preset[] = [...byAmount.entries()].map(([amt, pct]) => ({ label: `${Math.round(pct * 100)}%`, toAmount: amt }));

  const geoAmount = computeGeometricToAmount({ street, potTotal, streetContribution, effectiveStackBehind });
  const geoPreset: Preset[] =
    geoAmount !== null && !byAmount.has(clamp(geoAmount)) ? [{ label: t("action.geometric"), toAmount: clamp(geoAmount) }] : [];

  return withAllIn([...pctPresets, ...geoPreset]);
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
  away,
  onToggleAway,
  checkFoldArmed,
  onToggleCheckFold,
  displayMode = "bb",
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
  /** 「離席」。ONの間は手番が来るたびに毎回自動でチェック/フォールドし続ける。
   * 自席の横のトグルとアクションバーの隅のトグルの両方から触るので、状態は page.tsx が持つ。 */
  away: boolean;
  onToggleAway: (away: boolean) => void;
  /** 「チェック/フォールドを予約」。次に手番が来た瞬間に一度だけ自動で実行し、その後OFFに戻る。 */
  checkFoldArmed: boolean;
  onToggleCheckFold: (armed: boolean) => void;
  /** 卓上の金額表示モード(bb換算/点数)。ベット額入力・プリセット・CALL/RAISE額に反映する。 */
  displayMode?: AmountDisplayMode;
}) {
  const { t } = useI18n();
  const [raiseTo, setRaiseTo] = useState(minRaiseToAmount);
  // ベット額入力欄の「編集中の生文字列」。null=非編集中(raiseToから導出した値を表示)。
  // 以前はonChangeのたびに即クランプしていたため「12」の1文字目で最小額へ丸められ
  // 2桁の数値が実質入力できなかった。編集中は自由に打たせ、確定(blur/Enter)時にだけ丸める。
  const [raiseInput, setRaiseInput] = useState<string | null>(null);
  const wasYourTurnRef = useRef(isYourTurn);

  useEffect(() => {
    setRaiseTo(minRaiseToAmount);
    setRaiseInput(null);
  }, [minRaiseToAmount, isYourTurn]);

  // 手番が「来た瞬間」(false→trueに変わった瞬間)だけ発火させる。isYourTurnがtrueの間
  // ずっとレンダリングされ続けても多重発火しないよう、直前の値をrefで見て立ち上がりを検出する。
  useEffect(() => {
    const justBecameYourTurn = isYourTurn && !wasYourTurnRef.current;
    wasYourTurnRef.current = isYourTurn;
    if (!justBecameYourTurn) return;
    if (away || checkFoldArmed) {
      onAction({ kind: canCheck ? "check" : "fold" });
      if (!away) onToggleCheckFold(false);
    }
  }, [isYourTurn, away, checkFoldArmed, canCheck, onAction, onToggleCheckFold]);

  // プリフロップはブラインドが「最初のベット」に相当するため、常に「レイズ」表記にする。
  const isRaiseLabel = street === "preflop" || toCall > 0;
  const canGoAllIn = maxRaiseToAmount > 0;
  const raiseDisabled = !canRaise || minRaiseToAmount > maxRaiseToAmount;
  // レイズUI(プリセット行+スライダー行)を実際に描画するか。非表示時も行の高さは
  // 確保したまま(invisible)にする — 手番前後・raiseDisabled切替でアクションバーの高さが
  // 変わると、盤面(main flex-1 justify-center)が再センタリングされて画面全体が上下に
  // ジャンプするため。「常に同じ高さ」がこのコンポーネントの最重要不変条件。
  const showRaiseUI = isYourTurn && !raiseDisabled;
  const presets = showRaiseUI
    ? computePresets({ street, toCall, minRaiseToAmount, maxRaiseToAmount, potTotal, streetContribution, bigBlind, effectiveStackBehind, displayMode, t })
    : [];
  const clampToRange = (v: number) => Math.min(maxRaiseToAmount, Math.max(minRaiseToAmount, v));
  const sliderRange = Math.max(1, maxRaiseToAmount - minRaiseToAmount);
  const sliderPct = Math.min(100, Math.max(0, ((raiseTo - minRaiseToAmount) / sliderRange) * 100));

  // ベット額入力欄: 編集中(raiseInput!==null)は生文字列をそのまま表示し、非編集中は
  // raiseToから表示モードに応じた値(bb小数1桁/チップ整数)を導出する。
  const derivedInputValue =
    displayMode === "chips" ? String(Math.round(raiseTo)) : String(Math.round((raiseTo / (bigBlind || 1)) * 10) / 10);
  const inputValue = raiseInput ?? derivedInputValue;
  // 確定(blur/Enter): 数値として解釈できれば範囲内へ丸めて反映、できなければ元の値へ戻す。
  const commitRaiseInput = () => {
    if (raiseInput === null) return;
    const cleaned = raiseInput.replace(/[,\s]/g, "");
    const v = Number(cleaned);
    if (cleaned !== "" && Number.isFinite(v)) {
      const chips = displayMode === "chips" ? Math.round(v) : Math.round(v * bigBlind);
      setRaiseTo(clampToRange(chips));
    }
    setRaiseInput(null);
  };
  // ステッパー(±1bb)。編集中の文字列は破棄して確定値ベースで動かす。
  const stepRaise = (deltaBb: number) => {
    setRaiseInput(null);
    setRaiseTo(clampToRange(raiseTo + deltaBb * bigBlind));
  };

  // アクションバーの高さは常に一定に保つ。盤面(main flex-1 justify-center)は
  // 残りの高さの中央に卓を置くので、バーの高さが変わると画面全体が上下にジャンプする。
  // 「手番待ち」と「手番」で中身は全く別物になるが、外形は 1px も変えない。
  //
  // 高さは 238px から 132px へ詰めてある。実機の実測でヘッダーとこのバーだけで画面の
  // 63% を占めており、卓が本来の 54% の大きさでしか描かれていなかった。補助トグルの行を
  // 自席の横へ追い出し、残る3行を詰めたぶんが、そのまま卓の大きさになる。
  //
  // 待機中はガラスの面を出さない(オーナー指示)。高さは変えないので卓は動かない。
  return (
    <div className="safe-area-bottom px-3 pb-2 pt-1">
      <div
        className={`relative mx-auto flex h-[132px] max-w-md flex-col justify-between gap-[5px] rounded-[24px] px-3 py-2 ${
          isYourTurn ? "glass-bar" : ""
        }`}
      >
        {isYourTurn ? (
          <>
            {/* サイズのプリセット。 */}
            <div className="flex h-7 items-center gap-1.5 overflow-x-auto no-scrollbar">
              {showRaiseUI &&
                presets.map((preset) => {
                  const active = raiseTo === preset.toAmount;
                  return (
                    <button
                      key={preset.label}
                      onClick={() => {
                        setRaiseInput(null);
                        setRaiseTo(preset.toAmount);
                      }}
                      className={`pressable shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums transition-colors ${
                        active
                          ? "bg-accent text-on-accent shadow-glow-sm"
                          : "bg-white/[0.08] text-fg-2 ring-1 ring-inset ring-white/10"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
            </div>

            {/* 金額: スライダーで大きく動かし、ステッパーで1bbずつ詰める。 */}
            <div className={`flex h-8 items-center gap-1.5 ${showRaiseUI ? "" : "invisible"}`}>
              <input
                type="range"
                min={minRaiseToAmount}
                max={Math.max(minRaiseToAmount, maxRaiseToAmount)}
                value={clampToRange(raiseTo)}
                onChange={(e) => {
                  setRaiseInput(null);
                  setRaiseTo(Number(e.target.value));
                }}
                aria-label={t("action.betAmount")}
                className="bet-slider min-w-0 flex-1"
                style={{ background: `linear-gradient(to right, rgb(var(--accent)) ${sliderPct}%, rgb(255 255 255 / 0.14) ${sliderPct}%)` }}
              />
              <button
                type="button"
                onClick={() => stepRaise(-1)}
                aria-label={t("action.betMinus")}
                className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-fg ring-1 ring-inset ring-white/10"
              >
                <Icon name="minus" className="h-4 w-4" />
              </button>
              <input
                type="text"
                inputMode={displayMode === "chips" ? "numeric" : "decimal"}
                value={inputValue}
                onChange={(e) => setRaiseInput(e.target.value)}
                onFocus={(e) => e.target.select()}
                onBlur={commitRaiseInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                aria-label={t("action.betAmount")}
                className="h-8 w-16 shrink-0 rounded-lg bg-white/[0.06] text-center text-base font-semibold tabular-nums text-fg ring-1 ring-inset ring-white/10"
              />
              <button
                type="button"
                onClick={() => stepRaise(1)}
                aria-label={t("action.betPlus")}
                className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-fg ring-1 ring-inset ring-white/10"
              >
                <Icon name="plus" className="h-4 w-4" />
              </button>
            </div>

            {/* 主行動。表記は英字で統一し、読み上げは aria-label で各言語のまま残す。 */}
            <div className="flex gap-2">
              {!canCheck && (
                <ActionButton tone="fold" ariaLabel={t("action.fold")} onClick={() => onAction({ kind: "fold" })}>
                  <span className="text-[15px] font-black tracking-[0.08em]">{ACTION_EN.fold}</span>
                </ActionButton>
              )}

              <ActionButton
                tone="call"
                ariaLabel={canCheck ? t("action.check") : t("action.call")}
                onClick={() => onAction({ kind: canCheck ? "check" : "call" })}
              >
                {canCheck ? (
                  <span className="text-[15px] font-black tracking-[0.08em]">{ACTION_EN.check}</span>
                ) : (
                  <>
                    <span className="text-[9px] font-bold tracking-[0.16em] opacity-80">{ACTION_EN.call}</span>
                    <span className="mt-0.5 text-[16px] font-black tabular-nums tracking-[-0.01em]">
                      {formatAmount(toCall, bigBlind, displayMode)}
                    </span>
                  </>
                )}
              </ActionButton>

              <ActionButton
                tone="raise"
                disabled={raiseDisabled}
                ariaLabel={
                  raiseTo >= maxRaiseToAmount ? t("action.allInPreset") : isRaiseLabel ? t("action.raise") : t("action.bet")
                }
                onClick={() => (canGoAllIn ? onAction({ kind: toCall > 0 ? "raise" : "bet", toAmount: raiseTo }) : undefined)}
              >
                <span className="text-[9px] font-bold tracking-[0.16em] opacity-80">
                  {raiseTo >= maxRaiseToAmount ? ACTION_EN.allIn : isRaiseLabel ? ACTION_EN.raise : ACTION_EN.bet}
                </span>
                <span className="mt-0.5 text-[16px] font-black tabular-nums tracking-[-0.01em]">
                  {formatAmount(raiseTo >= maxRaiseToAmount ? maxRaiseToAmount : raiseTo, bigBlind, displayMode)}
                </span>
              </ActionButton>
            </div>
          </>
        ) : (
          <>
            {/* 手番待ち。枠は出さない(星空がそのまま透ける)。高さだけは手番中と揃えてあるので、
                手番が回ってきても卓の位置と大きさは 1px も動かない。 */}
            <div className="flex flex-1 flex-col items-center justify-center gap-2">
              <span className="flex items-center gap-1.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-accent"
                    animate={{ opacity: [0.25, 1, 0.25] }}
                    transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
                  />
                ))}
              </span>
              <span className="text-[11px] font-semibold tracking-wide text-fg-3">{t("action.waiting")}</span>
            </div>

            {/* 次の手番で一度だけ自動実行する予約。左下の隅に極小で置く。 */}
            <TinyToggle
              className="left-0"
              active={checkFoldArmed}
              onClick={() => onToggleCheckFold(!checkFoldArmed)}
              ariaLabel={t("action.armCheckFold")}
            >
              <CheckMark on={checkFoldArmed} className="h-3.5 w-3.5" />
              <span>{t("action.checkFoldShort")}</span>
            </TinyToggle>

            {/* 離席。手動でOFFにするまで、手番のたびに自動でチェック/フォールドし続ける。 */}
            <TinyToggle
              className="right-0"
              active={away}
              onClick={() => onToggleAway(!away)}
              ariaLabel={t("action.away")}
            >
              <AwayIcon className="h-3.5 w-3.5" />
              <span>{t("action.away")}</span>
            </TinyToggle>
          </>
        )}
      </div>
    </div>
  );
}
