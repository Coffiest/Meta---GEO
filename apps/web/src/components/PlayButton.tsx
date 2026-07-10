"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { GameKey } from "@/lib/socket";

interface GameChoice {
  key: GameKey;
  title: string;
  caption?: string;
  detail: string;
  buyIn: number;
}

/**
 * ホーム画面の主役ボタン。タップすると、単一のボタンが泡が分裂するように2つの選択肢
 * (Sit&Go / MTT)へアニメーションで分かれる。もう一度背景をタップすると元の単一ボタンに戻る。
 */
export function PlayButton({ games, onJoin }: { games: GameChoice[]; onJoin: (key: GameKey) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative flex justify-center py-2" style={{ minHeight: 86 }}>
      {expanded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[5]"
          onClick={() => setExpanded(false)}
          aria-label="閉じる"
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
            className="relative flex h-[76px] w-[260px] items-center justify-center rounded-[26px] bg-gradient-to-br from-ink-800 via-ink-950 to-black ring-1 ring-white/10 shadow-[0_10px_32px_-8px_rgba(0,0,0,0.55),0_2px_8px_rgba(0,0,0,0.3)]"
          >
            <span className="text-[19px] font-black tracking-wide text-white">プレイする</span>
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
                className="flex h-[86px] w-[128px] flex-col items-center justify-center gap-0.5 rounded-3xl bg-gradient-to-br from-ink-800 via-ink-950 to-black ring-1 ring-white/10 shadow-panel"
              >
                <span className="text-[15px] font-bold tracking-wide text-white">{game.title}</span>
                {game.caption && <span className="text-[9px] font-medium text-white/60">{game.caption}</span>}
                <span className="text-[9px] font-semibold text-white/60">バイイン {game.buyIn.toLocaleString()}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
