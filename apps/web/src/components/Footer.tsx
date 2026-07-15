"use client";

import Link from "next/link";
import { Icon } from "./Icon";

export interface FooterNavItem {
  key: string;
  label: string;
  icon: string;
  href?: string;
  onClick?: () => void;
}

const FOOTER_TONE = {
  light: {
    bar: "footer-glass-light border-ink-300/60",
    active: "text-ink-950",
    activePill: "bg-ink-950/[0.06]",
    inactive: "text-ink-500",
    dbRing: "ring-white",
  },
  dark: {
    bar: "border-navy-800 bg-navy-950/95 backdrop-blur",
    active: "text-gold-400",
    activePill: "bg-gold-500/10",
    inactive: "text-navy-500",
    dbRing: "ring-navy-950",
  },
} as const;

/**
 * アプリ全体で共有するフッターナビ。中央にGEOデータベースへの丸ボタンを浮かせる5マス構成
 * (アイコン4つ+中央DBボタン)を、Lobbyのタブ切り替えとGEO DATABASE画面のページ遷移の
 * 両方で使い回す。カラーはink/gold(light)・navy/gold(dark、GEO DATABASE画面用)の
 * どちらでも、アクティブ色は常にgoldに統一する。
 */
export function Footer({
  items,
  activeKey,
  tone = "light",
  centerHref,
  centerActive = false,
}: {
  /** 中央のDBボタンを除いた4項目、表示順。 */
  items: [FooterNavItem, FooterNavItem, FooterNavItem, FooterNavItem];
  activeKey: string | null;
  tone?: "light" | "dark";
  /** 中央のGEO DATABASEボタンの遷移先。省略時はボタンを非活性(現在地)表示にする。 */
  centerHref?: string;
  /** 中央ボタンが現在地(GEO DATABASE画面を開いている)かどうか。 */
  centerActive?: boolean;
}) {
  const c = FOOTER_TONE[tone];

  return (
    <nav className={`fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur pb-[env(safe-area-inset-bottom)] ${c.bar}`}>
      <div className="relative mx-auto max-w-md grid grid-cols-5 items-end">
        {[items[0], items[1], null, items[2], items[3]].map((item, i) =>
          item ? (
            <FooterButton key={item.key} item={item} active={activeKey === item.key} tone={tone} />
          ) : (
            <div key="db" className="relative flex justify-center">
              <CenterButton href={centerHref} active={centerActive} ringClass={c.dbRing} />
              <div className="h-[54px]" />
            </div>
          ),
        )}
      </div>
    </nav>
  );
}

function FooterButton({ item, active, tone }: { item: FooterNavItem; active: boolean; tone: "light" | "dark" }) {
  const c = FOOTER_TONE[tone];
  const content = (
    <>
      <div className={`relative h-7 w-7 rounded-full flex items-center justify-center transition-colors ${active ? c.activePill : ""}`}>
        <Icon name={item.icon} className="h-[18px] w-[18px]" />
        {active && <span className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-current" />}
      </div>
      <span className="text-[9px] font-semibold">{item.label}</span>
    </>
  );
  const className = `flex flex-col items-center gap-0.5 py-2 transition-colors ${active ? c.active : c.inactive}`;
  if (item.href) {
    return (
      <Link href={item.href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button onClick={item.onClick} className={className}>
      {content}
    </button>
  );
}

function CenterButton({ href, active, ringClass }: { href?: string; active: boolean; ringClass: string }) {
  const className = `absolute -top-7 h-14 w-14 rounded-full bg-gradient-to-br from-ink-800 via-ink-950 to-black ring-4 ${ringClass} shadow-panel flex flex-col items-center justify-center text-white transition-transform ${
    active ? "scale-105" : "active:scale-95"
  }`;
  const content = (
    <>
      <Icon name="db" className="h-5 w-5" />
      <span className="text-[7px] font-bold tracking-wide mt-[1px]">DATABASE</span>
    </>
  );
  if (!href || active) {
    return (
      <div className={className} aria-current={active ? "page" : undefined}>
        {content}
      </div>
    );
  }
  return (
    <Link href={href} aria-label="GEOデータベース" className={className}>
      {content}
    </Link>
  );
}
