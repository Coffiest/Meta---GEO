"use client";

import { motion } from "framer-motion";

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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={cls}>
        <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" strokeLinejoin="round" />
        <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 20h6M12 13v3" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "chart") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={cls}>
        <path d="M4 20h16M7 16v-4M12 16V7M17 16v-6" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "star") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={cls}>
        <path d="m12 4 2.3 4.9 5.2.7-3.8 3.6.9 5.2L12 16l-4.6 2.4.9-5.2L4.5 9.6l5.2-.7L12 4Z" strokeLinejoin="round" />
      </svg>
    );
  }
  // cards
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={cls}>
      <rect x="4" y="6" width="10" height="13" rx="2" transform="rotate(-8 9 12.5)" />
      <rect x="10" y="5" width="10" height="13" rx="2" transform="rotate(8 15 11.5)" />
    </svg>
  );
}
