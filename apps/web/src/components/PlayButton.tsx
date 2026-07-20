"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { GameKey } from "@/lib/socket";
import { useI18n } from "@/lib/i18n";

interface GameChoice {
  key: GameKey;
  title: string;
  caption?: string;
  detailKey: string;
  buyIn: number;
}

/** トランプ札(public/cards/)のスート。4色デッキ(s=黒, h=赤)に合わせた塗りつぶしSVG。 */
function SuitGlyph({ suit, className }: { suit: "s" | "h"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {suit === "s" ? (
        <path
          fill="currentColor"
          d="M12 2C8.8 6.2 4.5 8.7 4.5 12.6c0 2.3 1.9 4.2 4.2 4.2 1 0 1.9-.35 2.6-.93-.4 1.9-1.3 3.6-2.8 5.13h7c-1.5-1.53-2.4-3.23-2.8-5.13.7.58 1.6.93 2.6.93 2.3 0 4.2-1.9 4.2-4.2C19.5 8.7 15.2 6.2 12 2Z"
        />
      ) : (
        <path
          fill="currentColor"
          d="M12 21C7 16.5 3 13.3 3 9.3 3 6.4 5.2 4.5 7.7 4.5c1.7 0 3.3.9 4.3 2.4 1-1.5 2.6-2.4 4.3-2.4 2.5 0 4.7 1.9 4.7 4.8 0 4-4 7.2-9 11.7Z"
        />
      )}
    </svg>
  );
}

/** 札の左端に沿わせる縦書き「Runner Runner」。トランプ資産(public/cards)の意匠を踏襲。 */
function SideBrand({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none select-none font-medium tracking-[0.14em] text-ink-950/70 ${className ?? ""}`}
      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
    >
      Runner Runner
    </span>
  );
}

/**
 * ホーム画面の主役ボタン。タップすると、単一のボタンが泡が分裂するように2つの選択肢
 * (Sit&Go / MTT)へアニメーションで分かれる。もう一度背景をタップすると元の単一ボタンに戻る。
 *
 * 意匠はアプリのトランプ札(public/cards/{n}{suit}.png)と同一言語:
 * 白地+黒の角丸枠、左上にスート+ランク、左端に縦書き「Runner Runner」、
 * そして約10度左に傾いたバカデカ文字が札の縁からはみ出して切れる(overflow-hiddenでクロップ)。
 */
export function PlayButton({ games, onJoin }: { games: GameChoice[]; onJoin: (key: GameKey) => void }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative flex justify-center py-2" style={{ minHeight: 112 }}>
      {expanded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[5]"
          onClick={() => setExpanded(false)}
          aria-label={t("common.close")}
        />
      )}
      <div className="relative z-[6]">
      <AnimatePresence mode="popLayout">
        {!expanded ? (
          <motion.button
            key="single"
            layoutId="play-bubble"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            whileTap={{ scale: 0.96, rotate: -1.5 }}
            transition={{ type: "spring", damping: 20, stiffness: 260 }}
            onClick={() => setExpanded(true)}
            aria-label={t("play.play")}
            className="relative h-[104px] w-[264px] overflow-hidden rounded-[18px] bg-white ring-2 ring-ink-950 shadow-[0_8px_24px_-8px_rgba(10,10,10,0.4)]"
          >
            {/* 左上コーナー: スート+ランク(札と同じ縦積み) */}
            <span className="pointer-events-none absolute left-2.5 top-2 z-[2] flex flex-col items-center gap-px">
              <SuitGlyph suit="s" className="h-[18px] w-[18px] text-ink-950" />
              <span className="text-[13px] font-black leading-none text-ink-950">P</span>
            </span>
            {/* 左端: 縦書きブランド */}
            <SideBrand className="absolute bottom-2 left-[3px] z-[2] text-[8px]" />
            {/* バカデカ「Play」: 約10度左に傾け、札の右下からはみ出して縁で切れる */}
            <span
              className="pointer-events-none absolute z-[1] select-none whitespace-nowrap font-black text-ink-950"
              style={{
                fontSize: 96,
                lineHeight: 0.72,
                letterSpacing: "-0.05em",
                left: 42,
                top: 30,
                transform: "rotate(-10deg)",
                transformOrigin: "left top",
              }}
            >
              Play
            </span>
          </motion.button>
        ) : (
          <motion.div key="split" className="flex items-center gap-4">
            {games.map((game, i) => (
              <motion.button
                key={game.key}
                layoutId={i === 0 ? "play-bubble" : undefined}
                initial={{ opacity: 0, scale: 0.4, x: i === 0 ? 40 : -40 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.4, x: i === 0 ? 40 : -40 }}
                whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", damping: 16, stiffness: 240, delay: i * 0.04 }}
                onClick={() => onJoin(game.key)}
                className="relative flex h-[92px] w-[128px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[14px] bg-white ring-2 ring-ink-950 shadow-[0_8px_24px_-8px_rgba(10,10,10,0.4)]"
              >
                {/* 札の透かし: 頭文字を約10度左に傾けて右下からはみ出させる */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute select-none font-black text-ink-950/[0.08]"
                  style={{
                    fontSize: 88,
                    lineHeight: 0.72,
                    left: 44,
                    top: 30,
                    transform: "rotate(-10deg)",
                    transformOrigin: "left top",
                  }}
                >
                  {game.title.charAt(0)}
                </span>
                {/* 左上コーナー: スート(Sit&Go=スペード, MTT=ハートの4色デッキ準拠) */}
                <span className="pointer-events-none absolute left-2 top-1.5">
                  <SuitGlyph
                    suit={i === 0 ? "s" : "h"}
                    className={`h-[13px] w-[13px] ${i === 0 ? "text-ink-950" : "text-crimson-500"}`}
                  />
                </span>
                <span className="relative text-[15px] font-black tracking-wide text-ink-950">{game.title}</span>
                {game.caption && <span className="relative text-[9px] font-medium text-ink-500">{game.caption}</span>}
                <span className="relative mt-0.5 rounded-full bg-ink-950/[0.06] px-2 py-0.5 text-[9px] font-bold text-ink-700 tabular-nums">
                  {t("play.buyIn")} {game.buyIn.toLocaleString()}
                </span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
