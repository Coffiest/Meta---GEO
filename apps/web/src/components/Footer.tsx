"use client";

import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export interface FooterNavItem {
  key: string;
  label: string;
  icon: IconName;
  href?: string;
  onClick?: () => void;
}

/**
 * アプリ全体で共有するフッターナビ。中央にGEOデータベースへの丸ボタンを浮かせる5マス構成
 * (アイコン4つ+中央DBボタン)を、Lobbyのタブ切り替えとGEO DATABASE画面のページ遷移の
 * 両方で使い回す。不透明な帯ではなくガラスの浮遊レイヤーとして作り、コンテンツはこの下を
 * 流れていく。現在地はアクセント色1つだけで示す。
 */
export function Footer({
  items,
  activeKey,
  centerHref,
  centerActive = false,
}: {
  /** 中央のDBボタンを除いた4項目、表示順。 */
  items: [FooterNavItem, FooterNavItem, FooterNavItem, FooterNavItem];
  activeKey: string | null;
  /** 中央のGEO DATABASEボタンの遷移先。省略時はボタンを非活性(現在地)表示にする。 */
  centerHref?: string;
  /** 中央ボタンが現在地(GEO DATABASE画面を開いている)かどうか。 */
  centerActive?: boolean;
}) {
  return (
    <nav className="glass-footer fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="relative mx-auto max-w-md grid grid-cols-5 items-end">
        {[items[0], items[1], null, items[2], items[3]].map((item, i) =>
          item ? (
            <FooterButton key={item.key} item={item} active={activeKey === item.key} />
          ) : (
            <div key="db" className="relative flex justify-center">
              <CenterButton href={centerHref} active={centerActive} />
              <div className="h-[54px]" />
            </div>
          ),
        )}
      </div>
    </nav>
  );
}

function FooterButton({ item, active }: { item: FooterNavItem; active: boolean }) {
  const content = (
    <>
      <div className={`relative h-8 w-8 rounded-full flex items-center justify-center transition-colors ${active ? "bg-accent/15" : ""}`}>
        <Icon name={item.icon} className="h-5 w-5" />
        {active && <span className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-current" />}
      </div>
      <span className="text-[11px] font-semibold leading-none">{item.label}</span>
    </>
  );
  const className = `pressable flex min-h-[52px] flex-col items-center justify-center gap-1 py-2 transition-colors ${active ? "text-accent" : "text-fg-3"}`;
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

function CenterButton({ href, active }: { href?: string; active: boolean }) {
  // フッターから浮き上がる主役のボタン。リングを背景色と同色にして、バーから切り抜かれて
  // 手前に浮いているように見せる(輪郭線ではなく「背景の抜き」で立体を作る)。
  const className = `pressable absolute -top-7 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-gradient-to-br from-accent-hi via-accent to-accent-lo text-on-accent ring-4 ring-canvas shadow-glow ${
    active ? "scale-105" : ""
  }`;
  const content = (
    <>
      <Icon name="db" className="h-[22px] w-[22px]" />
      <span className="text-[9px] font-bold tracking-wide mt-[1px]">DATABASE</span>
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
