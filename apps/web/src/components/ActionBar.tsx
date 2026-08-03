"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { PlayerAction } from "@meta-geo/engine";
import { formatAmount, type AmountDisplayMode } from "@/lib/format";
import type { TimeBankInfo } from "@/lib/socket";
import { useI18n } from "@/lib/i18n";

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
        on ? "border-ink-950 bg-ink-950" : "border-ink-500 bg-white"
      }`}
    >
      <motion.span
        className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${on ? "bg-white" : "bg-ink-500"}`}
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

/** ペルソナ5風のアクションボタン。斜めに歪んだ平行四辺形+黒のハードなオフセット影+
 * 太いイタリック体で、押すと影へスラムする(translate)攻めた見た目にする。中身は逆方向に
 * カウンタースキューして水平に保つ。tone=fold(青)/call(緑)/raise(赤)で意味を色分けする。 */
const P5_TONE_CLASS: Record<"fold" | "call" | "raise", string> = {
  fold: "bg-azure-500",
  call: "bg-mint-600",
  raise: "bg-crimson-500",
};

function P5Button({
  tone,
  onClick,
  disabled = false,
  tapRotate = 0,
  ariaLabel,
  children,
}: {
  tone: "fold" | "call" | "raise";
  onClick?: () => void;
  disabled?: boolean;
  tapRotate?: number;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.94, rotate: tapRotate }}
      transition={{ type: "spring", stiffness: 600, damping: 18 }}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={onClick}
      className="group relative min-h-[64px] flex-1 disabled:pointer-events-none disabled:opacity-30"
    >
      {/* 黒のオフセット影(平行四辺形)。押下時は影へ重なるようにフェイスがずれる。 */}
      <span aria-hidden className="absolute inset-0 bg-ink-950" style={{ transform: "translate(5px, 5px) skewX(-9deg)" }} />
      <span
        className={`absolute inset-0 flex flex-col items-center justify-center overflow-hidden border-[2.5px] border-ink-950 text-white ${P5_TONE_CLASS[tone]}`}
        style={{ transform: "skewX(-9deg)" }}
      >
        {/* 左肩の白いスリット(P5的なエッジハイライト) */}
        <span aria-hidden className="absolute left-0 top-0 h-full w-7 bg-white/15" style={{ transform: "skewX(-9deg) translateX(-6px)" }} />
        <span className="flex flex-col items-center leading-none" style={{ transform: "skewX(9deg)" }}>
          {children}
        </span>
      </span>
    </motion.button>
  );
}

/** 手番待ち中の控えめなボタン。P5Buttonと同じ平行四辺形の輪郭を保ちつつ、色塗り・オフセット影を
 * 省いて枠線のみの静かな見た目にする(手番が来ると同じシルエットが色付きP5ボタンへ“起動”する)。 */
function P5GhostButton({
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
    <motion.button
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 600, damping: 18 }}
      onClick={onClick}
      aria-label={ariaLabel}
      className="relative min-h-[64px] flex-1"
    >
      <span
        className={`absolute inset-0 flex flex-col items-center justify-center gap-0.5 overflow-hidden border-2 transition-colors ${
          active ? "border-ink-950 bg-ink-950 text-white" : "border-ink-500 bg-white text-ink-600"
        }`}
        style={{ transform: "skewX(-9deg)" }}
      >
        <span className="flex flex-col items-center gap-0.5" style={{ transform: "skewX(9deg)" }}>
          {children}
        </span>
      </span>
    </motion.button>
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
      className="flex items-center gap-2 rounded-full border border-ink-950 bg-white pl-2 pr-3 h-9 text-[11px] font-bold text-ink-900 shrink-0"
    >
      <Switch on={timeBank.armed} />
      <span>{t("action.timeBank")}</span>
      <span className="flex items-center gap-1 border-l border-ink-400 pl-2">
        {timeBank.cards > 0 ? (
          Array.from({ length: timeBank.cards }).map((_, i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-ink-950" />
          ))
        ) : (
          <span className="text-[11px] text-ink-600">{t("action.remaining0")}</span>
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

  // 常に同一の4行構造(トグル行/プリセット行/スライダー行/ボタン行)を同じ高さで描画し、
  // 状態(手番待ち/手番/レイズ不可)では中身だけを差し替える。行の増減は絶対にしない。
  return (
    <div className="safe-area-bottom px-4 pb-10 pt-3 bg-white border-t border-ink-400">
      <div className="mx-auto max-w-md space-y-2.5">
        {/* 行1: トグル行(常に h-9)。タイムバンク未提供の卓でも高さは保つ。 */}
        <div className="flex h-9 items-center gap-2 overflow-x-auto no-scrollbar">
          {timeBankRow}
          {isYourTurn && awayRow}
        </div>

        {/* 行2: プリセットpill行(常に h-10。レイズUIが無い間は空のまま高さだけ確保) */}
        <div className="flex h-10 items-center gap-1.5 overflow-x-auto no-scrollbar">
          {showRaiseUI &&
            presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  setRaiseInput(null);
                  setRaiseTo(preset.toAmount);
                }}
                className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold tabular-nums border transition-colors ${
                  raiseTo === preset.toAmount
                    ? "bg-ink-950 text-white border-ink-950"
                    : "bg-white text-ink-800 border-ink-950"
                }`}
              >
                {preset.label}
              </button>
            ))}
        </div>

        {/* 行3: スライダー+ステッパー+数値入力(常に h-11)。invisible時はフォーカスも当たらない。 */}
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
            style={{ background: `linear-gradient(to right, #0a0a0a ${sliderPct}%, #d4d4d4 ${sliderPct}%)` }}
          />
          <button
            type="button"
            onClick={() => stepRaise(-1)}
            aria-label={t("action.betMinus")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ink-950 bg-white text-ink-950 transition-transform active:scale-95"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
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
            className="h-11 w-20 shrink-0 rounded-xl border border-ink-950 bg-white text-center text-base font-semibold tabular-nums text-ink-950"
          />
          <button
            type="button"
            onClick={() => stepRaise(1)}
            aria-label={t("action.betPlus")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ink-950 bg-white text-ink-950 transition-transform active:scale-95"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {/* 行4: ボタン行(常に min-h-[64px])。
            手番待ち: 左=x/f予約、中央=非活性プレースホルダ、右=離席トグル(枠線のみのゴースト)。
            手番: 左=フォールド、中央=コール/チェック、右=ベット/レイズ(P5風の色付きボタン)。 */}
        {isYourTurn ? (
          <div className="flex gap-3">
            {!canCheck && (
              <P5Button tone="fold" tapRotate={-2} onClick={() => onAction({ kind: "fold" })}>
                <span className="text-[20px] font-black italic uppercase tracking-[0.06em]">Fold</span>
              </P5Button>
            )}

            <P5Button tone="call" tapRotate={canCheck ? 0 : 2} onClick={() => onAction({ kind: canCheck ? "check" : "call" })}>
              {canCheck ? (
                <span className="text-[20px] font-black italic uppercase tracking-[0.06em]">Check</span>
              ) : (
                <>
                  <span className="text-[10px] font-black italic uppercase tracking-[0.16em] text-white/85">Call</span>
                  <span className="mt-0.5 text-[20px] font-black italic tabular-nums">{formatAmount(toCall, bigBlind, displayMode)}</span>
                </>
              )}
            </P5Button>

            <P5Button
              tone="raise"
              tapRotate={2}
              disabled={raiseDisabled}
              onClick={() => (canGoAllIn ? onAction({ kind: toCall > 0 ? "raise" : "bet", toAmount: raiseTo }) : undefined)}
            >
              <span className="text-[10px] font-black italic uppercase tracking-[0.16em] text-white/85">
                {raiseTo >= maxRaiseToAmount ? "All In" : isRaiseLabel ? "Raise" : "Bet"}
              </span>
              <span className="mt-0.5 text-[20px] font-black italic tabular-nums">
                {formatAmount(raiseTo >= maxRaiseToAmount ? maxRaiseToAmount : raiseTo, bigBlind, displayMode)}
              </span>
            </P5Button>
          </div>
        ) : (
          <div className="flex gap-3">
            {/* x/f 予約(普段フォールドがある左スロット) */}
            <P5GhostButton active={checkFoldArmed} onClick={() => setCheckFoldArmed((v) => !v)} ariaLabel={t("action.armCheckFold")}>
              <CheckFoldIcon className="h-[18px] w-[18px]" />
              <span className="text-[11px] font-black italic tracking-wide">x / f</span>
            </P5GhostButton>

            {/* 中央: 手番待ちの非活性プレースホルダ(押せない) */}
            <div className="relative min-h-[64px] flex-1">
              <span
                className="absolute inset-0 flex items-center justify-center overflow-hidden border-2 border-ink-400 bg-white text-ink-500"
                style={{ transform: "skewX(-9deg)" }}
              >
                <span className="flex gap-1" style={{ transform: "skewX(9deg)" }}>
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-ink-500"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
                    />
                  ))}
                </span>
              </span>
            </div>

            {/* 離席トグル(普段レイズがある右スロット) */}
            <P5GhostButton
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
              <AwayIcon className="h-[18px] w-[18px]" />
              <span className="text-[11px] font-black italic tracking-wide">{t("action.away")}</span>
            </P5GhostButton>
          </div>
        )}
      </div>
    </div>
  );
}
