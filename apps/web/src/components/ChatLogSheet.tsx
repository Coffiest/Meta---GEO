"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ChatMessage, SeatPlayerInfo } from "@/lib/socket";
import { Avatar } from "./Avatar";

/**
 * 設定→「チャットログ」から開く、卓全体の会話ログ(LINE風)。
 * 自分の発言は右寄せ・黒、相手の発言は左寄せ・白+黒枠線で表示し、
 * どちらも発言者のアイコンと名前を吹き出しの横に添える。最下部の入力欄からも発言できる。
 */
export function ChatLogSheet({
  messages,
  yourSeatIndex,
  players,
  myDisplayName,
  myAvatarKey,
  onSend,
  onClose,
}: {
  messages: ChatMessage[];
  yourSeatIndex: number | null;
  players: Record<number, SeatPlayerInfo>;
  myDisplayName: string;
  myAvatarKey: string | null;
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft("");
  }

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
        className="flex h-[72vh] w-full max-w-md flex-col rounded-t-2xl border border-ink-950 bg-white"
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

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink-400">まだ会話がありません。</p>
          ) : (
            messages.map((m, i) => {
              const mine = yourSeatIndex !== null && m.seatIndex === yourSeatIndex;
              const avatarKey = mine ? myAvatarKey : players[m.seatIndex]?.avatarKey ?? null;
              const name = m.displayName || players[m.seatIndex]?.displayName || (mine ? myDisplayName : "");
              return (
                <div key={i} className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}>
                  <div className="shrink-0">
                    <Avatar avatarKey={avatarKey} displayName={name} size={30} />
                  </div>
                  <div className={`flex min-w-0 flex-col ${mine ? "items-end" : "items-start"}`}>
                    <span className="mb-0.5 px-1 text-[10px] font-bold text-ink-400">{name}</span>
                    <div
                      className={`max-w-[72vw] break-words rounded-2xl px-3 py-2 text-[13px] font-medium leading-snug sm:max-w-[18rem] ${
                        mine ? "bg-ink-950 text-white" : "border border-ink-950 bg-white text-ink-950"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        {/* 最下部の入力欄+送信ボタン。ここからも発言でき、自席の吹き出しにも反映される。 */}
        <form onSubmit={submit} className="safe-area-bottom flex items-center gap-2 border-t border-ink-200 px-3 pb-4 pt-2.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={120}
            placeholder="メッセージを入力…"
            className="flex-1 rounded-full border border-ink-950 bg-white px-4 py-2.5 text-sm text-ink-950 outline-none placeholder:text-ink-300"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="送信"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-950 text-white transition-transform active:scale-90 disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="h-[18px] w-[18px]">
              <path d="M4.5 12h13M12 5.5l6 6.5-6 6.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
