"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { SPRING_MOVE, SPRING_SNAPPY } from "@/lib/motion";
import type { PlayerAction } from "@meta-geo/engine";
import { formatAmount, type AmountDisplayMode } from "@/lib/format";
import type { TimeBankInfo } from "@/lib/socket";
import { useI18n } from "@/lib/i18n";
import { Icon } from "./Icon";

interface Preset {
  label: string;
  toAmount: number;
}

/** iOS風のトグルスイッチ。ON時はアクセントのトラック+明るいノブが右へ、OFF時は暗い
 * トラック+くすんだノブが左。補助機能のON/OFFを一目で分かるようにする。 */
function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
        on ? "bg-accent" : "bg-white/15"
      }`}
    >
      <motion.span
        className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${on ? "bg-on-accent" : "bg-n-8"}`}
        animate={{ left: on ? 13 : 2 }}
        transition={SPRING_MOVE}
      />
    </span>
  );
}

/** チェック/フォールド予約のアイコン。角丸のチェックボックスに、Appleのチェックマークと
 *  同じ比率(短い左脚・長い右脚・丸いキャップ)のレ点を入れる。 */
function CheckFoldIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="6" strokeWidth={1.5} opacity="0.5" />
      <path d="M8 12.4l2.7 2.7L16.3 8.9" strokeWidth={2.2} />
    </svg>
  );
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
 * 面は水平のまま(斜めに歪ませない)。立体は、塗りの上下グラデーションと上端の
 * スペキュラ ―― 光が上から当たっている、という一貫した説明だけで作る。
 * 押下は .pressable が触れた瞬間に返すので、影へスラムするような演出は要らない。
 *
 * 色は意味に対応させる: フォールド=青(降りる) / チェック・コール=緑(応答) /
 * ベット・レイズ=赤(強い意思表示)。塗りの濃さは、その上の白文字が読める段を選んである。
 */
const ACTION_TONE_CLASS: Record<"fold" | "call" | "raise", string> = {
  fold: "bg-gradient-to-b from-azure-500 to-azure-600",
  call: "bg-gradient-to-b from-mint-600 to-mint-700",
  raise: "bg-gradient-to-b from-crimson-500 to-crimson-600",
};

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
      className={`pressable relative flex h-[62px] flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl text-white shadow-e2 disabled:pointer-events-none disabled:opacity-30 ${ACTION_TONE_CLASS[tone]}`}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/22 to-transparent" />
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/15" />
      <span className="relative flex flex-col items-center leading-none">{children}</span>
    </button>
  );
}

/**
 * 手番待ち中の予約系ボタン(チェック/フォールド予約・離席)。
 * アクションボタンと同じ寸法・同じ角丸のまま、塗りを持たないガラス面にして
 * 「今は主役ではない」ことを示す。ONの間だけアクセントの縁が点く。
 */
function StandbyButton({
  active,
  onClick,
  ariaLabel,
  children,
}: {
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`pressable relative flex h-[62px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl transition-colors ${
        active
          ? "bg-accent/18 text-accent-hi ring-1 ring-inset ring-accent/60"
          : "bg-white/[0.06] text-fg-2 ring-1 ring-inset ring-white/10"
      }`}
    >
      {children}
    </button>
  );
}

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
    { label: t("action.allInPreset"), toAmount: maxRaiseToAmount },
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
  timeBank,
  onToggleTimeBank,
  onToggleAway,
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
  /** タイムバンク。テーブル上の座席と同じ領域に浮かせて配置すると表示名の長さや
   * ディーラーボタンの位置次第でどうしても干渉してしまうため、干渉しようがない
   * アクションバー側の専用行に置く。 */
  timeBank?: TimeBankInfo | null;
  onToggleTimeBank?: () => void;
  /** 離席状態をサーバーに通知する(全員の座席に「離席中」を表示するため)。 */
  onToggleAway?: (away: boolean) => void;
  /** 卓上の金額表示モード(bb換算/点数)。ベット額入力・プリセット・CALL/RAISE額に反映する。 */
  displayMode?: AmountDisplayMode;
}) {
  const { t } = useI18n();
  const [raiseTo, setRaiseTo] = useState(minRaiseToAmount);
  // ベット額入力欄の「編集中の生文字列」。null=非編集中(raiseToから導出した値を表示)。
  // 以前はonChangeのたびに即クランプしていたため「12」の1文字目で最小額へ丸められ
  // 2桁の数値が実質入力できなかった。編集中は自由に打たせ、確定(blur/Enter)時にだけ丸める。
  const [raiseInput, setRaiseInput] = useState<string | null>(null);
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
      className="flex items-center gap-2 rounded-full glass-panel pl-2 pr-3 h-9 text-[11px] font-bold text-fg shrink-0"
    >
      <Switch on={timeBank.armed} />
      <span>{t("action.timeBank")}</span>
      <span className="flex items-center gap-1 border-l border-white/15 pl-2">
        {timeBank.cards > 0 ? (
          Array.from({ length: timeBank.cards }).map((_, i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-accent" />
          ))
        ) : (
          <span className="text-[11px] text-n-9">{t("action.remaining0")}</span>
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
      className="flex items-center gap-1.5 rounded-full glass-panel pl-2 pr-3 h-9 text-[11px] font-bold text-fg shrink-0"
    >
      <Switch on={away} />
      {t("action.away")}
    </motion.button>
  );

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
  return (
    <div className="safe-area-bottom px-3 pb-4 pt-2">
      <div className="glass-bar mx-auto flex h-[238px] max-w-md flex-col justify-between gap-2.5 rounded-[28px] px-3 py-3">
        {isYourTurn ? (
          <>
            {/* 補助トグル(タイムバンク・離席)。 */}
            <div className="flex h-9 items-center gap-2 overflow-x-auto no-scrollbar">
              {timeBankRow}
              {awayRow}
            </div>

            {/* サイズのプリセット。 */}
            <div className="flex h-10 items-center gap-1.5 overflow-x-auto no-scrollbar">
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
                      className={`pressable shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold tabular-nums transition-colors ${
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
            <div className={`flex h-11 items-center gap-2 ${showRaiseUI ? "" : "invisible"}`}>
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
                className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-fg ring-1 ring-inset ring-white/10"
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
                className="h-11 w-20 shrink-0 rounded-xl bg-white/[0.06] text-center text-base font-semibold tabular-nums text-fg ring-1 ring-inset ring-white/10"
              />
              <button
                type="button"
                onClick={() => stepRaise(1)}
                aria-label={t("action.betPlus")}
                className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-fg ring-1 ring-inset ring-white/10"
              >
                <Icon name="plus" className="h-4 w-4" />
              </button>
            </div>

            {/* 主行動。 */}
            <div className="flex gap-2.5">
              {!canCheck && (
                <ActionButton tone="fold" onClick={() => onAction({ kind: "fold" })}>
                  <span className="text-[17px] font-black tracking-[-0.01em]">{t("action.fold")}</span>
                </ActionButton>
              )}

              <ActionButton tone="call" onClick={() => onAction({ kind: canCheck ? "check" : "call" })}>
                {canCheck ? (
                  <span className="text-[17px] font-black tracking-[-0.01em]">{t("action.check")}</span>
                ) : (
                  <>
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">{t("action.call")}</span>
                    <span className="mt-1 text-[19px] font-black tabular-nums tracking-[-0.01em]">
                      {formatAmount(toCall, bigBlind, displayMode)}
                    </span>
                  </>
                )}
              </ActionButton>

              <ActionButton
                tone="raise"
                disabled={raiseDisabled}
                onClick={() => (canGoAllIn ? onAction({ kind: toCall > 0 ? "raise" : "bet", toAmount: raiseTo }) : undefined)}
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">
                  {raiseTo >= maxRaiseToAmount ? t("action.allInPreset") : isRaiseLabel ? t("action.raise") : t("action.bet")}
                </span>
                <span className="mt-1 text-[19px] font-black tabular-nums tracking-[-0.01em]">
                  {formatAmount(raiseTo >= maxRaiseToAmount ? maxRaiseToAmount : raiseTo, bigBlind, displayMode)}
                </span>
              </ActionButton>
            </div>
          </>
        ) : (
          <>
            {/* 手番待ち。空の行を並べて高さだけ確保するのではなく、この時間にできること
                (次の手番の予約・離席)と、今どういう状態かを見せる。 */}
            <div className="flex h-9 items-center gap-2 overflow-x-auto no-scrollbar">{timeBankRow}</div>

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

            <div className="flex gap-2.5">
              {/* チェック/フォールド予約。次の手番で一度だけ自動で実行する。 */}
              <StandbyButton
                active={checkFoldArmed}
                onClick={() => setCheckFoldArmed((v) => !v)}
                ariaLabel={t("action.armCheckFold")}
              >
                <CheckFoldIcon className="h-[22px] w-[22px]" />
                <span className="text-[11px] font-bold leading-none">{t("action.checkFoldShort")}</span>
              </StandbyButton>

              {/* 離席。手動でOFFにするまで、手番のたびに自動でチェック/フォールドし続ける。 */}
              <StandbyButton
                active={away}
                onClick={() =>
                  setAway((v) => {
                    const next = !v;
                    onToggleAway?.(next);
                    return next;
                  })
                }
                ariaLabel={t("action.away")}
              >
                <AwayIcon className="h-[22px] w-[22px]" />
                <span className="text-[11px] font-bold leading-none">{t("action.away")}</span>
              </StandbyButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
