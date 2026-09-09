"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { SPRING_SNAPPY } from "@/lib/motion";
import { PlayingCard } from "./PlayingCard";
import { Avatar } from "./Avatar";
import { formatAmount, formatBb, formatChips, type AmountDisplayMode } from "@/lib/format";

/**
 * 席ピル用のスタック表記。100bb以上は小数を落として桁を詰める。
 * 席ピルは席の幅(w-24)に収める必要があり、"148.8bb" の1桁が隣席との重なりを生むため。
 * 点数(chips)モードでは素の点数を表示する(100万点以上だけ "1.2M" に丸めて幅を守る)。
 */
function compactStack(stack: number, bigBlind: number, mode: AmountDisplayMode): string {
  if (mode === "chips") {
    if (stack >= 1_000_000) return `${(stack / 1_000_000).toFixed(1)}M`;
    return formatChips(stack);
  }
  if (!bigBlind) return "0bb";
  const bb = stack / bigBlind;
  // 10bb以上は小数を落とす。深いスタックで0.1bbの差を読む場面は無く、
  // 桁が1つ増えるだけで席ピルが隣席へはみ出す。10bb未満はプッシュ判断に効くので残す。
  if (bb >= 10) return `${Math.round(bb)}bb`;
  return formatBb(stack, bigBlind);
}
import { useI18n } from "@/lib/i18n";
import { Icon } from "./Icon";

/** 卓上バッジの種別。敗北を宣言するトーンは持たない(負けはスタックが語る)。 */
export type SeatBadgeTone = "raise" | "call" | "fold" | "win";

export interface SeatBadge {
  text: string;
  tone: SeatBadgeTone;
}

/**
 * オールイン中のアバターを囲む発光リング。紫→シアンのグラデーションが回転する円環(背面)+
 * 外周のグロー+縁の高輝度リング(前面)の3層構成。グロー/回転リングは背面(z-0)、縁の
 * リングは前面(z-20)に置き、プレイヤーの顔は隠さない。
 * (出典: uiverse.io by xXJollyHAKERXx。紫(#BA42FF)→シアン(#00E1FF)の回転グラデーションを
 * リング状にマスクして移植。回転そのものは既存の allin-elec-spin キーフレームを流用)
 */
function AllInElectric({ size }: { size: number }) {
  const ringThickness = Math.max(3, size * 0.16);
  const ringMask = `radial-gradient(farthest-side, transparent calc(100% - ${ringThickness}px), #000 calc(100% - ${ringThickness}px))`;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* 外周の紫→シアングロー(背面) */}
      <div
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: size * 1.75,
          height: size * 1.75,
          zIndex: 0,
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(186,66,255,0.45) 40%, rgba(0,225,255,0.22) 58%, rgba(0,225,255,0) 74%)",
          filter: `blur(${Math.max(2, size * 0.05)}px)`,
          animation: "allin-elec-glow 0.9s ease-in-out infinite",
        }}
      />
      {/* 回転する紫→シアンのグラデーションリング(背面) */}
      <div
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: size * 1.3,
          height: size * 1.3,
          zIndex: 0,
          transform: "translate(-50%, -50%)",
          backgroundImage: "linear-gradient(rgb(186, 66, 255) 35%, rgb(0, 225, 255))",
          WebkitMask: ringMask,
          mask: ringMask,
          filter: "blur(1px)",
          boxShadow: "0 -5px 20px 0 rgba(186,66,255,0.55), 0 5px 20px 0 rgba(0,225,255,0.55)",
          animation: "allin-elec-spin 1.7s linear infinite",
        }}
      />
      {/* 縁の高輝度リング(前面) */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          zIndex: 20,
          boxShadow: `0 0 ${size * 0.12}px ${size * 0.03}px rgba(0,225,255,0.85), inset 0 0 ${size * 0.09}px 0 rgba(230,190,255,0.6)`,
          animation: "allin-elec-glow 0.5s ease-in-out infinite",
        }}
      />
    </div>
  );
}

/**
 * ハンドショウ/ショウダウンで公開されるカードの「ペラッ」めくり演出。
 * 3Dの Y軸回転で、伏せた裏面(前面)→表面(背面)へ半回転して表を見せる。
 * reduced-motion 時やカード未確定時は演出せず、そのまま表示する。
 */
function FlipRevealCard({ card, size, delay }: { card?: string; size: "sm" | "xl"; delay: number }) {
  const reduced = useReducedMotion();
  if (reduced || !card) {
    return <PlayingCard card={card} faceDown={!card} size={size} />;
  }
  return (
    <div style={{ perspective: 700 }}>
      <motion.div
        className="relative"
        style={{ transformStyle: "preserve-3d" }}
        initial={{ rotateY: 0 }}
        animate={{ rotateY: 180 }}
        transition={{ duration: 0.5, delay, ease: [0.2, 0.7, 0.25, 1] }}
      >
        {/* 前面: 裏面(めくり始めに見えている面) */}
        <div style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
          <PlayingCard faceDown size={size} />
        </div>
        {/* 背面: 表面(半回転しきると見える面) */}
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <PlayingCard card={card} size={size} />
        </div>
      </motion.div>
    </div>
  );
}

/**
 * 卓上バッジの配色。プレイヤーが行ったアクションは色で意味を分ける(オーナー指示により、
 * 一度無彩色へ統一したものを元の配色へ戻した)。輪郭(ring-line-strong)は全バッジ共通で、
 * アプリの面構えを保ったまま塗りだけを色分けする。ActionBar のボタン配色と同じ言語:
 *  - コール/チェックはミント(応答)
 *  - ベット/レイズ/オールインはクリムゾン(強い意思表示)
 *  - ポット獲得はアクセント(卓上で唯一の"結果"の色。アクションではないので据え置き)
 *  - フォールドは輪郭も文字も落として静かに引く
 */
const BADGE_TONE_CLASS: Record<SeatBadgeTone, string> = {
  win: "bg-accent text-on-accent ring-line-strong",
  // 塗りの濃さは「暗地でバッジ自体が3:1以上」かつ「その上の白文字が4.5:1以上」を
  // 同時に満たす段を選んである(明るくすると文字が、暗くするとバッジが読めなくなる)。
  raise: "bg-crimson-600 text-white ring-line-strong",
  call: "bg-mint-700 text-white ring-line-strong",
  fold: "bg-surface text-fg-3 ring-line",
};

/** ポット獲得バッジに添えるチップのグリフ(重なった2枚)。絵文字は使わずSVGで描く。 */
function ChipsGlyph({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <Icon name="chip" className={className} />
  );
}

export interface SeatViewProps {
  name: string;
  avatarKey: string | null;
  position: string;
  stack: number;
  streetContribution: number;
  bigBlind: number;
  status: "active" | "folded" | "allIn" | "empty";
  isActingSeat: boolean;
  isHero: boolean;
  holeCards: (string | null)[];
  revealCards: boolean;
  badge?: SeatBadge | null;
  /** 手番の残り時間(アバター周囲のリングで表示)。この席がアクティブなときだけ渡す。 */
  timer?: { endsAt: number; durationMs: number; timeBank?: boolean } | null;
  size?: "sm" | "lg";
  /** 離席中(自分・他プレイヤー双方に表示)。 */
  away?: boolean;
  /** プレイヤーメモのマーキング色(HEX)。設定時はアバター右上に小さなドットを出す。 */
  markingColor?: string | null;
  /** 同卓チャットの直近吹き出し(数秒表示)。 */
  chatBubble?: string | null;
  /** 自分の席のとき、カード右側にチャット入力ボタンを出すためのハンドラ。 */
  onChatClick?: () => void;
  /** 自分の席のとき、現在成立している役(例: 「ツーペア」)を手札の直下に表示する。 */
  handRankLabel?: string | null;
  /** ハンドショウで公開された席。フォールド済みでも手札を表示し、相手席なら裏返る演出を再生する。 */
  shown?: boolean;
  /** 自席のハンドショウ意思がON。カードに目のアイコンを重ねる。 */
  showEyeIcon?: boolean;
  /** 自席のカードをタップしたとき(ハンドショウのトグル)。 */
  onCardsTap?: () => void;
  /** 卓上の金額表示モード(bb換算/点数)。 */
  displayMode?: AmountDisplayMode;
  /** 自席のスタック表示をタップしたとき(bb/点数の切り替え)。自席にだけ渡す。 */
  onStackTap?: () => void;
}

export function Seat({
  name,
  avatarKey,
  position,
  stack,
  streetContribution,
  bigBlind,
  status,
  isActingSeat,
  isHero,
  holeCards,
  revealCards,
  badge,
  timer,
  size = "sm",
  away = false,
  markingColor = null,
  chatBubble = null,
  onChatClick,
  handRankLabel = null,
  shown = false,
  showEyeIcon = false,
  onCardsTap,
  displayMode = "bb",
  onStackTap,
}: SeatViewProps) {
  const { t } = useI18n();
  const isEmpty = status === "empty";
  const folded = status === "folded";
  // フォールドした席は通常伏せカードごと表示しないが、ハンドショウで公開された席は表示する。
  const showCards = !isEmpty && (!folded || shown);

  return (
    <div
      className={`relative flex flex-col items-center gap-1 transition-opacity duration-300 ${size === "lg" ? "w-32" : "w-24"} ${
        folded ? "opacity-35" : "opacity-100"
      }`}
    >
      {/* 同卓チャットの吹き出し。自分の手札の真上にふわっと浮かせ、尻尾(菱形)を下=手札方向へ。
          黒縁ではなくヘアライン+柔らかいドロップシャドウでApple的な浮遊感を出す。数秒表示。 */}
      <AnimatePresence>
        {chatBubble && !isEmpty && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.9, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, scale: 0.9, x: "-50%" }}
            transition={SPRING_SNAPPY}
            className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-max max-w-[170px] break-words rounded-[14px] border border-line-strong/[0.06] bg-surface/80 px-3 py-1.5 text-center text-[12px] font-semibold leading-[1.35] text-fg backdrop-blur-[6px] shadow-e3"
          >
            {chatBubble}
            {/* 尻尾: 本体と同じ白の菱形を回転して縁取り2辺+影で自然に接続する */}
            <span
              aria-hidden
              className="absolute left-1/2 top-full -mt-1.5 h-3 w-3 -translate-x-1/2 rotate-45 rounded-br-[3px] border-b border-r border-line-strong/[0.06] bg-surface/80"
              style={{ boxShadow: "4px 4px 8px -4px rgba(10,10,10,0.24)" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {(() => {
        const cardSize = size === "lg" ? "xl" : "sm";
        const cardsInner = (
          <div className="relative z-30 flex gap-1">
            {showCards &&
              holeCards.map((c, i) =>
                shown && !isHero ? (
                  // 相手席のハンドショウ/ショウダウン公開: 裏面→表面の「ペラッ」フリップ。
                  <FlipRevealCard key={i} card={c ?? undefined} size={cardSize} delay={i * 0.09} />
                ) : (
                  <PlayingCard
                    key={i}
                    card={revealCards ? c ?? undefined : undefined}
                    faceDown={!revealCards}
                    size={cardSize}
                    dealDelay={i * 0.05}
                  />
                ),
              )}
            {/* ハンドショウ意思ON: カード束の周囲が光る。ハンド終了時に全員へ見せる、という
                予約が効いていることを、押した本人にだけ分かる形で示す
                (相手には何も伝わらない ― 意思は終了時にまとめて公開される)。 */}
            {showEyeIcon && showCards && <span aria-hidden data-on="true" className="hand-show-glow" />}
            {/* 補助として小さな目のアイコンも残す(発光だけだと色覚や輝度の環境差で拾えない)。 */}
            {showEyeIcon && showCards && (
              <motion.span
                aria-hidden
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                className="pointer-events-none absolute -top-1.5 -right-1.5 z-40 flex h-5 w-5 items-center justify-center rounded-full bg-n-4 text-white ring-2 ring-canvas"
              >
                <Icon name="eye" className="h-3 w-3" />
              </motion.span>
            )}
          </div>
        );
        // 自席かつハンド進行中はカードをタップしてハンドショウをトグルできる。
        return onCardsTap ? (
          <button
            type="button"
            onClick={onCardsTap}
            aria-label={showEyeIcon ? "ハンドショウを取り消す" : "このハンドをショウする"}
            aria-pressed={showEyeIcon}
            className="appearance-none bg-transparent p-0 pressable"
          >
            {cardsInner}
          </button>
        ) : (
          cardsInner
        );
      })()}

      {/* 自分の現在の役(手札の直下)。ボードが進むたびに更新される。 */}
      {handRankLabel && showCards && (
        <motion.div
          key={handRankLabel}
          initial={{ opacity: 0, y: -3, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={SPRING_SNAPPY}
          className="z-30 -mt-0.5 rounded-full bg-n-4 px-2.5 py-0.5 text-[10px] font-black tracking-wide text-white shadow-e1"
        >
          {handRankLabel}
        </motion.div>
      )}

      {/* 名前+スタックの識別ピル。中身の自然幅に任せると、表示名やスタック桁数によっては
          席の枠(w-24/w-32)を左右にはみ出し、テーブルが小さい端末で隣席のピルと重なって
          読めなくなる。max-w-full で必ず席の幅に収め、あふれる分は表示名を削る。 */}
      <div
        className={`relative flex max-w-full items-center gap-1 rounded-full pr-2 pl-0.5 py-1 transition-all duration-300 ${
          isEmpty
            ? "bg-transparent"
            : folded
              ? "bg-surface/80 border border-line-strong/30"
              : "glass-panel"
        } ${isActingSeat ? "ring-2 ring-line-strong" : ""}`}
      >
        {/* 手番の席の拡散リング。手番中ずっと回り続けるアニメーションなので、JS(framer-motion)ではなく
            CSSキーフレームで動かす(コンポジタで完結し、端末の発熱を抑える)。 */}
        {isActingSeat && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-acting-ring rounded-full ring-2 ring-line-strong"
          />
        )}

        {/* タイムバンク使用の告知。誰の席でも同じ条件・同じ見た目で出す
            (出方に差があると、それ自体が相手の種別を推測する手掛かりになってしまう)。
            アイコンは使わず、金色のピルに文字だけを載せる。 */}
        {isActingSeat && timer?.timeBank && (
          // 中央寄せ(-translate-x-1/2)とアニメーションを同じ要素に置くと、キーフレームの
          // transform が中央寄せを打ち消してしまう。外側で位置決め、内側でアニメーションする。
          <span className="pointer-events-none absolute -top-3 left-1/2 z-40 -translate-x-1/2">
            <span
              role="status"
              className="block animate-time-bank-badge whitespace-nowrap rounded-full bg-accent px-2 py-[2px] text-[9px] font-black uppercase tracking-[0.1em] text-on-accent shadow-e1"
            >
              {t("seat.timeBankUsed")}
            </span>
          </span>
        )}

        {/* 自分の席: カード右側の丸いチャット入力ボタン。 */}
        {onChatClick && (
          <button
            type="button"
            onClick={onChatClick}
            aria-label={t("seat.chat")}
            className="absolute left-full top-1/2 z-40 ml-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full glass-panel text-n-10 transition-transform pressable"
          >
            <Icon name="chat" className="h-3.5 w-3.5" />
          </button>
        )}
        {!isEmpty && (
          <>
            <div className="relative">
              {status === "allIn" && <AllInElectric size={size === "lg" ? 44 : 30} />}
              <div className="relative z-10">
                <Avatar avatarKey={avatarKey} displayName={name} size={size === "lg" ? 44 : 30} timer={isActingSeat ? timer : null} />
              </div>
              {markingColor && (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 z-20 h-3 w-3 rounded-full ring-[1.5px] ring-canvas"
                  style={{ backgroundColor: markingColor }}
                />
              )}
            </div>
            <div className="text-left min-w-0">
              <div className={`${size === "lg" ? "text-[13px] max-w-[84px]" : "text-[11px] max-w-[40px]"} font-medium truncate text-fg`}>
                {name}
              </div>
              <div className="flex min-w-0 items-center gap-1 mt-[1px]">
                {position && (
                  <span className="shrink-0 rounded bg-n-4 text-white text-[8px] font-bold uppercase tracking-wide px-1 py-[1px]">
                    {position}
                  </span>
                )}
                {onStackTap ? (
                  // 自席のスタックはタップでbb表示⇄点数表示を切り替えられる(卓上の全金額に反映)。
                  <button
                    type="button"
                    onClick={onStackTap}
                    aria-label={displayMode === "chips" ? "bb表示に切り替える" : "点数表示に切り替える"}
                    className={`${size === "lg" ? "text-[12px]" : "text-[11px]"} shrink-0 appearance-none rounded bg-transparent p-0 font-semibold text-n-10 tabular-nums underline decoration-fg-faint decoration-dotted underline-offset-2 transition-transform pressable`}
                  >
                    {compactStack(stack, bigBlind, displayMode)}
                  </button>
                ) : (
                  <span className={`${size === "lg" ? "text-[12px]" : "text-[11px]"} shrink-0 font-semibold text-n-10 tabular-nums`}>
                    {compactStack(stack, bigBlind, displayMode)}
                  </span>
                )}
              </div>
              {status === "allIn" && <div className="text-[9px] font-black uppercase tracking-[0.18em] text-fg">All in</div>}
              {away && status !== "allIn" && (
                <div className="flex items-center gap-1 text-[9px] font-bold text-fg-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-n-5" />
                  {t("seat.away")}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        {badge && !isEmpty ? (
          <motion.div
            key={`badge-${badge.tone}-${badge.text}`}
            initial={{ opacity: 0, scale: 0.5, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={SPRING_SNAPPY}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-bold tabular-nums ring-2 ${BADGE_TONE_CLASS[badge.tone]}`}
            style={badge.tone === "win" ? { boxShadow: "0 0 0 4px rgba(242,169,0,0.22)" } : undefined}
          >
            {badge.tone === "win" && <ChipsGlyph className="h-3 w-3 shrink-0" />}
            {badge.text}
          </motion.div>
        ) : (
          streetContribution > 0 &&
          !isEmpty && (
            <motion.div
              key="contribution"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              className="rounded-full glass-panel px-2.5 py-0.5 text-[10px] font-semibold text-n-10 tabular-nums"
            >
              {formatAmount(streetContribution, bigBlind, displayMode)}
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  );
}
