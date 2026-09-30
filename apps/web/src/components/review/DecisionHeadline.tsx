"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { ClassificationBadge } from "@/components/review/ClassificationBadge";
import { REVIEW_KNOWLEDGE } from "@/data/reviewKnowledge";
import { EMPTY_FACTS, factsForDecision, matchKnowledge, type KnowledgeContext } from "@/lib/reviewKnowledge";
import { CLASSIFICATION_META } from "@/lib/classification";
import type { ReviewedDecision } from "@/lib/reviewApi";

/**
 * 決定の見出し行と、その手についての解説。
 *
 * チェスドットコムの局後検討に合わせた構成(オーナー指定):
 * バッジ・手の名前・格付けのラベル・EV損を**1行にまとめ**、その下に解説の1〜2文を
 * **常時**出す。詳しい話はタップで開く。
 *
 * 格付けそのものには手を出さない ―― バッジは今までどおり「GTO最善からのEV損」。
 * 解説はオーナーが Notion に書いた知識から、その局面の条件に当たったものを引いている。
 *
 * 解説は**1件だけ**。常時表示にした以上、2件並べると決定ごとに文章の塊が2つ積まれて
 * 一覧性が壊れる(`MAX_NOTES_PER_DECISION`)。
 */
export function DecisionHeadline({
  decision,
  subject = "あなた",
  context,
}: {
  decision: ReviewedDecision;
  /** 行頭に出す主語。トーナメントの再生では相手の名前が入る。 */
  subject?: string;
  /** 解説の引き当てに使う文脈。渡さなければ解説は出ない。 */
  context?: KnowledgeContext;
}) {
  const facts = useMemo(
    // ボードはその決定の時点まで切って判定する(最終ボードで見ると質感がずれる)。
    () => (context ? factsForDecision(decision.street, context) : EMPTY_FACTS),
    [decision.street, context]
  );
  const note = context ? matchKnowledge(decision, REVIEW_KNOWLEDGE, facts)[0] : undefined;
  const meta = decision.classification ? CLASSIFICATION_META[decision.classification] : null;
  const evLoss = decision.evLossBb;

  return (
    <div>
      <div className="flex items-start gap-2">
        {decision.classification && <ClassificationBadge classification={decision.classification} size={22} />}
        <p className="min-w-0 flex-1 text-[14px] font-black leading-[1.35] text-fg">
          {subject}: {decision.actionName}
          {meta && <span className="ml-1.5 font-bold text-fg-2">{meta.label}です</span>}
        </p>
        {evLoss !== null && evLoss > 0.02 && (
          <span className="shrink-0 rounded-lg bg-crimson-500/15 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-crimson-300">
            −{evLoss.toFixed(2)}bb
          </span>
        )}
      </div>

      {note && (
        <KnowledgeBody summary={note.summary} title={note.title} body={note.body} sourceUrl={note.sourceUrl} />
      )}
    </div>
  );
}

function KnowledgeBody({
  summary,
  title,
  body,
  sourceUrl,
}: {
  summary: string;
  title: string;
  body: string;
  sourceUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded-xl bg-white/[0.05] ring-1 ring-inset ring-white/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pressable flex w-full items-start gap-2 px-2.5 py-2 text-left"
      >
        <Icon name="info" className="mt-[2px] h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 text-[12px] font-semibold leading-[1.6] text-fg-2">{summary}</span>
        <Icon
          name="chevron-right"
          className={`mt-[2px] h-3 w-3 shrink-0 text-fg-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
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
            <div className="border-t border-white/10 px-2.5 py-2">
              <p className="mb-1 text-[11px] font-black text-fg">{title}</p>
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
