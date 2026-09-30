"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { ClassificationBadge } from "@/components/review/ClassificationBadge";
import { REVIEW_KNOWLEDGE } from "@/data/reviewKnowledge";
import { REVIEW_SPEAKER } from "@/data/reviewSpeaker";
import { EMPTY_FACTS, factsForDecision, matchKnowledge, type KnowledgeContext } from "@/lib/reviewKnowledge";
import { CLASSIFICATION_META } from "@/lib/classification";
import { FADE } from "@/lib/motion";
import type { ReviewedDecision } from "@/lib/reviewApi";

/**
 * 決定の見出し行と、その手についての解説。
 *
 * チェスドットコムの局後検討に合わせた構成(オーナー指定):
 * バッジ・手の名前・格付けのラベル・EV損を**1行にまとめ**、その下に解説の1〜2文を
 * **常時**出す。詳しい話はタップで開く。
 *
 * バッジはサーバーが決めた格付け(GTOのEV損 + 戦略判定での上書き)をそのまま出す。
 * 解説はオーナーの知識から、その局面の条件に当たったものを引く。バッジを戦略判定で
 * 上書きした手には、その理由の解説が必ず先に出る(`reviewKnowledge.ts` の戦略加点)。
 * 解説は解説役「バリィ」(`data/reviewSpeaker.ts`)の吹き出しとして出す。
 * ポストフロップで Notion の評価が付いた手は、GTOのEV損を並べない(バッジの根拠が違うため)。
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
  // ポストフロップで Notion の評価が付いた手は、GTOのEV損を並べない(バッジの根拠が違うため)。
  const evLoss = decision.strategy?.grade ? null : decision.evLossBb;

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

/**
 * 解説役「バリィ」と、その吹き出し。
 *
 * バリィが左に立ち、吹き出しのしっぽがバリィの頭の横を指す。吹き出しの中は台詞(summary)が
 * 常時出て、タップで詳しい話(title/body/出典)が同じ吹き出しの中に開く。
 * 話し手が未設定(`REVIEW_SPEAKER` が null)なら、情報アイコンだけの吹き出しになる。
 */
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
  const speaker = REVIEW_SPEAKER;
  return (
    <div className="mt-2.5 flex items-start gap-2.5">
      {speaker && (
        // 画像は 331×419(比率を保つ)。暗い地でも白い体と黒い輪郭で浮くよう透過済み。
        <img
          src={speaker.avatarSrc}
          alt={speaker.name}
          draggable={false}
          className="h-14 w-auto shrink-0 select-none"
          style={{ aspectRatio: "331 / 419" }}
        />
      )}
      <div className="relative min-w-0 flex-1">
        <div className="rounded-2xl border border-line bg-surface-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="pressable flex w-full items-start gap-2 px-3 py-2 text-left"
          >
            {!speaker && <Icon name="info" className="mt-[2px] h-3.5 w-3.5 shrink-0 text-accent" />}
            <span className="min-w-0 flex-1">
              {speaker && <span className="mb-0.5 block text-[10px] font-black text-accent">{speaker.name}</span>}
              <span className="block text-[12px] font-semibold leading-[1.6] text-fg">{summary}</span>
            </span>
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
                transition={FADE}
                className="overflow-hidden"
              >
                <div className="border-t border-line px-3 py-2">
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
        {speaker && (
          // しっぽ: 吹き出しと同じ面の小さな正方形を45度回し、外側の2辺にだけ罫を引く。
          // 吹き出しの上に重ねるので、内側の半分が吹き出しの罫を隠して継ぎ目が出ない。
          <span
            aria-hidden
            className="pointer-events-none absolute -left-[5px] top-[18px] h-2.5 w-2.5 rotate-45 border-b border-l border-line bg-surface-2"
          />
        )}
      </div>
    </div>
  );
}
