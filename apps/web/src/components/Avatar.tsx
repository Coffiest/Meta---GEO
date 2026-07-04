"use client";

import { useEffect, useRef, useState } from "react";
import { avatarFor } from "@/lib/avatars";

/**
 * 残り持ち時間をアバターの周囲を一周する円弧で表現するリング(SunVy Poker方式)。
 * endsAt(ms epoch)までの残量をrequestAnimationFrameで描画する。
 */
function CountdownRing({ endsAt, durationMs, size }: { endsAt: number; durationMs: number; size: number }) {
  const [fraction, setFraction] = useState(1);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, endsAt - Date.now());
      setFraction(Math.min(1, remaining / durationMs));
      if (remaining > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [endsAt, durationMs]);

  const stroke = 3;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const color = fraction > 0.5 ? "#1fae70" : fraction > 0.2 ? "#f59e0b" : "#e5484d";

  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
      />
    </svg>
  );
}

export function Avatar({
  avatarKey,
  size = 36,
  timer,
}: {
  avatarKey: string | null | undefined;
  size?: number;
  timer?: { endsAt: number; durationMs: number } | null;
}) {
  const def = avatarFor(avatarKey);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={`absolute inset-[3px] rounded-full ${def.bg} flex items-center justify-center select-none ring-1 ring-black/20`}
        style={{ fontSize: size * 0.45 }}
      >
        {def.emoji}
      </div>
      {timer && <CountdownRing endsAt={timer.endsAt} durationMs={timer.durationMs} size={size} />}
    </div>
  );
}
