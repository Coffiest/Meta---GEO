"use client";

/**
 * React Bits (https://reactbits.dev/components/counter) の Counter を移植(命名は
 * このアプリの `useCountUp` フックと区別するため `DigitRoll` に変更)。
 * ライセンス: MIT + Commons Clause v1.0, Copyright (c) 2026 David Haz — 詳細は
 * `@/lib/reactBitsNotice` を参照。
 *
 * Poker ART向けの変更点:
 * - `motion/react` から `framer-motion` へ差し替え(BlurText.tsxと同じ理由)。
 * - 上下のグラデーションフェード既定色を黒(ダーク背景前提)から白へ変更。
 *   白背景のSwissデザインではフェードが暗い帯として浮いてしまうため。
 *
 * 数字1桁ずつがオドメーター(自動車の走行距離計)のように回転して切り替わる。
 * `useCountUp`(単純な線形/イージング補間でテキストを書き換えるだけ)より視覚的な
 * 「めくれ」を伴うため、金額・順位など"見せ場"にしたい数値にだけ使う。
 */
import { motion, useSpring, useTransform, type MotionValue } from "framer-motion";
import type { CSSProperties } from "react";
import { useEffect } from "react";

type PlaceValue = number | ".";

function DigitFace({ mv, digit, height }: { mv: MotionValue<number>; digit: number; height: number }) {
  const y = useTransform(mv, (latest) => {
    const placeValue = latest % 10;
    const offset = (10 + digit - placeValue) % 10;
    let memo = offset * height;
    if (offset > 5) memo -= 10 * height;
    return memo;
  });

  const baseStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return <motion.span style={{ ...baseStyle, y }}>{digit}</motion.span>;
}

function normalizeNearInteger(num: number): number {
  const nearest = Math.round(num);
  const tolerance = 1e-9 * Math.max(1, Math.abs(num));
  return Math.abs(num - nearest) < tolerance ? nearest : num;
}

function getValueRoundedToPlace(value: number, place: number): number {
  const scaled = value / place;
  return Math.floor(normalizeNearInteger(scaled));
}

function Digit({
  place,
  value,
  height,
  digitStyle,
}: {
  place: PlaceValue;
  value: number;
  height: number;
  digitStyle?: CSSProperties;
}) {
  if (place === ".") {
    return (
      <span className="relative inline-flex items-center justify-center" style={{ height, width: "fit-content", ...digitStyle }}>
        .
      </span>
    );
  }

  const valueRoundedToPlace = getValueRoundedToPlace(value, place);
  const animatedValue = useSpring(valueRoundedToPlace);

  useEffect(() => {
    animatedValue.set(valueRoundedToPlace);
  }, [animatedValue, valueRoundedToPlace]);

  const defaultStyle: CSSProperties = {
    height,
    position: "relative",
    width: "1ch",
    fontVariantNumeric: "tabular-nums",
  };

  return (
    <span className="relative inline-flex overflow-hidden" style={{ ...defaultStyle, ...digitStyle }}>
      {Array.from({ length: 10 }, (_, i) => (
        <DigitFace key={i} mv={animatedValue} digit={i} height={height} />
      ))}
    </span>
  );
}

interface DigitRollProps {
  value: number;
  fontSize?: number;
  padding?: number;
  places?: PlaceValue[];
  gap?: number;
  borderRadius?: number;
  horizontalPadding?: number;
  textColor?: string;
  fontWeight?: CSSProperties["fontWeight"];
  containerStyle?: CSSProperties;
  counterStyle?: CSSProperties;
  digitStyle?: CSSProperties;
  gradientHeight?: number;
  gradientFrom?: string;
  gradientTo?: string;
}

export function DigitRoll({
  value,
  fontSize = 40,
  padding = 0,
  places = [...value.toString()].map((ch, i, a) => {
    if (ch === ".") return ".";
    const dotIndex = a.indexOf(".");
    const isInteger = dotIndex === -1;
    const exponent = isInteger ? a.length - i - 1 : i < dotIndex ? dotIndex - i - 1 : -(i - dotIndex);
    return 10 ** exponent;
  }),
  gap = 2,
  borderRadius = 4,
  horizontalPadding = 0,
  textColor = "inherit",
  fontWeight = "inherit",
  containerStyle,
  counterStyle,
  digitStyle,
  gradientHeight = 10,
  gradientFrom = "white",
  gradientTo = "rgba(255, 255, 255, 0)",
}: DigitRollProps) {
  const height = fontSize + padding;

  const defaultContainerStyle: CSSProperties = { position: "relative", display: "inline-block" };

  const defaultCounterStyle: CSSProperties = {
    fontSize,
    display: "flex",
    gap,
    overflow: "hidden",
    borderRadius,
    paddingLeft: horizontalPadding,
    paddingRight: horizontalPadding,
    lineHeight: 1,
    color: textColor,
    fontWeight,
    direction: "ltr",
  };

  const gradientContainerStyle: CSSProperties = {
    pointerEvents: "none",
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  };

  const topGradientStyle: CSSProperties = { height: gradientHeight, background: `linear-gradient(to bottom, ${gradientFrom}, ${gradientTo})` };
  const bottomGradientStyle: CSSProperties = { height: gradientHeight, background: `linear-gradient(to top, ${gradientFrom}, ${gradientTo})` };

  return (
    <span style={{ ...defaultContainerStyle, ...containerStyle }}>
      <span style={{ ...defaultCounterStyle, ...counterStyle }}>
        {places.map((place, i) => (
          // eslint-disable-next-line react/no-array-index-key -- 桁位置は再配列されないためindexで安定
          <Digit key={i} place={place} value={value} height={height} digitStyle={digitStyle} />
        ))}
      </span>
      <span style={gradientContainerStyle}>
        <span style={topGradientStyle} />
        <span style={bottomGradientStyle} />
      </span>
    </span>
  );
}
