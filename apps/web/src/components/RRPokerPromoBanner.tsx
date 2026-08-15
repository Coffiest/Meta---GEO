"use client";

import { motion } from "framer-motion";
import { Icon } from "./Icon";

/**
 * 姉妹アプリ「RRPoker」の告知バナー(PokerARTホームに掲出)。
 *
 * 白背景のカードに、RRPokerの公式アイコン(/logos/rrpoker-icon.png)とアンバーゴールドの
 * アクセントを合わせた、PokerARTのSwiss/エディトリアルなトーンに馴染む意匠。
 *
 * タップ動線:
 *  - カード全体 → RRPoker 本体(https://rrpoker.vercel.app/)。ストレッチリンクで実装。
 *  - 「DMで相談」ピル → RR公式Instagram(別リンク。カードのリンクより手前に重ねる)。
 */
const RRPOKER_URL = "https://rrpoker.vercel.app/";
const RRPOKER_INSTAGRAM = "https://www.instagram.com/coffest_o0";

export function RRPokerPromoBanner() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
      aria-label="姉妹アプリ RRPoker のご案内"
      className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-ink-950/10 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_26px_-16px_rgba(0,0,0,0.18)]"
    >
      {/* カード全体のタップ先(RRPoker本体)。ストレッチリンクで背面全域を覆う。 */}
      <a
        href={RRPOKER_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="RRPoker のウェブサイトを開く"
        className="absolute inset-0 z-0"
      />

      {/* 上端の細いアンバーライン(RRの黒白+金のアクセント)。 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-gold-500 via-gold-400 to-gold-500" />

      {/* 文字を極力持たない1行構成: ロゴ + ワードマーク(英字) + 遷移矢印 / Instagram の図形のみ。 */}
      <div className="pointer-events-none relative z-10 flex items-center gap-3 px-4 py-3">
        {/* リポジトリ公式アイコン(白地の黒+金のRロゴ)をそのまま掲出。 */}
        <div className="shrink-0 grid place-items-center h-11 w-11 rounded-xl bg-white ring-1 ring-ink-950/10 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/rrpoker-icon.png" alt="RRPoker" className="h-9 w-9 object-contain" />
        </div>

        <p className="min-w-0 flex-1 text-[13px] font-black tracking-tight text-ink-950">
          RRPOKER
          <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">for venues</span>
        </p>

        {/* Instagram: pointer-events を戻し、ストレッチリンクより手前(z-20)に置く。 */}
        <a
          href={RRPOKER_INSTAGRAM}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="RRPoker 公式Instagramを開く"
          className="pointer-events-auto relative z-20 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-700 ring-1 ring-ink-950/15 transition-colors hover:bg-ink-100 active:bg-ink-200"
        >
          <Icon name="logo-instagram" className="h-4 w-4" />
        </a>

        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-500 text-ink-950">
          <Icon name="arrow-right" className="h-4 w-4" weight="bold" />
        </span>
      </div>
    </motion.section>
  );
}
