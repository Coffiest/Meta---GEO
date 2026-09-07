"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { SPRING_MOVE } from "@/lib/motion";
import { Icon, type IconName } from "./Icon";

export interface FooterNavItem {
  key: string;
  label: string;
  icon: IconName;
  href?: string;
  onClick?: () => void;
}

/**
 * アプリ全体で共有するタブバー。
 *
 * 画面幅いっぱいの不透明な帯ではなく、下端から浮いた1枚のリキッドグラスとして作る。
 * コンテンツはこのバーの下を流れ続けるので、画面の下端が帯に食われない。
 *
 * 現在地は色ではなく「光の当たっている面」で示す。インジケータは layoutId で
 * 項目から項目へスプリングで滑るため、どこからどこへ移ったかが動きとして読める
 * (点いて消えるだけだと、移動した先を目で追えない)。
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
  const slots: (FooterNavItem | null)[] = [items[0], items[1], null, items[2], items[3]];

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="glass-bar pointer-events-auto flex w-full max-w-md items-center justify-between rounded-full px-2 py-1.5">
        {slots.map((item, i) =>
          item ? (
            <TabButton key={item.key} item={item} active={activeKey === item.key} />
          ) : (
            <CenterButton key="db" href={centerHref} active={centerActive} />
          ),
        )}
      </div>
    </nav>
  );
}

/** インジケータの共有ID。全項目で同じにすることで、選択が項目間を滑って移動する。 */
const INDICATOR_ID = "tabbar-indicator";

function TabButton({ item, active }: { item: FooterNavItem; active: boolean }) {
  const content = (
    <>
      {active && (
        <motion.span
          layoutId={INDICATOR_ID}
          transition={SPRING_MOVE}
          className="glass-indicator absolute inset-0 rounded-full"
          aria-hidden
        />
      )}
      <span className="relative flex flex-col items-center gap-0.5">
        <Icon name={item.icon} className="h-[22px] w-[22px]" />
        <span className="text-[9px] font-semibold leading-none">{item.label}</span>
      </span>
    </>
  );
  const className = `pressable relative flex h-[52px] flex-1 items-center justify-center rounded-full ${
    active ? "text-fg" : "text-fg-3"
  }`;
  if (item.href) {
    return (
      <Link href={item.href} className={className} aria-current={active ? "page" : undefined}>
        {content}
      </Link>
    );
  }
  return (
    <button onClick={item.onClick} className={className} aria-current={active ? "page" : undefined}>
      {content}
    </button>
  );
}

/**
 * GEO DATABASE への導線。バーから飛び出させず、他の項目と同じ列に置いたうえで、
 * 中身だけをアクセント面にして「ここだけ特別」を伝える(浮かせると、ガラス1枚という
 * 面の説明が崩れてしまう)。
 */
function CenterButton({ href, active }: { href?: string; active: boolean }) {
  const content = (
    <>
      {active && (
        <motion.span
          layoutId={INDICATOR_ID}
          transition={SPRING_MOVE}
          className="glass-indicator absolute inset-0 rounded-full"
          aria-hidden
        />
      )}
      <span className="relative grid h-9 w-9 place-items-center rounded-full bg-gradient-to-b from-accent-hi to-accent-lo text-on-accent shadow-glow-sm">
        <Icon name="db" className="h-5 w-5" />
      </span>
    </>
  );
  const className = "pressable relative flex h-[52px] flex-1 items-center justify-center rounded-full";
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
