"use client";

import Link from "next/link";
import { Icon } from "./Icon";

export interface SideNavItem {
  key: string;
  label: string;
  icon: string;
  href?: string;
  onClick?: () => void;
}

/**
 * デスクトップ(lg以上)専用の左ナビレール。モバイルの下部フッターナビ(Footer)と同じ導線を、
 * PC幅では縦のサイドバーとして提供する。判定はCSSのブレークポイントのみで行うため、
 * ウィンドウ幅を変えたその場で自動的にモバイル/PCのレイアウトが切り替わる
 * (JSのUA判定はしない = SSRとクライアントで表示がズレない)。
 * ロビー(light)とGEO DATABASE(dark)の両テーマで使い回す。
 */
const TONE = {
  light: {
    active: "bg-ink-950 text-white",
    inactive: "text-ink-600 hover:bg-ink-100",
  },
  dark: {
    active: "bg-gold-500 text-navy-950",
    inactive: "text-navy-400 hover:bg-navy-900",
  },
} as const;

export function SideNav({
  items,
  activeKey,
  tone = "light",
  className = "lg:pt-6",
}: {
  items: SideNavItem[];
  activeKey: string | null;
  tone?: "light" | "dark";
  /** 画面ごとのヘッダー有無に合わせた上余白の調整用。 */
  className?: string;
}) {
  const c = TONE[tone];
  return (
    <nav
      className={`hidden lg:sticky lg:top-[76px] lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:gap-1 lg:self-start ${className}`}
    >
      {items.map((item) => {
        const active = activeKey === item.key;
        const cls = `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] font-semibold transition-colors ${
          active ? c.active : c.inactive
        }`;
        const inner = (
          <>
            <Icon name={item.icon} className="h-5 w-5 shrink-0" />
            <span>{item.label}</span>
          </>
        );
        return item.href ? (
          <Link key={item.key} href={item.href} className={cls}>
            {inner}
          </Link>
        ) : (
          <button key={item.key} onClick={item.onClick} className={cls}>
            {inner}
          </button>
        );
      })}
    </nav>
  );
}

/** ロビー/GEOで共通のナビ項目(モバイルのフッターナビと同じ5導線)。 */
export const SIDE_NAV_ITEMS: SideNavItem[] = [
  { key: "home", label: "Home", icon: "home", href: "/" },
  { key: "stats", label: "Stats", icon: "stats", href: "/?tab=stats" },
  { key: "history", label: "History", icon: "layers", href: "/?tab=history" },
  { key: "leaderboard", label: "Leaderboard", icon: "trophy", href: "/?tab=leaderboard" },
  { key: "database", label: "Database", icon: "db", href: "/geo" },
];
