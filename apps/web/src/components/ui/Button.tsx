"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";

/**
 * アプリ全体のボタン意匠の単一の置き場所。
 *
 * これまでボタンは28ファイル・110箇所に Tailwind のクラス文字列としてベタ書きされており、
 * 「primaryを少し丸くしたい」程度の変更でも全ファイルを触る必要があった(そして必ず数箇所
 * 取りこぼして意匠がズレていた)。意匠の定義をここ1箇所に集約し、各画面は variant/size/shape
 * を指定するだけにする。外部から持ち込んだボタンデザイン(uiverse等)へ差し替える場合も、
 * 触るのはこのファイルと globals.css の対応するクラスだけで済む。
 *
 * 既存の見た目は変えていない。ここにある値は移行前に実際に使われていたクラス文字列から
 * 起こしたもので、この集約自体は視覚的に no-op になるようにしてある。
 *
 * v4.2.0のダークテーマ刷新(#217)で色トークンが ink/gold から canvas/surface/line/fg/accent
 * (テーマカラーはteal系の#26C2A3)へ全面的に置き換わり、押下フィードバックも各所バラバラの
 * active:scale/opacity から `.pressable`(globals.css)へ一本化された。ここもそれに追従する。
 */

/** 塗り/枠線/文字色の系統。役割で選ぶ(見た目で選ばない)。 */
export type ButtonVariant =
  /** 主要動線。アクセント(teal)塗り+on-accent文字+発光。1画面に原則1つ。 */
  | "primary"
  /** 副次動線。ガラス面+fg文字。primaryと並べても competing しない。 */
  | "secondary"
  /** 強調動線。primaryと同じアクセント塗りだが発光を伴わない(並置時に主役を譲る)。 */
  | "accent"
  /** 破壊的操作。crimson。退出/削除/通報など取り消せない操作。 */
  | "danger"
  /** 枠なし。テキストリンク相当。閉じる/スキップ/補助操作。 */
  | "ghost"
  /** 控えめな枠線。コピー等の常設サブ操作。secondaryより主張しない。 */
  | "quiet";

/**
 * 高さと文字サイズ。中身の重要度ではなく置き場所の余白で選ぶ。
 *
 * "none" は padding と font-size を一切付けない脱出口。テンキーのように寸法が
 * 完全に独自な場所で使う。className の後付けで上書きしようとすると、Tailwind の
 * 生成順の都合で効いたり効かなかったりするため、寸法を持たせない側を明示する。
 */
export type ButtonSize = "sm" | "md" | "lg" | "none";

/**
 * 角丸の形。
 *
 * 角丸を変えたいときは className に `rounded-lg` などを足すのではなく、必ずこの型に足すこと。
 * Tailwind では同じプロパティを持つクラスの勝敗が class 属性の並び順ではなく生成CSSの
 * 並び順で決まるため、className 側が勝つかどうかはユーティリティの出力順という
 * こちらから制御できない要因に左右される。たまたま勝っていても、Tailwind のバージョンや
 * 使用クラスの組み合わせが変われば黙って逆転しうる(壊れてもビルドは通る)。
 */
export type ButtonShape = "pill" | "rounded" | "snug";

/**
 * 全variant共通の土台。
 * - `cursor-pointer`: Tailwind preflight は button のカーソルを既定に戻すため明示が要る。
 * - `.pressable`: タップの押下フィードバック(globals.css に一本化されている)。
 *   prefers-reduced-motion / prefers-reduced-transparency はそちら側で対応済み。
 * - `disabled:` : 押せないことを不透明度で示し、ポインタも殺す。
 */
const BASE =
  "pressable inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap " +
  "disabled:cursor-not-allowed disabled:opacity-40";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "border border-transparent bg-accent text-on-accent font-black shadow-glow",
  secondary: "border border-line-strong bg-surface text-fg font-black",
  accent: "border border-transparent bg-accent text-on-accent font-black",
  danger: "border border-transparent bg-crimson-500 text-white font-black",
  // ghost だけは枠も塗りも持たない。高さを揃えるための padding だけ SIZES から受け取る。
  ghost: "border border-transparent bg-transparent text-fg-3 font-bold",
  quiet: "border border-line bg-surface text-fg-2 font-semibold",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-[12px]",
  md: "px-4 py-3 text-[13px]",
  lg: "px-5 py-3.5 text-[14px]",
  none: "",
};

const SHAPES: Record<ButtonShape, string> = {
  pill: "rounded-full",
  rounded: "rounded-2xl",
  snug: "rounded-lg",
};

export function buttonClass({
  variant = "primary",
  size = "md",
  shape = "rounded",
  block = false,
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  /** 親の幅いっぱいに広げる(モーダルのCTAなど)。 */
  block?: boolean;
  className?: string;
} = {}): string {
  return [BASE, VARIANTS[variant], SIZES[size], SHAPES[shape], block ? "w-full" : "", className]
    .filter(Boolean)
    .join(" ");
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, shape, block, className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // 既定を "button" にする。フォーム内の <button> は既定が submit で、
      // 意図しない送信(と画面リロード)を起こす事故が起きやすい。
      type={type}
      className={buttonClass({ variant, size, shape, block, className })}
      {...rest}
    />
  );
});

export type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  block?: boolean;
};

/** 見た目はボタン、実体はリンク。遷移する導線に <button onClick={router.push}> を使わないため。 */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant, size, shape, block, className, ...rest },
  ref,
) {
  return <a ref={ref} className={buttonClass({ variant, size, shape, block, className })} {...rest} />;
});

/** 正方形アイコンボタンの一辺。 */
const ICON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-10 w-10",
  none: "",
};

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  /** アイコンボタンは中身が絵なので、読み上げ用のラベルを必須にする。 */
  "aria-label": string;
  children: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = "secondary", size = "md", shape = "pill", className = "", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        BASE,
        VARIANTS[variant],
        SHAPES[shape],
        ICON_SIZES[size],
        // 正方形なので SIZES の左右paddingは打ち消す。
        "shrink-0 p-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
});
