"use client";

import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export interface SideNavItem {
  key: string;
  label: string;
  icon: IconName;
  href?: string;
  onClick?: () => void;
}

/**
 * デスクトップ(lg以上)専用の左ナビレール。モバイルの下部フッターナビ(Footer)と同じ導線を、
 * PC幅では縦のサイドバーとして提供する。判定はCSSのブレークポイントのみで行うため、
 * ウィンドウ幅を変えたその場で自動的にモバイル/PCのレイアウトが切り替わる
 * (JSのUA判定はしない = SSRとクライアントで表示がズレない)。
 */
/* 現在地はアクセント面で示す。アクセント面の上の文字は必ず on-accent(黒) ―
   白は #26C2A3 に対して 2.25:1 で読めない。 */
const ACTIVE_CLASS = "bg-accent text-on-accent shadow-glow-sm";
const INACTIVE_CLASS = "text-fg-2 hover:bg-white/[0.06] hover:text-fg";

export function SideNav({
  items,
  activeKey,
  className = "lg:pt-6",
}: {
  items: SideNavItem[];
  activeKey: string | null;
  /** 画面ごとのヘッダー有無に合わせた上余白の調整用。 */
  className?: string;
}) {
  return (
    <nav
      className={`hidden lg:sticky lg:top-[76px] lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:gap-1 lg:self-start ${className}`}
    >
      {items.map((item) => {
        const active = activeKey === item.key;
        const cls = `pressable flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] font-semibold transition-colors ${
          active ? ACTIVE_CLASS : INACTIVE_CLASS
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
  { key: "history", label: "History", icon: "history", href: "/?tab=history" },
  { key: "leaderboard", label: "Leaderboard", icon: "trophy", href: "/?tab=leaderboard" },
  { key: "database", label: "Database", icon: "db", href: "/geo" },
];
