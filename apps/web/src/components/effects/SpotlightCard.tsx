"use client";

/**
 * React Bits (https://reactbits.dev/components/spotlight-card) の SpotlightCard を移植。
 * ライセンス: MIT + Commons Clause v1.0, Copyright (c) 2026 David Haz — 詳細は
 * `@/lib/reactBitsNotice` を参照。
 *
 * Poker ART向けの変更点:
 * - 既定のダークテーマ(bg-neutral-900 border-neutral-800)を、白背景のSwissデザインに合わせて
 *   白地+ink枠に変更。className側からの上書きに頼らず、この移植元でデフォルト自体を直す
 *   (Tailwindはユーティリティクラスの勝敗を並び順ではなく生成CSS順で決めるため、後から
 *   className で色を上書きできる保証が無い。詳細は components/ui/Button.tsx 参照)。
 * - 既定のスポットライト色を白(ダーク背景前提)からgold-500の淡い光に変更。
 */
import { useRef, useState } from "react";
import type { MouseEventHandler, PropsWithChildren } from "react";

interface Position {
  x: number;
  y: number;
}

interface SpotlightCardProps extends PropsWithChildren {
  className?: string;
  spotlightColor?: string;
}

export function SpotlightCard({
  children,
  className = "",
  spotlightColor = "rgba(242, 169, 0, 0.16)",
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove: MouseEventHandler<HTMLDivElement> = (e) => {
    if (!divRef.current || isFocused) return;

    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleFocus = () => {
    setIsFocused(true);
    setOpacity(1);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setOpacity(0);
  };

  const handleMouseEnter = () => setOpacity(1);
  const handleMouseLeave = () => setOpacity(0);

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden rounded-2xl border border-ink-200 bg-white ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 ease-in-out"
        style={{
          opacity,
          background: `radial-gradient(circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 70%)`,
        }}
      />
      {children}
    </div>
  );
}
