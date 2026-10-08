"use client";

import { useEffect, useState } from "react";

/**
 * 読み込み中の表示。アプリ全体でこの1つに統一する。
 *
 * ハートの輪郭を描き進めながら、光点が同じ輪郭上を旅する(出典: uiverse.io by G27XLEO。
 * 原案の赤は、アクセントは1色のみ運用というこのアプリのきまりに合わせアクセント色へ
 * 差し替えてある)。SVGのviewBoxで比率を持たせているので、ラッパーの幅高さを変えるだけで
 * 相似縮小できる(pxキーフレーム直書きだった旧・跳ねる玉版のように全体をtransform:scaleする
 * 必要がない)。
 */
const HEART_PULSE_PATH =
  "M50 88 C18 62 6 40 6 24 C6 10 18 2 32 2 C42 2 50 8 50 20 C50 8 58 2 68 2 C82 2 94 10 94 24 C94 40 82 62 50 88 Z";

const SCALE: Record<"sm" | "md" | "lg", number> = {
  /** ボタンや行の中に混ぜる用。 */
  sm: 0.3,
  /** カード内・セクション内の既定。 */
  md: 0.55,
  /** 画面全体が読み込み中のとき。 */
  lg: 1,
};

/**
 * 画面・枠の読み込みは、卓と同じトランプの表8枚が輪になって回る表示(オーナー指示。
 * 出典: uiverse.io by ilkhoeri。枠は付けない)。8枚は毎回ランダム。1周8秒。
 * ボタンの中の小さな表示(size="sm")は従来のハートのまま(小さすぎて輪が見えないため)。
 */
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];
const SUITS = ["s", "h", "d", "c"];
const RING_COUNT = 8;
const CARD_W: Record<"md" | "lg", number> = { md: 30, lg: 52 };

function assetOf(card: string): string {
  const r = card[0]!;
  const n = r === "A" ? 1 : r === "K" ? 13 : r === "Q" ? 12 : r === "J" ? 11 : r === "T" ? 10 : Number(r);
  return `/cards/${n}${card[1]}.png`;
}

function randomCards(): string[] {
  const deck = RANKS.flatMap((r) => SUITS.map((s) => r + s));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck.slice(0, RING_COUNT);
}

function CardRing({ size, label, className }: { size: "md" | "lg"; label: string; className: string }) {
  // 乱数はサーバー描画と食い違わないよう、表示してから決める。
  const [cards, setCards] = useState<string[] | null>(null);
  useEffect(() => setCards(randomCards()), []);
  const w = CARD_W[size];
  const h = Math.round((w * 1039) / 744);
  const radius = Math.round(w * 1.7);
  const box = radius * 2 + w;
  return (
    <span
      role="status"
      aria-label={label}
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: box, height: h * 1.9 }}
    >
      <span
        aria-hidden
        className="card-ring absolute"
        style={{ width: w, height: h, left: (box - w) / 2, top: h * 0.45 }}
      >
        {cards?.map((c, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={c}
            src={assetOf(c)}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full select-none rounded-[4px] object-contain"
            style={{ transform: `rotateY(${(360 / RING_COUNT) * i}deg) translateZ(${radius}px)` }}
          />
        ))}
      </span>
    </span>
  );
}

export function Loader({
  size = "md",
  label = "読み込み中",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  /** 読み上げ用のラベル。視覚的には出さない。 */
  label?: string;
  className?: string;
}) {
  if (size !== "sm") return <CardRing size={size} label={label} className={className} />;
  return (
    <span
      role="status"
      aria-label={label}
      className={`loader inline-block shrink-0 ${className}`}
      style={{ ["--loader-scale" as string]: SCALE[size] }}
    >
      <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" className="loader-heart">
        <path className="loader-heart-line" pathLength={1} d={HEART_PULSE_PATH} />
        <path className="loader-heart-point" pathLength={1} d={HEART_PULSE_PATH} />
      </svg>
    </span>
  );
}

/** 領域の中央に置く読み込み表示。カード1枚ぶん・リスト1画面ぶんの待ちに使う。 */
export function LoaderBlock({
  size = "md",
  label = "読み込み中",
  className = "py-10",
  style,
}: {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
  /** 読み込み前後で周りが飛ばないよう、必要なら最低高さを渡す。 */
  style?: React.CSSProperties;
}) {
  return (
    <div className={`flex w-full items-center justify-center ${className}`} style={style}>
      <Loader size={size} label={label} />
    </div>
  );
}
