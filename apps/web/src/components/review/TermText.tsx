"use client";

import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FADE, SPRING_SHEET } from "@/lib/motion";
import { splitTerms, type GlossaryEntry, type TermSegment } from "@/lib/reviewGlossary";

/**
 * 棋譜解析の解説の文章。専門用語(`lib/reviewGlossary.ts` の辞書)に点線の下線を引き、タップでその用語の意味を
 * 下から出る小さなシートで見せる。同じ用語は文章ごとに最初の1回だけ下線を引く。
 *
 * 吹き出し全体が「詳しく見る」のボタンなので、用語のタップはそこへ伝えない(stopPropagation)。
 * ボタンの中にボタンは置けないため、用語は role="button" の span にしてキーボード(Enter / Space)でも開けるようにする。
 * 複数の文章(要点と本文など)で「最初の1回」を共有するときは、`splitTermsMany` で分けてから `TermSegments` で描く。
 */
export function TermText({ text }: { text: string }) {
  const segments = useMemo(() => splitTerms(text), [text]);
  return <TermSegments segments={segments} />;
}

export function TermSegments({ segments }: { segments: TermSegment[] }) {
  const [open, setOpen] = useState<GlossaryEntry | null>(null);
  return (
    <>
      {segments.map((s, i) =>
        s.entry ? (
          <span
            key={i}
            role="button"
            tabIndex={0}
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              e.preventDefault();
              setOpen(s.entry!);
            }}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.stopPropagation();
              e.preventDefault();
              setOpen(s.entry!);
            }}
            aria-haspopup="dialog"
            className="cursor-pointer underline decoration-accent/70 decoration-dotted decoration-[1.5px] underline-offset-[3px]"
          >
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
      <TermSheet entry={open} onClose={() => setOpen(null)} />
    </>
  );
}

/**
 * 用語の意味のシート。解析の画面(z-[70])や「詳しく見る」のシート(z-[90])の上に出すため、body 直下へポータルで出す
 * (親の transform の中の fixed は閉じ込められる)。下から SPRING_SHEET で出し、背景のタップか「閉じる」で閉じる。
 */
function TermSheet({ entry, onClose }: { entry: GlossaryEntry | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!entry) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry, onClose]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {entry && (
        <motion.div
          key="term-sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={FADE}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="fixed inset-0 z-[96] flex items-end justify-center bg-black/60"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={entry.term}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING_SHEET}
            onClick={(e) => e.stopPropagation()}
            // 「詳しく見る」のシート(ガラス)の上にも重なるので、透けない面にする(半透明どうしを重ねると読めない)。
            className="safe-area-bottom w-full max-w-xl rounded-t-sheet border-t border-line bg-surface-2 px-5 pb-6 pt-4 shadow-e4"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black text-accent">用語</p>
                <h2 className="mt-0.5 text-[18px] font-black leading-snug tracking-tight text-fg">{entry.term}</h2>
                {entry.aliases && entry.aliases.length > 0 && (
                  <p className="mt-0.5 text-[12px] font-semibold text-fg-3">{entry.aliases.join(" / ")}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="pressable shrink-0 rounded-full bg-surface-3 px-3 py-1.5 text-[12px] font-bold text-fg"
              >
                閉じる
              </button>
            </div>
            <p className="mt-3 text-[15px] leading-[1.8] text-fg-2">{entry.desc}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
