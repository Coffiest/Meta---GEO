"use client";

import { motion, AnimatePresence } from "framer-motion";
import { PlayingCard } from "./PlayingCard";
import { Avatar } from "./Avatar";
import { formatBb } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export type SeatBadgeTone = "raise" | "call" | "fold" | "win" | "lose";

export interface SeatBadge {
  text: string;
  tone: SeatBadgeTone;
}

// オールインの炎リング: アバターの円周に沿って放射状に配置する火柱群。決定論的な擬似乱数で
// 各火柱の角度・長さ・幅・傾き・揺らぎ位相を生成し、上側(火は上に立ち上る)ほど長く、下側は
// 短くして「燃え上がるリング」に見せる。値はアバター直径に対する比率で持ち、size に比例させる。
function fireSeed(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
const RING_FLAMES = (() => {
  const N = 22;
  const out: { ang: number; lean: number; hFrac: number; wFrac: number; rimFrac: number; dur: number; delay: number }[] = [];
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < N; i++) {
      const ang = (360 / N) * i + (layer ? 360 / N / 2 : 0);
      const up = Math.cos((ang * Math.PI) / 180); // 上=+1 / 下=-1
      const lean = (fireSeed(i + layer * 20) * 2 - 1) * (layer ? 12 : 10);
      const hFrac = layer
        ? 0.1 + fireSeed(i + 11) * 0.11
        : 0.17 + 0.295 * (0.35 + 0.65 * (0.5 + 0.5 * up)) + fireSeed(i + 9) * 0.1;
      const wFrac = layer ? 0.068 + fireSeed(i + 13) * 0.045 : 0.08 + fireSeed(i + 3) * 0.057;
      const rimFrac = layer ? 0.477 : 0.5;
      const dur = (layer ? 0.45 : 0.5) + fireSeed(i + 7 + layer) * 0.33;
      const delay = -fireSeed(i + 2 + layer) * 0.8;
      out.push({ ang, lean, hFrac, wFrac, rimFrac, dur, delay });
    }
  }
  return out;
})();

const FLAME_GRADIENT =
  "linear-gradient(to top, #fff3d0 0%, #ffd24a 14%, #ffab1e 34%, #ff6a12 58%, #ef2a06 80%, rgba(200,20,4,0) 100%)";

/**
 * オールイン中のアバターの縁を包む「炎のリング」。円周に沿って多数の火柱を放射状に立て、位相の
 * ずれた揺らぎ(allin-flick)でメラメラ踊らせる。根本(縁側)を白〜黄の高温色、先端を赤にして
 * 立ち上る炎の熱を表現。火柱と外周グローはアバター背面(z-0)、縁の赤いホットリングは前面(z-20)に
 * 置き、プレイヤーの顔は隠さず縁だけが赤熱して燃える。背景色に依存しない不透明グラデで描く。
 */
function AllInFlame({ size }: { size: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* 外周の暖色グロー(背面) */}
      <div
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: size * 1.8,
          height: size * 1.8,
          zIndex: 0,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(255,90,20,0.5) 40%, rgba(255,50,10,0.26) 52%, rgba(255,40,10,0) 70%)",
          filter: `blur(${Math.max(2, size * 0.05)}px)`,
          animation: "allin-halo 1.1s ease-in-out infinite",
        }}
      />
      {/* 円周の火柱(背面) */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: 0, height: 0, zIndex: 0, filter: `drop-shadow(0 0 ${size * 0.09}px rgba(255,110,25,0.6))` }}
      >
        {RING_FLAMES.map((f, i) => (
          <span
            key={i}
            className="absolute left-0 top-0"
            style={{ transform: `rotate(${f.ang}deg) translateY(${-f.rimFrac * size}px) rotate(${f.lean}deg)` }}
          >
            <span
              style={{
                position: "absolute",
                bottom: 0,
                left: -(f.wFrac * size) / 2,
                width: f.wFrac * size,
                height: f.hFrac * size,
                transformOrigin: "50% 100%",
                background: FLAME_GRADIENT,
                borderRadius: "50% 50% 44% 44% / 86% 86% 18% 18%",
                filter: "blur(0.4px)",
                animation: `allin-flick ${f.dur}s ease-in-out infinite`,
                animationDelay: `${f.delay}s`,
              }}
            />
          </span>
        ))}
      </div>
      {/* 縁の赤熱ホットリング(前面) */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          zIndex: 20,
          boxShadow: `0 0 ${size * 0.12}px ${size * 0.03}px rgba(255,110,25,0.85), inset 0 0 ${size * 0.1}px 0 rgba(255,150,45,0.5)`,
          animation: "allin-halo 0.6s ease-in-out infinite",
        }}
      />
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
  const { t } = useI18n();
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
