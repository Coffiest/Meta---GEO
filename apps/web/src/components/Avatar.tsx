"use client";

import { useEffect, useRef, useState } from "react";

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

  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const color = fraction > 0.5 ? "#1fae70" : fraction > 0.2 ? "#f59e0b" : "#e5484d";

  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(10,10,10,0.12)" strokeWidth={stroke} />
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

const INITIAL_BG_CLASSES = [
  "bg-gradient-to-br from-mint-500 to-emerald-700",
  "bg-gradient-to-br from-azure-500 to-blue-700",
  "bg-gradient-to-br from-crimson-500 to-rose-700",
  "bg-gradient-to-br from-amber-500 to-orange-700",
  "bg-gradient-to-br from-violet-500 to-purple-700",
];

function hashToIndex(input: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h % mod;
}

/**
 * ユーザーのアイコン表示。カメラロールから選んだ画像(data URI)が設定されていればそれを、
 * 未設定なら表示名の頭文字を色付き円で表示する(プリセットアバターは廃止)。
 */
export function Avatar({
  avatarKey,
  displayName,
  size = 36,
  timer,
}: {
  avatarKey: string | null | undefined;
  /** avatarKey未設定時の頭文字アバターに使う表示名。省略時は "?"。 */
  displayName?: string;
  size?: number;
  timer?: { endsAt: number; durationMs: number } | null;
}) {
  const isPhoto = typeof avatarKey === "string" && avatarKey.startsWith("data:image/");
  const initial = (displayName?.trim()?.[0] ?? "?").toUpperCase();
  const bgClass = INITIAL_BG_CLASSES[hashToIndex(displayName ?? "?", INITIAL_BG_CLASSES.length)];
  // タイマーリングの分だけ内側に余白を取る。絶対配置のimg(置換要素)はinset指定だけでは
  // width/heightがコンテナいっぱいのまま縮まらず(right/bottomのinsetが無視される)リングと
  // 中心がズレる原因になっていたため、top/left/width/heightをすべてpx値で明示する。
  const pad = timer ? 6 : 3;
  const innerBoxStyle = { top: pad, left: pad, width: size - pad * 2, height: size - pad * 2 };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {isPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarKey}
          alt=""
          draggable={false}
          className="absolute rounded-full object-cover select-none ring-1 ring-black/20"
          style={innerBoxStyle}
        />
      ) : (
        <div
          className={`absolute rounded-full ${bgClass} flex items-center justify-center select-none ring-1 ring-black/20 text-white font-bold`}
          style={{ ...innerBoxStyle, fontSize: size * 0.4 }}
        >
          {initial}
        </div>
      )}
      {timer && <CountdownRing endsAt={timer.endsAt} durationMs={timer.durationMs} size={size} />}
    </div>
  );
}
