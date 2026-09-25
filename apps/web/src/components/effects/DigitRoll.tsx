"use client";

/**
 * React Bits (https://reactbits.dev/components/counter) の Counter を移植(命名は
 * このアプリの `useCountUp` フックと区別するため `DigitRoll` に変更)。
 * ライセンス: MIT + Commons Clause v1.0, Copyright (c) 2026 David Haz — 詳細は
 * `@/lib/reactBitsNotice` を参照。
 *
 * Poker ART向けの変更点:
 * - `motion/react` から `framer-motion` へ差し替え(BlurText.tsxと同じ理由)。
 * - 上下のグラデーションフェード既定色を黒からアプリのcanvas色(#1c1c1e)へ変更。
 *   元の黒(#000)はcanvasより僅かに暗く、フェードの継ぎ目が薄い帯として見えてしまうため。
 * - `from` を追加した。元実装は `useSpring(valueRoundedToPlace)` で初期値を「目標値」に
 *   設定しており、マウント直後のuseEffectが同じ値を`.set()`するだけなので実際には
 *   何も動かない(値が後から変わったときだけ、めくり演出が起きる)。このアプリでは
 *   「マウント時に一度だけめくって見せる」用途で使うため、初期値を`from`(既定0)にして
 *   マウント後に目標値へ`.set()`することで、その差分がそのまま初回のめくり演出になる。
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
  from,
  height,
  digitStyle,
}: {
  place: PlaceValue;
  value: number;
  /** マウント直後の初期表示値。ここと`value`の差分が初回のめくり演出になる。 */
  from: number;
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
  // 初期値は from 側で作る。mount直後にvalue側へ.set()するので、from !== value なら
  // その1回だけ必ずスプリングが動く(値が同じなら静止したままで正しい)。
  const animatedValue = useSpring(getValueRoundedToPlace(from, place));

  useEffect(() => {
    animatedValue.set(valueRoundedToPlace);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fromは初期値にのみ使い、以後の変化には反応させない
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
  /** マウント時の初期値。既定は0(=ゼロから目標値までめくって見せる)。 */
  from?: number;
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
  from = 0,
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
  gradientFrom = "#1c1c1e",
  gradientTo = "rgba(28, 28, 30, 0)",
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
          <Digit key={i} place={place} value={value} from={from} height={height} digitStyle={digitStyle} />
        ))}
      </span>
      <span style={gradientContainerStyle}>
        <span style={topGradientStyle} />
        <span style={bottomGradientStyle} />
      </span>
    </span>
  );
}
