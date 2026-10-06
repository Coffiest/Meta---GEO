"use client";

import type { ReactNode } from "react";
import { REVIEW_SPEAKER } from "@/data/reviewSpeaker";

/**
 * バリィ(案内役のキャラクター)が話しかける吹き出し。棋譜解析の解説と同じ形
 * (左に立ち絵、右に名前つきの吹き出し、しっぽは立ち絵の側)。ご意見フォームやチュートリアルで使う。
 */
export function BallyBubble({
  children,
  size = "md",
  className = "",
}: {
  children: ReactNode;
  /** 立ち絵の大きさ。sm = 44px / md = 56px / lg = 76px */
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const speaker = REVIEW_SPEAKER;
  const h = size === "sm" ? "h-11" : size === "lg" ? "h-[76px]" : "h-14";
  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      {speaker && (
        // 画像は 331×419(比率を保つ)。暗い地でも白い体と黒い輪郭で浮くよう透過済み。
        // eslint-disable-next-line @next/next/no-img-element -- 小さな立ち絵。最適化の経路を通す必要が無い
        <img
          src={speaker.avatarSrc}
          alt={speaker.name}
          draggable={false}
          className={`${h} w-auto shrink-0 select-none`}
          style={{ aspectRatio: "331 / 419" }}
        />
      )}
      <div className="relative min-w-0 flex-1">
        <div className="rounded-2xl border border-line bg-surface-2 px-3 py-2">
          {speaker && <span className="mb-0.5 block text-[10px] font-black text-accent">{speaker.name}</span>}
          <div className="text-[12px] font-semibold leading-[1.65] text-fg">{children}</div>
        </div>
        {speaker && (
          <span
            aria-hidden
            className="pointer-events-none absolute -left-[5px] top-[18px] h-2.5 w-2.5 rotate-45 border-b border-l border-line bg-surface-2"
          />
        )}
      </div>
    </div>
  );
}
