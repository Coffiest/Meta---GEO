"use client";

import { motion } from "framer-motion";
import { Icon } from "./Icon";

/**
 * データが0件のときの空状態。素っ気ないテキストの代わりに、モノクロSVGアイコン＋見出し＋
 * 補足コピーで丁寧に見せる。CLAUDE.mdの方針に従いアイコンは絵文字を使わずSVGで実装する。
 */
export function EmptyState({
  title,
  subtitle,
  icon = "cards",
}: {
  title: string;
  subtitle?: string;
  icon?: "cards" | "trophy" | "chart" | "star";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center px-6 py-12 text-center"
    >
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-ink-950 text-ink-800">
        <EmptyIcon name={icon} />
      </div>
      <p className="text-[15px] font-black tracking-tight text-ink-950">{title}</p>
      {subtitle && <p className="mt-1 max-w-[16rem] text-[12px] leading-relaxed text-ink-500">{subtitle}</p>}
    </motion.div>
  );
}

function EmptyIcon({ name }: { name: "cards" | "trophy" | "chart" | "star" }) {
  const cls = "h-6 w-6";
  if (name === "trophy") {
    return (
      <Icon name="trophy" className={cls} />
    );
  }
  if (name === "chart") {
    return (
      <Icon name="bar-chart" className={cls} />
    );
  }
  if (name === "star") {
    return (
      <Icon name="star" className={cls} />
    );
  }
  // cards
  return (
    <Icon name="cards" className={cls} />
  );
}
