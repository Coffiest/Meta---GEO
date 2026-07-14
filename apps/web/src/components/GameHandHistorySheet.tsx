"use client";

import { motion } from "framer-motion";
import { PlayingCard } from "./PlayingCard";
import { formatSignedBb } from "@/lib/format";
import type { GameHandRecord } from "@/lib/socket";

/**
 * 設定ボタンから開く「このゲームのハンド履歴」ボトムシート。
 * このトーナメント中に自分がプレイした全ハンドを、新しい順に一覧表示する。
 * 各行: 自分のホールカード(常に表向き)+ 最終ボード + 収支。
 */
export function GameHandHistorySheet({
  records,
  bigBlind,
  onClose,
}: {
  records: GameHandRecord[];
  bigBlind: number;
  onClose: () => void;
}) {
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
                </motion.li>
              );
            })}
          </ul>
        )}
      </motion.div>
    </motion.div>
  );
}
