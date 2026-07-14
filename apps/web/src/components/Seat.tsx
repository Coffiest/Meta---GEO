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

/**
 * オールイン中のアバターの周囲でメラメラと揺れる炎エフェクト。複数の放射状グラデーションを
 * 重ね、フレームごとにopacity/scaleをランダムに揺らして「燃えている」印象を出す。
 * SVG/CSSのみで実装(画像・絵文字不使用)。
 */
function AllInFlame({ size }: { size: number }) {
  const box = size * 1.62;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2"
      style={{ width: box, height: box }}
    >
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full"
          style={{
            background:
              i === 2
                ? "radial-gradient(circle, rgba(255,240,150,0.9) 0%, rgba(255,150,20,0.55) 38%, rgba(230,40,20,0.0) 70%)"
                : "radial-gradient(circle, rgba(255,180,40,0.85) 0%, rgba(240,70,20,0.6) 42%, rgba(200,20,10,0.0) 72%)",
            filter: "blur(3px)",
          }}
          animate={{
            scale: i === 0 ? [1, 1.12, 0.96, 1.08, 1] : i === 1 ? [1.05, 0.94, 1.1, 0.98, 1.05] : [0.9, 1.04, 0.92, 1, 0.9],
            opacity: i === 2 ? [0.7, 1, 0.75, 0.95, 0.7] : [0.85, 0.6, 0.95, 0.7, 0.85],
            rotate: i === 1 ? [0, 6, -4, 3, 0] : [0, -5, 4, -2, 0],
          }}
          transition={{ duration: 0.9 + i * 0.25, repeat: Infinity, ease: "easeInOut" }}
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
}: SeatViewProps) {
  const isEmpty = status === "empty";
  const folded = status === "folded";
  // フォールドした席は手札を見せる意味がないため、伏せカードごと表示しない。
  const showCards = !isEmpty && !folded;

  return (
    <div
      className={`flex flex-col items-center gap-1 transition-opacity duration-300 ${size === "lg" ? "w-32" : "w-24"} ${
        folded ? "opacity-35" : "opacity-100"
      }`}
    >
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

        {/* 同卓チャットの吹き出し(アバターの上に数秒表示)。 */}
        <AnimatePresence>
          {chatBubble && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 480, damping: 26 }}
              className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 max-w-[180px] -translate-x-1/2 break-words rounded-2xl border border-ink-950 bg-white px-2.5 py-1 text-[11px] font-bold leading-snug text-ink-950"
            >
              {chatBubble}
            </motion.div>
          )}
        </AnimatePresence>

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
