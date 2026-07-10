"use client";

import { useEffect, useState } from "react";

/**
 * アプリ全体で共有するヘッダー。RRPoker(components/HomeHeader.tsx)のヘッダーと
 * 全く同じ寸法・デザインパターンに揃えている: sticky+リキッドグラス(背景ぼかし+彩度強調)の
 * バー、min-h-[64px]・px-5 py-3、左に60x60のロゴ+ワードマーク、右に円形(h-10 w-10)の
 * ボーダーのみアイコンボタン列。色調だけは画面のテーマ(light/dark)に応じて出し分ける
 * (テーブルプレイ画面のような紺基調の画面に白いバーを強制すると浮いてしまうため)。
 */
const BAR_TONE_CLASS: Record<"light" | "dark", string> = {
  light: "header-glass-light border-ink-300/60",
  dark: "border-navy-800 bg-navy-950/80 backdrop-blur-sm",
};

const WORDMARK_TONE_CLASS: Record<"light" | "dark", string> = {
  light: "text-ink-950",
  dark: "text-navy-50",
};

export function Header({
  left,
  right,
  tone = "light",
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  /** テーブルプレイ画面等、既存のnavyダークテーマを維持する画面向け。 */
  tone?: "light" | "dark";
}) {
  return (
    <header className={`sticky top-0 z-20 border-b ${BAR_TONE_CLASS[tone]}`}>
      <div className="mx-auto flex min-h-[64px] max-w-3xl items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center min-w-0 flex-1">{left}</div>
        {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
      </div>
    </header>
  );
}

/** メインロゴ画像4種(スート違い)。ホーム等のヘッダーは画面を開く/更新するたびにランダムで1つ表示する。 */
const LOGO_VARIANTS = ["/logos/Logo_c.png", "/logos/Logo_d.png", "/logos/Logo_h.png", "/logos/Logo_s.png"];

/** RRPokerのロゴ(60x60画像+ワードマーク)と全く同じ寸法のロゴ枠。 */
export function HeaderLogo({ tone = "light" }: { tone?: "light" | "dark" }) {
  // SSR/初回クライアント描画は固定(Logo_s)にしてハイドレーション不整合を避け、
  // マウント後にランダムな1枚へ差し替える(画面を開く/更新するたびに変わる)。
  const [logoSrc, setLogoSrc] = useState(LOGO_VARIANTS[3]);
  useEffect(() => {
    setLogoSrc(LOGO_VARIANTS[Math.floor(Math.random() * LOGO_VARIANTS.length)]);
  }, []);

  return (
    <div className={`flex items-center gap-2 text-[18px] font-semibold ${WORDMARK_TONE_CLASS[tone]}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoSrc} alt="Poker ART" className="h-[60px] w-[60px] shrink-0 rounded-2xl object-contain" />
      <span>
        Poker<span className="text-gold-600">ART</span>
      </span>
    </div>
  );
}

const ICON_BUTTON_TONE_CLASS: Record<"light" | "dark", string> = {
  light: "border-ink-950/15 bg-white/55 text-ink-800 backdrop-blur-[10px] hover:border-ink-950/30",
  dark: "border-navy-700 text-navy-200 hover:border-navy-500",
};

/** RRPokerのアイコンボタンと同じ寸法(h-10 w-10の円形、ボーダーのみ・塗りつぶしなし)。 */
export function HeaderIconButton({
  onClick,
  ariaLabel,
  children,
  href,
  tone = "light",
}: {
  onClick?: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  href?: string;
  tone?: "light" | "dark";
}) {
  const className = `relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${ICON_BUTTON_TONE_CLASS[tone]}`;
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}
