"use client";

import { motion } from "framer-motion";

/**
 * 姉妹アプリ「RRPoker」の告知バナー(PokerARTホームに掲出)。
 *
 * デザインは RRPoker のブランド(黒白ボールド + アンバーゴールドのR)を踏襲し、
 * PokerART の白いSwissカード群の中であえて黒地カードとして際立たせる。ロゴは
 * リポジトリの公式アイコン(/logos/rrpoker-icon.png)をそのまま使う。
 *
 * タップ動線:
 *  - カード全体 → RRPoker 本体(https://rrpoker.com)。ストレッチリンクで実装。
 *  - 「DMで相談」ピル → RR公式Instagram(別リンク。カードのリンクより手前に重ねる)。
 */
const RRPOKER_URL = "https://rrpoker.com";
const RRPOKER_INSTAGRAM = "https://www.instagram.com/coffest_o0";

export function RRPokerPromoBanner() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
      aria-label="姉妹アプリ RRPoker のご案内"
      className="relative overflow-hidden rounded-2xl bg-ink-950 ring-1 ring-gold-500/25"
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

      <div className="pointer-events-none relative z-10 p-4">
        <div className="flex items-center gap-3.5">
          {/* リポジトリ公式アイコンを白タイルに載せる(アプリアイコン風)。 */}
          <div className="shrink-0 grid place-items-center h-14 w-14 rounded-xl bg-white ring-1 ring-white/10 shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/rrpoker-icon.png" alt="RRPoker" className="h-12 w-12 object-contain" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-400">
              姉妹アプリ ・ RRPOKER
            </p>
            <h3 className="mt-1 text-[17px] font-black leading-tight tracking-tight text-white">
              使用店舗、大募集。
            </h3>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">
              実店舗ポーカーをまるごとデジタル化。バイイン・トーナメント運営・ハンド履歴・
              全国レーティングまで、スマホひとつで。
            </p>
          </div>
        </div>

        {/* CTA行: RRを見る(カード全体リンクと同じ先)＋ Instagram DM(手前に重ねて別リンク)。 */}
        <div className="mt-3.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-500 px-3.5 py-1.5 text-[12px] font-bold text-ink-950">
            アプリを見る
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>

          {/* Instagram DM: pointer-events を戻し、ストレッチリンクより手前(z-20)に置く。 */}
          <a
            href={RRPOKER_INSTAGRAM}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="RRPoker 公式Instagramを開いてDMで相談する"
            className="pointer-events-auto relative z-20 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-white ring-1 ring-white/25 transition-colors hover:bg-white/10 active:bg-white/15"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
            </svg>
            DMで相談
          </a>

          <span className="pointer-events-none ml-auto pr-0.5 text-[10.5px] text-ink-500">
            お気軽にどうぞ
          </span>
        </div>
      </div>
    </motion.section>
  );
}
