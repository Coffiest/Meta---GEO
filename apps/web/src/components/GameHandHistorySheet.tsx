"use client";

import { motion } from "framer-motion";
import { PlayingCard } from "./PlayingCard";
import { formatSignedBb } from "@/lib/format";
import { buildHandShareText, buildHandShareUrl, openTweetIntent, toBbValue } from "@/lib/share";
import type { GameHandRecord } from "@/lib/socket";

/** Xのロゴ(絵文字は使わずSVGで描画する)。 */
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

/**
 * 設定ボタンから開く「このゲームのハンド履歴」ボトムシート。
 * このトーナメント中に自分がプレイした全ハンドを、新しい順に一覧表示する。
 * 各行: 自分のホールカード(常に表向き)+ 最終ボード + 収支 + Xへの単体シェア。
 */
export function GameHandHistorySheet({
  records,
  bigBlind,
  displayName,
  onClose,
}: {
  records: GameHandRecord[];
  bigBlind: number;
  /** 共有カードに載せる表示名(未指定なら名前なしのカードになる)。 */
  displayName?: string;
  onClose: () => void;
}) {
  /** その1ハンドをOGPカード付きでXへ投稿する。 */
  function shareHand(rec: GameHandRecord) {
    const bb = toBbValue(rec.delta, bigBlind);
    openTweetIntent({
      text: buildHandShareText(bb),
      url: buildHandShareUrl({
        displayName,
        heroCards: rec.heroCards,
        board: rec.board,
        bb,
        wonByFold: rec.wonByFold,
      }),
      hashtags: ["ポーカーアート", "ポーカー"],
    });
  }

  const reversed = [...records].reverse();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[82vh] overflow-y-auto rounded-t-2xl border border-ink-950 bg-white p-4 pb-8"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-ink-400">This tournament</p>
            <h2 className="text-lg font-extrabold tracking-tight text-ink-950">ハンド履歴</h2>
          </div>
          <button onClick={onClose} className="text-[12px] font-semibold text-ink-500">
            閉じる
          </button>
        </div>

        {reversed.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-500">まだ記録されたハンドがありません。</p>
        ) : (
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold text-ink-500">
            <XLogo className="h-3 w-3 shrink-0" />
            右端のボタンで、その1ハンドをカード画像付きでシェアできます。
          </p>
        )}

        {reversed.length > 0 && (
          <ul className="space-y-2">
            {reversed.map((rec, i) => {
              const handNo = records.length - i;
              const win = rec.delta > 0;
              const lose = rec.delta < 0;
              return (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  className="flex items-center gap-3 rounded-xl border border-ink-200 px-3 py-2.5"
                >
                  <span className="w-8 shrink-0 text-[10px] font-bold tabular-nums text-ink-400">#{handNo}</span>

                  <div className="flex shrink-0 gap-1">
                    {rec.heroCards.length === 2 ? (
                      rec.heroCards.map((c, j) => <PlayingCard key={j} card={c} size="sm" />)
                    ) : (
                      <>
                        <PlayingCard faceDown size="sm" />
                        <PlayingCard faceDown size="sm" />
                      </>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
                    {rec.board.length > 0 ? (
                      rec.board.map((c, j) => <PlayingCard key={j} card={c} size="sm" />)
                    ) : (
                      <span className="text-[11px] text-ink-400">プリフロップ</span>
                    )}
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-black tabular-nums ${
                      win ? "bg-mint-500/10 text-mint-700" : lose ? "bg-crimson-500/10 text-crimson-600" : "bg-ink-100 text-ink-500"
                    }`}
                  >
                    {formatSignedBb(rec.delta, bigBlind)}
                  </span>

                  <button
                    type="button"
                    onClick={() => shareHand(rec)}
                    aria-label={`ハンド#${handNo}をXでシェア`}
                    className="shrink-0 rounded-lg border border-ink-200 p-1.5 text-ink-500 transition-colors active:bg-ink-100"
                  >
                    <XLogo className="h-3.5 w-3.5" />
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </motion.div>
    </motion.div>
  );
}
