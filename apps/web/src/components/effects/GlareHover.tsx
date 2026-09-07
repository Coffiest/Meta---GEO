"use client";

/**
 * React Bits (https://reactbits.dev/animations/glare-hover) の GlareHover を移植。
 * ライセンス: MIT + Commons Clause v1.0, Copyright (c) 2026 David Haz — 詳細は
 * `@/lib/reactBitsNotice` を参照。
 *
 * Poker ART向けの変更点:
 * - 既定の背景(#000)・枠線(#333)・グレア色(白)は、白背景のSwissデザインでは浮くため、
 *   すべて transparent / gold-500 系に変更。既存のカードに重ねて使う前提にしている。
 * - prefers-reduced-motion を尊重する(元実装は常にアニメーションする)。
 * - `autoPlay` を追加。元実装は hover 発火のみで、タッチ端末では一生グレアが出ない。
 *   モバイル中心の画面(オンボーディング等)ではマウント時に一度だけ自動再生できるようにした。
 */
import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";

interface GlareHoverProps {
  width?: string;
  height?: string;
  background?: string;
  borderRadius?: string;
  borderColor?: string;
  children?: ReactNode;
  glareColor?: string;
  glareOpacity?: number;
  glareAngle?: number;
  glareSize?: number;
  transitionDuration?: number;
  playOnce?: boolean;
  /** マウント時に一度だけ自動再生する(タッチ端末でhoverが発火しない画面向け)。 */
  autoPlay?: boolean;
  autoPlayDelay?: number;
  className?: string;
  style?: CSSProperties;
}

export function GlareHover({
  width = "100%",
  height = "auto",
  background = "transparent",
  borderRadius = "16px",
  borderColor = "transparent",
  children,
  glareColor = "#f2a900",
  glareOpacity = 0.35,
  glareAngle = -45,
  glareSize = 250,
  transitionDuration = 650,
  playOnce = false,
  autoPlay = false,
  autoPlayDelay = 400,
  className = "",
  style = {},
}: GlareHoverProps) {
  const hex = glareColor.replace("#", "");
  let rgba = glareColor;
  if (/^[\dA-Fa-f]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    rgba = `rgba(${r}, ${g}, ${b}, ${glareOpacity})`;
  } else if (/^[\dA-Fa-f]{3}$/.test(hex)) {
    const r = parseInt((hex[0] ?? "0") + (hex[0] ?? "0"), 16);
    const g = parseInt((hex[1] ?? "0") + (hex[1] ?? "0"), 16);
    const b = parseInt((hex[2] ?? "0") + (hex[2] ?? "0"), 16);
    rgba = `rgba(${r}, ${g}, ${b}, ${glareOpacity})`;
  }

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const reducedMotionRef = useRef<boolean | null>(null);
  const prefersReducedMotion = (): boolean => {
    if (reducedMotionRef.current === null) {
      reducedMotionRef.current =
        typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    }
    return reducedMotionRef.current;
  };

  const animateIn = () => {
    if (prefersReducedMotion()) return;
    const el = overlayRef.current;
    if (!el) return;

    el.style.transition = "none";
    el.style.backgroundPosition = "-100% -100%, 0 0";
    el.style.transition = `${transitionDuration}ms ease`;
    el.style.backgroundPosition = "100% 100%, 0 0";
  };

  useEffect(() => {
    if (!autoPlay) return;
    const timer = window.setTimeout(animateIn, autoPlayDelay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時に一度だけ再生する意図
  }, []);

  const animateOut = () => {
    const el = overlayRef.current;
    if (!el) return;

    if (playOnce || prefersReducedMotion()) {
      el.style.transition = "none";
      el.style.backgroundPosition = "-100% -100%, 0 0";
    } else {
      el.style.transition = `${transitionDuration}ms ease`;
      el.style.backgroundPosition = "-100% -100%, 0 0";
    }
  };

  const overlayStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    background: `linear-gradient(${glareAngle}deg,
        hsla(0,0%,0%,0) 60%,
        ${rgba} 70%,
        hsla(0,0%,0%,0) 100%)`,
    backgroundSize: `${glareSize}% ${glareSize}%, 100% 100%`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "-100% -100%, 0 0",
    pointerEvents: "none",
  };

  return (
    <div
      className={`relative grid place-items-center overflow-hidden border ${className}`}
      style={{ width, height, background, borderRadius, borderColor, ...style }}
      onMouseEnter={animateIn}
      onMouseLeave={animateOut}
    >
      <div ref={overlayRef} style={overlayStyle} />
      {children}
    </div>
  );
}
