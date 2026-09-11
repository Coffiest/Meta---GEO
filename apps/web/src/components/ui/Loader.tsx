"use client";

/**
 * 読み込み中の表示。アプリ全体でこの1つに統一する。
 *
 * 3つの玉が順番に跳ね、それぞれの真下で影が伸縮する(出典: uiverse.io by mobinkakei)。
 * 玉の色は `currentColor` なので、置いた場所の文字色をそのまま拾う ―― 暗い画面では
 * 明るい玉に、白い卓画面では暗い玉になり、呼び出し側で色を渡す必要がない。
 *
 * 原寸は 200×60。`size` は相似縮小の倍率で、キーフレームが px 直書きである以上、
 * 比率を保つには全体を拡縮するしかない(個別に幅だけ縮めると跳ねの高さが合わなくなる)。
 */
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
      <span className="loader-stage" aria-hidden="true">
        <span className="loader-ball" />
        <span className="loader-ball" />
        <span className="loader-ball" />
        <span className="loader-shadow" />
        <span className="loader-shadow" />
        <span className="loader-shadow" />
      </span>
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
