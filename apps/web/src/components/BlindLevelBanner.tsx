"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FADE } from "@/lib/motion";

/**
 * ブラインドが上がったことを知らせるカプセル(オーナー指示)。ヘッダーのすぐ下に上から伸びて出て、
 * 2.5秒で自動で戻る。タップですぐ閉じる。卓の操作は塞がない。
 * 出すのは、新しい額で最初のハンドが配られたとき(= ハンドのビッグブラインドが変わったとき)。
 * 表記は「Blind Level Up」と「SB / BB (Ante)  1,000 / 2,000 (2,000)」(アンティは必ずある)。
 */
const SHOW_MS = 2500;
const CAPSULE_SPRING = { type: "spring", bounce: 0.25, duration: 0.5 } as const;

export function BlindLevelBanner({
  handBigBlind,
  level,
  top,
}: {
  /** いま配られているハンドのビッグブラインド。 */
  handBigBlind: number | null | undefined;
  level: { smallBlind: number; bigBlind: number; bbAnte: number } | null | undefined;
  /** 出す位置(ヘッダーの下端)。 */
  top: string;
}) {
  const reduce = useReducedMotion();
  const prev = useRef<number | null>(null);
  const [shown, setShown] = useState<{ sb: number; bb: number; ante: number } | null>(null);

  useEffect(() => {
    if (!handBigBlind) return;
    const before = prev.current;
    prev.current = handBigBlind;
    if (before === null || before === handBigBlind || handBigBlind < before) return;
    setShown({
      sb: level?.bigBlind === handBigBlind ? level.smallBlind : Math.round(handBigBlind / 2),
      bb: handBigBlind,
      ante: level?.bigBlind === handBigBlind ? level.bbAnte : handBigBlind,
    });
  }, [handBigBlind, level]);

  useEffect(() => {
    if (!shown) return;
    const id = window.setTimeout(() => setShown(null), SHOW_MS);
    return () => window.clearTimeout(id);
  }, [shown]);

  const fmt = (n: number) => n.toLocaleString("en-US");
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4" style={{ top }}>
      <AnimatePresence>
        {shown && (
          <motion.button
            type="button"
            key={shown.bb}
            onClick={() => setShown(null)}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scaleX: 0.4, scaleY: 0.6, y: -12, filter: "blur(6px)" }}
            animate={{ opacity: 1, scaleX: 1, scaleY: 1, y: 0, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scaleX: 0.5, scaleY: 0.7, y: -10, filter: "blur(6px)" }}
            transition={reduce ? FADE : CAPSULE_SPRING}
            className="pointer-events-auto mt-2 flex flex-col items-center rounded-full bg-black/70 px-5 py-2 shadow-e3 ring-1 ring-white/10 backdrop-blur-xl"
            aria-live="polite"
          >
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-accent">Blind Level Up</span>
            <span className="mt-0.5 text-[13px] font-bold tabular-nums text-fg">
              <span className="text-fg-2">SB / BB (Ante)</span>
              {"  "}
              {fmt(shown.sb)} / {fmt(shown.bb)} ({fmt(shown.ante)})
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
