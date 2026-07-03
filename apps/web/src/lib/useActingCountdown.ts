"use client";

import { useEffect, useState } from "react";

const ACTION_CLOCK_SECONDS = 20;

/**
 * アクティブな座席が変わるたびに20秒からカウントダウンする、表示用のタイマー。
 * サーバー側にタイムアウト強制フォールドの仕組みは無いため、あくまで見た目上の目安表示。
 */
export function useActingCountdown(actingSeatIndex: number | null): number {
  const [secondsLeft, setSecondsLeft] = useState(ACTION_CLOCK_SECONDS);

  useEffect(() => {
    setSecondsLeft(ACTION_CLOCK_SECONDS);
    if (actingSeatIndex === null) return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [actingSeatIndex]);

  return secondsLeft;
}
