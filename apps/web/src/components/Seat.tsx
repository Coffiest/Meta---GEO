"use client";

import { motion, AnimatePresence } from "framer-motion";
import { PlayingCard } from "./PlayingCard";
import { Avatar } from "./Avatar";
import { formatBb } from "@/lib/format";

export type SeatBadgeTone = "raise" | "call" | "fold" | "win" | "lose";

export interface SeatBadge {
  text: string;
  tone: SeatBadgeTone;
}

// オールインの炎: 火柱(tongue)群。基準サイズ44pxのアバター用に px 指定し、size に応じて全体を
// scale する。w/h=寸法, ml=中心合わせ, tx=水平オフセット, rot=傾き, sc=拡大, op=不透明度,
// dur/delay=揺らぎアニメの周期・位相。高さ違い7本で「メラメラ立ち上る」束を作る。
const FLAME_TONGUES = [
  { w: 20, h: 58, ml: -10, tx: -24, rot: -16, sc: 0.82, op: 0.95, dur: 0.72, delay: -0.2 },
  { w: 20, h: 60, ml: -10, tx: 24, rot: 16, sc: 0.84, op: 0.95, dur: 0.8, delay: -0.5 },
  { w: 22, h: 74, ml: -11, tx: -15, rot: -7, sc: 0.9, op: 1, dur: 0.68, delay: -0.12 },
  { w: 22, h: 76, ml: -11, tx: 15, rot: 7, sc: 0.92, op: 1, dur: 0.76, delay: -0.34 },
  { w: 24, h: 70, ml: -12, tx: -6, rot: 0, sc: 0.96, op: 1, dur: 0.64, delay: -0.06 },
  { w: 24, h: 74, ml: -12, tx: 7, rot: 0, sc: 0.98, op: 1, dur: 0.7, delay: -0.28 },
  { w: 22, h: 92, ml: -11, tx: 0, rot: 0, sc: 1, op: 1, dur: 0.6, delay: 0 },
];
const FLAME_EMBERS = [
  { ml: -13, delay: -0.2 },
  { ml: 9, delay: -0.7 },
  { ml: -4, delay: -1.1 },
  { ml: 15, delay: -1.45 },
];

/**
 * オールイン中のアバターを本物のように包む炎エフェクト。高さ違いの火柱を束ね、各柱を位相の
 * ずれた揺らぎ(allin-flick)で踊らせ、暖色のグロー(allin-glow)と立ち上る火の粉(allin-ember)を
 * 重ねる。アバターより背面(z-0)に置くことでプレイヤーの顔は隠さず、炎が背後〜側面〜頭上へ
 * 舐め上がる。背景色に依存しないよう不透明グラデ+drop-shadowで描く(画像・絵文字不使用)。
 */
function AllInFlame({ size }: { size: number }) {
  const scale = size / 44;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 z-0"
      style={{ width: 44, height: 44, transform: `translate(-50%, -50%) scale(${scale})` }}
    >
      {/* 暖色のグロー(halo) */}
      <div
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: 116,
          height: 116,
          transform: "translate(-50%, -42%)",
          background: "radial-gradient(circle, rgba(255,150,30,0.5) 0%, rgba(255,90,20,0.22) 44%, rgba(255,40,10,0) 70%)",
          filter: "blur(2px)",
          animation: "allin-glow 1.4s ease-in-out infinite",
        }}
      />
      {/* 火柱の束 */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: 80, height: 96, transform: "translate(-50%, -56%)", filter: "drop-shadow(0 0 5px rgba(255,130,25,0.55))" }}
      >
        {FLAME_TONGUES.map((t, i) => (
          <span
            key={i}
            className="absolute bottom-0 left-1/2"
            style={{
              width: t.w,
              height: t.h,
              marginLeft: t.ml,
              opacity: t.op,
              transformOrigin: "50% 100%",
              transform: `translateX(${t.tx}px) rotate(${t.rot}deg) scale(${t.sc})`,
            }}
          >
            <span
              className="block h-full w-full"
              style={{
                transformOrigin: "50% 100%",
                background:
                  "linear-gradient(to top, rgba(255,70,15,0) 0%, #ff2e08 16%, #ff6a12 38%, #ffab1e 60%, #ffe37a 82%, #fffbe8 100%)",
                borderRadius: "50% 50% 46% 46% / 80% 80% 24% 24%",
                filter: "blur(0.6px)",
                animation: `allin-flick ${t.dur}s ease-in-out infinite`,
                animationDelay: `${t.delay}s`,
              }}
            />
          </span>
        ))}
      </div>
      {/* 立ち上る火の粉 */}
      {FLAME_EMBERS.map((e, i) => (
        <span
          key={i}
          className="absolute left-1/2 rounded-full"
          style={{
            top: "40%",
            width: 3,
            height: 3,
            marginLeft: e.ml,
            background: "#ffcf6b",
            boxShadow: "0 0 5px 1px rgba(255,150,40,0.9)",
            animation: "allin-ember 1.5s linear infinite",
            animationDelay: `${e.delay}s`,
          }}
        />
      ))}
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
}: SeatViewProps) {
  const isEmpty = status === "empty";
  const folded = status === "folded";
  // フォールドした席は手札を見せる意味がないため、伏せカードごと表示しない。
  const showCards = !isEmpty && !folded;

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

      <div className="relative z-30 flex gap-1">
        {showCards &&
          holeCards.map((c, i) => (
            <PlayingCard
              key={i}
              card={revealCards ? c ?? undefined : undefined}
              faceDown={!revealCards}
              size={size === "lg" ? "xl" : "sm"}
              dealDelay={i * 0.05}
            />
          ))}
      </div>

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
            aria-label="チャット"
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
              {status === "allIn" && <AllInFlame size={size === "lg" ? 44 : 34} />}
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
                  離席中
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
