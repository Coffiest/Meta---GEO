"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { PlayingCard } from "./PlayingCard";
import { Avatar } from "./Avatar";
import { formatBb } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export type SeatBadgeTone = "raise" | "call" | "fold" | "win" | "lose";

export interface SeatBadge {
  text: string;
  tone: SeatBadgeTone;
}

// オールインの「電撃(びりびり)」エフェクト用: アバターの円周に沿って放射する稲妻の
// 角度・長さ・明滅タイミングを決定論的な擬似乱数で生成する。値はアバター直径に対する比率。
function elecSeed(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
const ELECTRIC_BOLTS = (() => {
  const N = 10;
  const out: { ang: number; len: number; dur: number; delay: number; flip: boolean }[] = [];
  for (let i = 0; i < N; i++) {
    const ang = (360 / N) * i + (elecSeed(i + 5) * 2 - 1) * 12;
    const len = 0.16 + elecSeed(i + 3) * 0.16;
    const dur = 0.5 + elecSeed(i + 7) * 0.5;
    const delay = -elecSeed(i + 2) * 1.2;
    out.push({ ang, len, dur, delay, flip: elecSeed(i) > 0.5 });
  }
  return out;
})();

/**
 * オールイン中のアバターを囲む「電撃リング」。回転するエネルギー弧(conic)、外周の青白い
 * グロー、円周から放射しランダムに明滅する稲妻(=びりびり)、縁の高輝度リングを重ねる。
 * 稲妻/グローは背面(z-0)、縁のリングは前面(z-20)に置き、プレイヤーの顔は隠さない。炎(赤)を
 * 廃し、エレクトリックシアン〜白で高エネルギーをモダンに表現する。背景色に依存しない色で描く。
 */
function AllInElectric({ size }: { size: number }) {
  const ringThickness = Math.max(2, size * 0.06);
  const ringMask = `radial-gradient(farthest-side, transparent calc(100% - ${ringThickness}px), #000 calc(100% - ${ringThickness}px))`;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* 外周の青白いグロー(背面) */}
      <div
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: size * 1.75,
          height: size * 1.75,
          zIndex: 0,
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(56,189,248,0.5) 40%, rgba(37,99,235,0.24) 54%, rgba(37,99,235,0) 72%)",
          filter: `blur(${Math.max(2, size * 0.05)}px)`,
          animation: "allin-elec-glow 0.9s ease-in-out infinite",
        }}
      />
      {/* 回転するエネルギー弧(背面) */}
      <div
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: size * 1.26,
          height: size * 1.26,
          zIndex: 0,
          background:
            "conic-gradient(from 0deg, rgba(125,211,252,0) 0deg, rgba(125,211,252,0.9) 42deg, rgba(255,255,255,0.98) 60deg, rgba(125,211,252,0) 120deg, rgba(56,189,248,0) 190deg, rgba(125,211,252,0.85) 232deg, rgba(255,255,255,0.95) 250deg, rgba(125,211,252,0) 310deg)",
          WebkitMask: ringMask,
          mask: ringMask,
          filter: `drop-shadow(0 0 ${size * 0.06}px rgba(56,189,248,0.85))`,
          animation: "allin-elec-spin 0.8s linear infinite",
        }}
      />
      {/* 円周から放射する稲妻(背面・ランダム明滅) */}
      <div className="absolute left-1/2 top-1/2" style={{ width: 0, height: 0, zIndex: 0 }}>
        {ELECTRIC_BOLTS.map((b, i) => (
          <span
            key={i}
            className="absolute left-0 top-0"
            style={{ transform: `rotate(${b.ang}deg) translateY(${-0.5 * size}px)` }}
          >
            <svg
              width={size * 0.22}
              height={size * b.len * 2.6}
              viewBox="0 0 10 26"
              style={{
                position: "absolute",
                left: -(size * 0.22) / 2,
                top: 0,
                transform: b.flip ? "scaleX(-1)" : undefined,
                overflow: "visible",
                filter: "drop-shadow(0 0 1.4px rgba(125,211,252,0.95))",
                animation: `allin-elec-flick ${b.dur}s linear infinite`,
                animationDelay: `${b.delay}s`,
              }}
            >
              <polyline
                points="5,0 3,6 6.5,11 3.5,17 6,26"
                fill="none"
                stroke="#eafaff"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        ))}
      </div>
      {/* 縁の高輝度リング(前面) */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          zIndex: 20,
          boxShadow: `0 0 ${size * 0.12}px ${size * 0.03}px rgba(56,189,248,0.9), inset 0 0 ${size * 0.09}px 0 rgba(191,240,255,0.65)`,
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

const BADGE_TONE_CLASS: Record<SeatBadgeTone, string> = {
  call: "bg-mint-500 text-white",
  win: "bg-mint-500 text-white",
  raise: "bg-crimson-500 text-white",
  lose: "bg-crimson-500 text-white",
  // フォールドは他のアクションに比べて目立たせる意味が無いため、控えめな地味トーンにする
  fold: "bg-white border border-ink-300 text-ink-500",
};

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
  timer?: { endsAt: number; durationMs: number } | null;
  size?: "sm" | "lg";
  /** ディーラーボタン。座席の識別ピルに直接アタッチすることで、名前の長さに関わらず
   * 手札やピルと絶対に重ならないようにする(絶対座標のフリー配置は席ごとに表示名の長さが
   * 変わるため、どこかのポジションで必ず干渉してしまっていた)。 */
  isButton?: boolean;
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
  isButton = false,
  away = false,
  markingColor = null,
  chatBubble = null,
  onChatClick,
  handRankLabel = null,
  shown = false,
  showEyeIcon = false,
  onCardsTap,
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
            transition={{ type: "spring", stiffness: 480, damping: 26 }}
            className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-max max-w-[170px] break-words rounded-[14px] border border-ink-950/[0.06] bg-white/95 px-3 py-1.5 text-center text-[12px] font-semibold leading-[1.35] text-ink-950 backdrop-blur-[6px] shadow-[0_10px_24px_-10px_rgba(10,10,10,0.4),0_2px_6px_-2px_rgba(10,10,10,0.16)]"
          >
            {chatBubble}
            {/* 尻尾: 本体と同じ白の菱形を回転して縁取り2辺+影で自然に接続する */}
            <span
              aria-hidden
              className="absolute left-1/2 top-full -mt-1.5 h-3 w-3 -translate-x-1/2 rotate-45 rounded-br-[3px] border-b border-r border-ink-950/[0.06] bg-white/95"
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
            {/* ハンドショウ意思ON: カードに小さな目のアイコンを重ねる。 */}
            {showEyeIcon && showCards && (
              <motion.span
                aria-hidden
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                className="pointer-events-none absolute -top-1.5 -right-1.5 z-40 flex h-5 w-5 items-center justify-center rounded-full bg-ink-950 text-white ring-2 ring-white"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3 w-3">
                  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="2.4" />
                </svg>
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
            className="appearance-none bg-transparent p-0 active:scale-[0.96] transition-transform"
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
          transition={{ type: "spring", stiffness: 460, damping: 24 }}
          className="z-30 -mt-0.5 rounded-full bg-ink-950 px-2.5 py-0.5 text-[10px] font-black tracking-wide text-white shadow-[0_1px_4px_-1px_rgba(10,10,10,0.5)]"
        >
          {handRankLabel}
        </motion.div>
      )}

      <div
        className={`relative flex items-center gap-1.5 rounded-full pr-3 pl-1 py-1 transition-all duration-300 ${
          isEmpty
            ? "bg-transparent"
            : folded
              ? "bg-white/50 border border-ink-950/30"
              : "bg-white border border-ink-950"
        } ${isActingSeat ? "ring-2 ring-ink-950" : ""}`}
      >
        {isActingSeat && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-ink-950"
            animate={{ opacity: [0.55, 0, 0.55], scale: [1, 1.14, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        {/* 自分の席: カード右側の丸いチャット入力ボタン。 */}
        {onChatClick && (
          <button
            type="button"
            onClick={onChatClick}
            aria-label={t("seat.chat")}
            className="absolute left-full top-1/2 z-40 ml-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-ink-950 bg-white text-ink-800 transition-transform active:scale-90"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5">
              <path d="M4 5h16v11H8l-4 3z" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {isButton && !isEmpty && (
          <div className="absolute -top-2 -left-2 z-10 h-5 w-5 rounded-full bg-white border-[1.5px] border-ink-950 flex items-center justify-center text-[9px] font-black text-ink-950">
            D
          </div>
        )}
        {!isEmpty && (
          <>
            <div className="relative">
              {status === "allIn" && <AllInElectric size={size === "lg" ? 44 : 34} />}
              <div className="relative z-10">
                <Avatar avatarKey={avatarKey} displayName={name} size={size === "lg" ? 44 : 34} timer={isActingSeat ? timer : null} />
              </div>
              {markingColor && (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 z-20 h-3 w-3 rounded-full ring-[1.5px] ring-white"
                  style={{ backgroundColor: markingColor }}
                />
              )}
            </div>
            <div className="text-left min-w-0">
              <div className={`${size === "lg" ? "text-[13px] max-w-[96px]" : "text-[11px] max-w-[64px]"} font-medium truncate text-ink-950`}>
                {name}
              </div>
              <div className="flex items-center gap-1 mt-[1px]">
                {position && (
                  <span className="rounded bg-ink-950 text-white text-[8px] font-bold uppercase tracking-wide px-1 py-[1px]">
                    {position}
                  </span>
                )}
                <span className={`${size === "lg" ? "text-[12px]" : "text-[11px]"} font-semibold text-ink-800 tabular-nums`}>
                  {formatBb(stack, bigBlind)}
                </span>
              </div>
              {status === "allIn" && <div className="text-[9px] text-crimson-500 font-medium">ALL IN</div>}
              {away && status !== "allIn" && (
                <div className="flex items-center gap-1 text-[9px] font-bold text-ink-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
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
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
            className={`rounded-full px-3 py-1 text-[12px] font-bold tabular-nums ring-2 ring-ink-950 ${BADGE_TONE_CLASS[badge.tone]}`}
          >
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
              className="rounded-full bg-white border border-ink-950 px-2.5 py-0.5 text-[10px] font-semibold text-ink-800 tabular-nums"
            >
              {formatBb(streetContribution, bigBlind)}
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  );
}
