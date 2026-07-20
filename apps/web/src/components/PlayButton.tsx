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
 * ホーム画面の主役CTA(Appleネイティブ風)。
 * 微細な縦グラデーション+内側ハイライト+柔らかな落ち影のカプセルボタンで、iOSの
 * Filled Buttonの質感を再現する。タップすると泡が分裂するように Sit&Go / MTT の
 * 2択カードへスプリングで展開し、背景タップで元に戻る。配色は周囲と同じ ink+gold。
 */

/** iOSボタンの質感: 縦グラデ+内側トップハイライト+2層シャドウ。 */
const CAPSULE_SURFACE: React.CSSProperties = {
  background: "linear-gradient(180deg, #2b2b2e 0%, #161618 55%, #0a0a0a 100%)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.5), 0 12px 28px -10px rgba(10,10,10,0.45), 0 2px 6px rgba(10,10,10,0.18)",
};

/** SF Symbols風の再生グリフ(角丸トライアングル)。 */
function PlayGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8.5 5.9c0-1.5 1.6-2.4 2.9-1.7l9.2 5.4c1.3.7 1.3 2.6 0 3.4l-9.2 5.4c-1.3.7-2.9-.2-2.9-1.7V5.9Z" />
    </svg>
  );
}

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
              initial={{ opacity: 0, scale: 0.9, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", damping: 22, stiffness: 300 }}
              onClick={() => setExpanded(true)}
              aria-label={t("play.play")}
              className="relative flex h-[64px] w-[248px] items-center justify-center gap-3 rounded-full text-white"
              style={CAPSULE_SURFACE}
            >
              {/* 再生グリフ: ゴールドの円プレートに黒トライアングル(唯一のアクセント) */}
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-500 text-ink-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_3px_rgba(10,10,10,0.35)]">
                <PlayGlyph />
              </span>
              <span className="text-[21px] font-bold tracking-[-0.02em]">Play</span>
              {/* カプセル表面の微細な光沢(上半分のガラスハイライト) */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-2 top-[2px] h-1/2 rounded-full"
                style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0))" }}
              />
            </motion.button>
          ) : (
            <motion.div key="split" className="flex items-center gap-3.5">
              {games.map((game, i) => (
                <motion.button
                  key={game.key}
                  layoutId={i === 0 ? "play-bubble" : undefined}
                  initial={{ opacity: 0, scale: 0.4, x: i === 0 ? 40 : -40 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.4, x: i === 0 ? 40 : -40 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", damping: 18, stiffness: 280, delay: i * 0.04 }}
                  onClick={() => onJoin(game.key)}
                  className="relative flex h-[92px] w-[132px] flex-col items-center justify-center gap-1 overflow-hidden rounded-[24px] text-white"
                  style={CAPSULE_SURFACE}
                >
                  <span className="text-[16px] font-bold tracking-[-0.01em]">{game.title}</span>
                  {game.caption && <span className="text-[9px] font-medium text-white/55">{game.caption}</span>}
                  <span className="mt-1 rounded-full bg-white/[0.09] px-2.5 py-0.5 text-[10px] font-semibold text-white/75 tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    {t("play.buyIn")} {game.buyIn.toLocaleString()}
                  </span>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-1.5 top-[2px] h-1/3 rounded-[20px]"
                    style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0))" }}
                  />
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
