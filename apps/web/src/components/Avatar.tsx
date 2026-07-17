"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 残り持ち時間をアバターの周囲を一周する円弧で表現するリング(SunVy Poker方式)。
 * endsAt(ms epoch)までの残量をrequestAnimationFrameで描画する。
 */
function CountdownRing({ endsAt, durationMs, size }: { endsAt: number; durationMs: number; size: number }) {
  const [fraction, setFraction] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(() => Math.ceil(Math.max(0, endsAt - Date.now()) / 1000));
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, endsAt - Date.now());
      setFraction(Math.min(1, remaining / durationMs));
      setSecondsLeft(Math.ceil(remaining / 1000));
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
    <>
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
      {/* 残り秒数をアイコン中央に数字表示(SunVy/ポーカーチェイス方式)。黒フチ白抜きで視認性確保。 */}
      <div
        className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center font-black tabular-nums"
        style={{
          fontSize: Math.round(size * 0.42),
          color,
          textShadow: "0 1px 2px rgba(255,255,255,0.9), 0 0 3px rgba(255,255,255,0.9)",
        }}
      >
        {secondsLeft}
      </div>
    </>
  );
}

/** アイコン未設定(BOT含む)のプレイヤー用のモノクロ人型シルエット。
 * 白背景・黒(ink-950)の人アイコンで、頭文字やBOTキャラは使わず全員この共通アイコンにする。
 * 円形コンテナ(overflow-hidden)で肩の両端が自然にトリミングされ、胸像風のアバターになる。 */
function PersonGlyph() {
  return (
    <path
      fill="currentColor"
      d="M12 12.4c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5Zm0 2.1c-3.9 0-9.6 1.96-9.6 5.85V22h19.2v-1.65c0-3.89-5.7-5.85-9.6-5.85Z"
    />
  );
}

/**
 * ユーザーのアイコン表示。カメラロールから選んだ画像(data URI)が設定されていればそれを、
 * 未設定(BOT含む)なら共通のモノクロ人型シルエットを表示する(頭文字・BOTキャラアバターは廃止)。
 */
export function Avatar({
  avatarKey,
  displayName,
  size = 36,
  timer,
}: {
  avatarKey: string | null | undefined;
  /** 現状は未使用だが、呼び出し側の互換性のため受け取る(将来のツールチップ等に備える)。 */
  displayName?: string;
  size?: number;
  timer?: { endsAt: number; durationMs: number } | null;
}) {
  const isPhoto = typeof avatarKey === "string" && avatarKey.startsWith("data:image/");
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
          className="absolute rounded-full bg-white flex items-end justify-center select-none ring-[1.5px] ring-ink-950 text-ink-950 overflow-hidden"
          style={innerBoxStyle}
        >
          <svg viewBox="0 0 24 24" style={{ width: size - pad * 2, height: size - pad * 2 }} aria-hidden>
            <PersonGlyph />
          </svg>
        </div>
      )}
      {/* タイマー表示中はアイコンを少し暗くして、中央の残り秒数(色付き数字)を見やすくする。
          画像/BOT/頭文字いずれのアバターでも一様に効くよう、内側ボックスに黒の半透明を重ねる。 */}
      {timer && (
        <div aria-hidden className="pointer-events-none absolute z-20 rounded-full bg-black/40" style={innerBoxStyle} />
      )}
      {timer && <CountdownRing endsAt={timer.endsAt} durationMs={timer.durationMs} size={size} />}
    </div>
  );
}
