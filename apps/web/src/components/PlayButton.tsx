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

/**
 * ホーム画面の主役ボタン。タップすると、単一のボタンが泡が分裂するように2つの選択肢
 * (Sit&Go / MTT)へアニメーションで分かれる。もう一度背景をタップすると元の単一ボタンに戻る。
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
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", damping: 20, stiffness: 260 }}
            onClick={() => setExpanded(true)}
            aria-label={t("play.play")}
            className="relative h-[100px] w-[260px] overflow-hidden rounded-[28px] bg-ink-950 shadow-[0_6px_20px_-6px_rgba(10,10,10,0.35)]"
          >
            {/* トランプ札の意匠。黒い札に大きく傾けた「Play」を置き、内枠より外側を黒で塗りつぶす
                マスクを重ねることで、枠からはみ出した部分を隠す(=Playの一部が黒に隠れて覗く)。
                内枠のフチがそのまま黒い枠線になる。overflow-hiddenでマスクは札の内側にとどまる。 */}
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 z-[2] select-none whitespace-nowrap font-black text-white"
              style={{
                fontSize: 90,
                lineHeight: 0.7,
                letterSpacing: "-0.045em",
                transform: "translate(-50%, -52%) rotate(-10deg)",
                transformOrigin: "center",
              }}
            >
              Play
            </span>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-[10px] z-[3] rounded-[20px]"
              style={{ boxShadow: "0 0 0 200px #0a0a0a" }}
            />
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
                className="flex h-[86px] w-[128px] flex-col items-center justify-center gap-0.5 rounded-3xl bg-ink-950 shadow-[0_6px_20px_-6px_rgba(10,10,10,0.35)]"
              >
                <span className="text-[15px] font-black tracking-wide text-white">{game.title}</span>
                {game.caption && <span className="text-[9px] font-medium text-white/55">{game.caption}</span>}
                <span className="mt-0.5 rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold text-white/70 tabular-nums">
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
