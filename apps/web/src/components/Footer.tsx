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
}: {
  /** 表示順の全項目(Database と Lesson も他と同じ見た目。オーナー指示で中央の特別扱いは廃止)。 */
  items: FooterNavItem[];
  activeKey: string | null;
}) {
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="glass-bar pointer-events-auto flex w-full max-w-md items-center justify-between rounded-full px-1.5 py-1.5">
        {items.map((item) => (
          <TabButton key={item.key} item={item} active={activeKey === item.key} />
        ))}
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
        <span className="text-[8.5px] font-semibold leading-none">{item.label}</span>
      </span>
    </>
  );
  const className = `pressable relative flex h-[52px] flex-1 items-center justify-center rounded-full ${
    active ? "text-fg" : "text-fg-3"
  }`;
  if (item.href) {
    return (
      <Link href={item.href} className={className} aria-current={active ? "page" : undefined} data-tour={`tab-${item.key}`}>
        {content}
      </Link>
    );
  }
  return (
    <button onClick={item.onClick} className={className} aria-current={active ? "page" : undefined} data-tour={`tab-${item.key}`}>
      {content}
    </button>
  );
}
