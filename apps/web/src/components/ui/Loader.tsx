"use client";

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
