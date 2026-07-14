"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

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

/** BOT用のモノクロSVGグリフ5種(黒枠線Swissに合わせ、白円+黒アイコンで表示)。
 * bot1〜bot5(=5キャラクター)ごとに別デザイン。fill=currentColorでink-950を継承。 */
const BOT_GLYPHS: ReactNode[] = [
  // 1: ロボットの顔(アンテナ付き)
  <g key="1">
    <path d="M12 3v2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="12" cy="2.6" r="1" fill="currentColor" />
    <rect x="5.5" y="6.5" width="13" height="11" rx="3" fill="currentColor" />
    <circle cx="9.5" cy="11.5" r="1.5" fill="white" />
    <circle cx="14.5" cy="11.5" r="1.5" fill="white" />
    <rect x="9" y="14.5" width="6" height="1.6" rx="0.8" fill="white" />
  </g>,
  // 2: ダイヤ型の顔
  <g key="2">
    <path d="M12 3.5 20 12l-8 8.5L4 12z" fill="currentColor" />
    <circle cx="9.6" cy="11.4" r="1.3" fill="white" />
    <circle cx="14.4" cy="11.4" r="1.3" fill="white" />
    <path d="M9.5 15q2.5 2 5 0" stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round" />
  </g>,
  // 3: バイザー型ロボット
  <g key="3">
    <circle cx="12" cy="12" r="8.5" fill="currentColor" />
    <rect x="6.5" y="9.5" width="11" height="4.2" rx="2.1" fill="white" />
    <circle cx="9.5" cy="11.6" r="1.1" fill="currentColor" />
    <circle cx="14.5" cy="11.6" r="1.1" fill="currentColor" />
  </g>,
  // 4: 角のある魔物(リバーに住む魔物)
  <g key="4">
    <path d="M6 6.5 8.5 10M18 6.5 15.5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M4.5 13a7.5 6 0 0 1 15 0v3.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" fill="currentColor" />
    <circle cx="9.3" cy="12.5" r="1.4" fill="white" />
    <circle cx="14.7" cy="12.5" r="1.4" fill="white" />
    <path d="M9 16h6l-1 1.6h-4z" fill="white" />
  </g>,
  // 5: デュオ(ラフ&バリィ)
  <g key="5">
    <circle cx="9" cy="12" r="5.5" fill="currentColor" />
    <circle cx="15" cy="12" r="5.5" fill="currentColor" stroke="white" strokeWidth="1.2" />
    <circle cx="7.6" cy="11.4" r="1" fill="white" />
    <circle cx="16.4" cy="11.4" r="1" fill="white" />
  </g>,
];

function botIndexOf(avatarKey: string): number {
  const m = /^bot(\d+)$/.exec(avatarKey);
  if (m) return (Number(m[1]) - 1 + BOT_GLYPHS.length) % BOT_GLYPHS.length;
  return hashToIndex(avatarKey, BOT_GLYPHS.length);
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
  const isBot = typeof avatarKey === "string" && /^bot\d+$/.test(avatarKey);
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
      ) : isBot ? (
        <div
          className="absolute rounded-full bg-white flex items-center justify-center select-none ring-[1.5px] ring-ink-950 text-ink-950 overflow-hidden"
          style={innerBoxStyle}
        >
          <svg viewBox="0 0 24 24" style={{ width: (size - pad * 2) * 0.78, height: (size - pad * 2) * 0.78 }}>
            {BOT_GLYPHS[botIndexOf(avatarKey as string)]}
          </svg>
        </div>
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
