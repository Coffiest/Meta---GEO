"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CURRICULUM, type Lesson } from "@/data/lessons";
import { REVIEW_SPEAKER } from "@/data/reviewSpeaker";
import { fetchLessonOverview, startLesson, type LessonOverview } from "@/lib/lessonApi";
import { FADE, SPRING_MOVE } from "@/lib/motion";
import { usePricingSheet } from "@/components/PricingSheet";
import { Icon } from "@/components/Icon";
import { LessonPlayer } from "./LessonPlayer";

/**
 * Lesson タブ(バリィ先生のレッスン。chess.com の Lessons を参考。オーナー確定)。
 * - 好きなレッスンを選べる。終えたレッスンにはチェックと星(一発で正解した数)。上に全体の進み具合の帯。
 * - 無料・シルバーは1日3レッスン(開始した時に数える。同じ日のやり直しは数えない)。ゴールド以上は無制限。
 * - 中身がまだ無いレッスンは「準備中」で押せない。ログインが必要。
 */
export function LessonTab({ accessToken }: { accessToken: string | undefined }) {
  const [overview, setOverview] = useState<LessonOverview | null>(null);
  const [playing, setPlaying] = useState<Lesson | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const { openPricing } = usePricingSheet();

  const reload = useCallback(() => {
    if (!accessToken) return;
    void fetchLessonOverview(accessToken).then((o) => o && setOverview(o));
  }, [accessToken]);
  useEffect(reload, [reload]);

  if (!accessToken) {
    return <p className="py-10 text-center text-[13px] text-fg-2">レッスンを受けるにはログインしてね。</p>;
  }

  const progress = new Map((overview?.progress ?? []).map((p) => [p.lessonId, p]));
  const available = CURRICULUM.flatMap((s) => s.lessons).filter((l) => l.steps.length > 0);
  const done = available.filter((l) => progress.get(l.id)?.completed).length;

  const open = async (lesson: Lesson) => {
    const r = await startLesson(accessToken, lesson.id);
    if (r === "limit") setLimitOpen(true);
    else if (r === "ok") setPlaying(lesson);
  };

  return (
    <div>
      {/* 全体の進み具合(ガラスの板) */}
      <div className="glass-panel mb-5 rounded-3xl px-4 py-3.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-bold text-fg">
            <span className="text-[22px] font-black tabular-nums text-accent">{done}</span>
            <span className="text-fg-2"> / {available.length} レッスン完了</span>
          </span>
          {overview && !overview.unlimited && overview.remainingToday !== null && (
            <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-bold tabular-nums text-accent">
              今日あと {overview.remainingToday} レッスン
            </span>
          )}
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
          <motion.div
            className="h-full rounded-full bg-accent"
            initial={{ width: 0 }}
            animate={{ width: available.length ? `${(done / available.length) * 100}%` : "0%" }}
            transition={SPRING_MOVE}
          />
        </div>
      </div>

      {CURRICULUM.map((section) => {
        // 見出しの「1. 」を番号の丸に分ける。
        const m = /^(\d+)\.\s*(.*)$/.exec(section.title);
        const num = m?.[1];
        const title = m?.[2] ?? section.title;
        const readyCount = section.lessons.filter((l) => l.steps.length > 0).length;
        return (
          <section key={section.title} className="mb-4">
            <div className="mb-2 flex items-center gap-2 px-1">
              {num !== undefined && (
                <span
                  className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[12px] font-black tabular-nums ${
                    readyCount > 0 ? "bg-accent text-on-accent" : "bg-white/[0.08] text-fg-3"
                  }`}
                >
                  {num}
                </span>
              )}
              <h3 className={`text-[16px] font-black tracking-tight ${readyCount > 0 ? "text-fg" : "text-fg-2"}`}>{title}</h3>
            </div>
            {/* 1つのセクションを1枚の板にまとめ、行は細い線で区切る */}
            <div className="overflow-hidden rounded-2xl bg-surface shadow-e1" style={{ border: "0.5px solid rgba(232,228,211,0.10)" }}>
              {section.lessons.map((lesson, i) => {
                const ready = lesson.steps.length > 0;
                const p = progress.get(lesson.id);
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    disabled={!ready}
                    onClick={() => void open(lesson)}
                    className={`flex w-full items-center gap-3 px-3 py-3 text-left ${
                      ready ? "pressable bg-accent/[0.07]" : "cursor-default"
                    } ${i > 0 ? "border-t border-white/[0.07]" : ""}`}
                  >
                    {/* 押せるものはアクセントの丸い再生ボタン、準備中は灰色の錠(押せる/押せないを色と形で分ける) */}
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                        ready ? "bg-accent text-on-accent shadow-glow-sm" : "bg-white/[0.05] text-fg-faint"
                      }`}
                    >
                      <Icon name={ready ? "play" : "lock"} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[15px] font-bold ${ready ? "text-fg" : "text-fg-3"}`}>{lesson.title}</span>
                    </span>
                    {p && p.bestStars > 0 && (
                      <span className="flex shrink-0 gap-0.5 text-accent" aria-label={`星${p.bestStars}`}>
                        {[0, 1, 2].map((k) => (
                          <Icon key={k} name="star" filled={k < p.bestStars} className="h-3.5 w-3.5" />
                        ))}
                      </span>
                    )}
                    {p?.completed && <Icon name="check" className="h-5 w-5 shrink-0 text-accent" />}
                    {ready ? (
                      <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-black text-accent">
                        {p?.completed ? "もう一度" : "はじめる"}
                        <Icon name="chevron-right" className="h-4 w-4" />
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold text-fg-faint">準備中</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* 今日の回数を使い切ったとき */}
      <AnimatePresence>
        {limitOpen && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 px-4 pb-[max(env(safe-area-inset-bottom),16px)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            onClick={() => setLimitOpen(false)}
          >
            <motion.div
              className="glass-sheet w-full max-w-md rounded-3xl p-5"
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 40 }}
              transition={SPRING_MOVE}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                {REVIEW_SPEAKER && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={REVIEW_SPEAKER.avatarSrc} alt="" className="h-14 w-auto shrink-0" />
                )}
                <p className="text-[14px] leading-relaxed text-fg">
                  今日のレッスンはここまでだよ。明日また一緒にやろうね。ゴールド以上なら、いつでも何回でも受けられるよ。
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLimitOpen(false);
                  openPricing("gold");
                }}
                className="pressable mt-4 h-12 w-full rounded-2xl bg-accent text-[15px] font-black text-on-accent shadow-glow"
              >
                プランを見る
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {playing && (
        <LessonPlayer
          lesson={playing}
          accessToken={accessToken}
          onClose={() => {
            setPlaying(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
