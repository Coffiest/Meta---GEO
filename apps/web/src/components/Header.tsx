"use client";

import { Icon } from "./Icon";

/**
 * アプリ全体で共有するヘッダー。sticky + ガラス(背景ぼかし+彩度強調)のバーで、下の
 * コンテンツはこの下を流れていく(不透明な帯で画面上端を消費しない)。min-h-[64px]・
 * px-5 py-3、左にロゴ+ワードマーク、右に円形のボーダーのみアイコンボタン列。
 * 全画面が同一のダークテーマなので、画面ごとの色調の出し分けは持たない。
 */
export function Header({
  left,
  right,
  widthClass = "max-w-3xl",
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  /** バー内側の最大幅。PC(lg)で本文を広く使う画面(GEO DATABASE)はここを広げて本文と幅を揃える。 */
  widthClass?: string;
}) {
  return (
    <header className="glass-header sticky top-0 z-30">
      <div className={`mx-auto flex min-h-[64px] items-center justify-between gap-3 px-5 py-3 ${widthClass}`}>
        <div className="flex items-center min-w-0 flex-1">{left}</div>
        {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
      </div>
    </header>
  );
}

/** メインロゴ画像。 */
const LOGO_SRC = "/logos/Logo_s.png";

/** RRPokerのロゴ(60x60画像+ワードマーク)と全く同じ寸法のロゴ枠。 */
export function HeaderLogo() {
  return (
    <div className="flex items-center gap-2 text-[18px] font-semibold tracking-tight text-fg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_SRC} alt="Poker ART" className="h-11 w-11 shrink-0 rounded-2xl object-contain" />
      <span>
        Poker<span className="text-accent">ART</span>
      </span>
    </div>
  );
}

/** RRPokerのアイコンボタンと同じ寸法(h-10 w-10の円形、ボーダーのみ・塗りつぶしなし)。 */
export function HeaderIconButton({
  onClick,
  ariaLabel,
  children,
  href,
}: {
  onClick?: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  href?: string;
}) {
  const className =
    "pressable relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-n-10";
  if (href) {
    return (
      <a href={href} aria-label={ariaLabel} className={className}>
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} aria-label={ariaLabel} className={className}>
      {children}
    </button>
  );
}

export function HamburgerIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <Icon name="menu" className={className} />
  );
}
