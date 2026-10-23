"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { Lesson } from "@/data/lessons";
import { REVIEW_SPEAKER } from "@/data/reviewSpeaker";
import { completeLesson } from "@/lib/lessonApi";
import { FADE, SPRING_MOVE } from "@/lib/motion";
import { Icon } from "@/components/Icon";

/**
 * 1レッスンを進める画面(全画面)。
 * - talk: バリィの吹き出し(棋譜解析の解説と同じ形)。「次へ」で次のページ。
 * - quiz: 卓で解く問題(局面の形はルール説明の中身と一緒に決める。それまでは出てこない)。
 * - 最後まで進んだら完了。星は一発で正解した問題の割合(問題が無いレッスンは星なし)。
 */
export function LessonPlayer({ lesson, accessToken, onClose }: { lesson: Lesson; accessToken: string; onClose: () => void }) {
  const pages = lesson.steps.flatMap((s, si) =>
    s.kind === "talk" ? s.pages.map((text, pi) => ({ key: `${si}-${pi}`, text })) : [],
  );
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const page = pages[index];

  const next = () => {
    if (index + 1 < pages.length) {
      setIndex(index + 1);
      return;
    }
    setFinished(true);
    void completeLesson(accessToken, lesson.id, 0);
  };

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[80] flex flex-col bg-canvas"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={FADE}
    >
      <header className="flex items-center gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
        <button type="button" onClick={onClose} aria-label="閉じる" className="pressable grid h-10 w-10 place-items-center rounded-full text-fg-2">
          <Icon name="close" className="h-6 w-6" />
        </button>
        <p className="min-w-0 flex-1 truncate text-[15px] font-black text-fg">{lesson.title}</p>
        <span className="text-[12px] tabular-nums text-fg-3">
          {Math.min(index + 1, pages.length)} / {pages.length}
        </span>
      </header>
      <div className="h-1 bg-white/[0.06]">
        <motion.div
          className="h-full bg-accent"
          animate={{ width: `${((finished ? pages.length : index) / Math.max(1, pages.length)) * 100}%` }}
          transition={SPRING_MOVE}
        />
      </div>

      <div className="flex flex-1 flex-col justify-end px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <AnimatePresence mode="wait">
          <motion.div
            key={finished ? "done" : page?.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING_MOVE}
            className="glass-panel flex items-start gap-3 rounded-3xl p-4"
          >
            {REVIEW_SPEAKER && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={REVIEW_SPEAKER.avatarSrc} alt="" className="h-16 w-auto shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold text-accent">{REVIEW_SPEAKER?.name ?? ""}</p>
              <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-fg">
                {finished ? "おつかれさま!このレッスンはおしまいだよ。" : page?.text}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
        <button
          type="button"
          onClick={finished ? onClose : next}
          className="pressable mt-3 h-14 w-full rounded-2xl bg-accent text-[16px] font-black text-on-accent shadow-glow"
        >
          {finished ? "一覧へもどる" : "次へ"}
        </button>
      </div>
    </motion.div>,
    document.body,
  );
}
