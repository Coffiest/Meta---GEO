"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { REVIEW_KNOWLEDGE } from "@/data/reviewKnowledge";
import { matchKnowledge } from "@/lib/reviewKnowledge";
import type { ReviewedDecision } from "@/lib/reviewApi";

/**
 * 決定に添える「なぜそうなのか」の解説。
 *
 * 格付け(9段階)は「どれくらい損か」しか言わないので、それだけでは直しようがない。
 * ここでオーナーが書いた知識のうち、その決定の条件に当てはまるものを引いて添える。
 *
 * 既定では畳んである。解析は一覧性が命で、全決定に文章が開いたまま並ぶと
 * スクロールが伸びて「どこが悪かったのか」の把握が先に潰れるため。
 *
 * 当てはまる知識が無ければ**何も描かない**(「該当なし」は情報量ゼロで場所だけ取る)。
 */
export function KnowledgeNotes({ decision }: { decision: ReviewedDecision }) {
  const notes = matchKnowledge(decision, REVIEW_KNOWLEDGE);
  if (notes.length === 0) return null;
  return (
    <div className="mt-2.5 space-y-1.5">
      {notes.map((note) => (
        <KnowledgeNote key={note.id} title={note.title} body={note.body} sourceUrl={note.sourceUrl} />
      ))}
    </div>
  );
}

function KnowledgeNote({ title, body, sourceUrl }: { title: string; body: string; sourceUrl?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-white/[0.04] ring-1 ring-inset ring-white/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pressable flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
      >
        <Icon name="info" className="h-3 w-3 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-fg">{title}</span>
        <Icon
          name="chevron-right"
          className={`h-3 w-3 shrink-0 text-fg-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-2.5 pb-2">
              {/* オーナーの文章は改行も含めてそのまま出す(整形しない)。 */}
              <p className="whitespace-pre-wrap text-[11px] leading-[1.7] text-fg-2">{body}</p>
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-accent"
                >
                  出典
                  <Icon name="chevron-right" className="h-2.5 w-2.5 shrink-0" />
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
