"use client";

import { useEffect, useRef, useState } from "react";

/**
 * from→to へ easeOutCubic で数値をアニメーションさせる共通フック。
 * 結果画面(TournamentResultScreen)とStatsの主要数値で共用する。
 */
export function useCountUp(from: number, to: number, durationMs = 1200, startDelayMs = 300): number {
  const [value, setValue] = useState(from);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    let start = 0;
    let timer: ReturnType<typeof setTimeout>;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    const tick = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / durationMs);
      setValue(from + (to - from) * ease(p));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    timer = setTimeout(() => {
      rafRef.current = requestAnimationFrame(tick);
    }, startDelayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(rafRef.current);
    };
  }, [from, to, durationMs, startDelayMs]);
  return value;
}
