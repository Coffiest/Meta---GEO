"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { ChatMessage } from "@/lib/socket";

/**
 * 設定→「チャットログ」から開く、卓全体の会話ログ(LINE風)。
 * 自分の発言は右寄せ・黒、相手の発言は左寄せ・白+黒枠線で表示する。
 */
export function ChatLogSheet({
  messages,
  yourSeatIndex,
  onClose,
}: {
  messages: ChatMessage[];
  yourSeatIndex: number | null;
  onClose: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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
        className="flex h-[70vh] w-full max-w-md flex-col rounded-t-2xl border border-ink-950 bg-white"
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-ink-400">Table chat</p>
            <h2 className="text-lg font-extrabold tracking-tight text-ink-950">チャットログ</h2>
          </div>
          <button onClick={onClose} className="text-[12px] font-semibold text-ink-500">
            閉じる
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink-400">まだ会話がありません。</p>
          ) : (
            messages.map((m, i) => {
              const mine = yourSeatIndex !== null && m.seatIndex === yourSeatIndex;
              return (
                <div key={i} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  {!mine && <span className="mb-0.5 px-1 text-[10px] font-bold text-ink-400">{m.displayName}</span>}
                  <div
                    className={`max-w-[78%] break-words rounded-2xl px-3 py-2 text-[13px] font-medium leading-snug ${
                      mine ? "bg-ink-950 text-white" : "border border-ink-950 bg-white text-ink-950"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
      </motion.div>
    </motion.div>
  );
}
