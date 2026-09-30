"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { ClassificationBadge } from "@/components/review/ClassificationBadge";
import { REVIEW_KNOWLEDGE } from "@/data/reviewKnowledge";
import { REVIEW_SPEAKER } from "@/data/reviewSpeaker";
import { EMPTY_FACTS, factsForDecision, matchKnowledge, type KnowledgeContext } from "@/lib/reviewKnowledge";
import { Loader } from "@/components/ui/Loader";
import { CLASSIFICATION_META, outOfScopeLabel, type Classification } from "@/lib/classification";
import { FADE } from "@/lib/motion";
import type { ReviewedDecision } from "@/lib/reviewApi";

/**
 * バッジが付いた手に、当たる解説が無いときのバリィの一言(格付けごと)。
 * chess.com の局後検討と同じく、どの手でもコーチの台詞が必ず上に出るようにする。
 */
const GRADE_LINE: Record<Classification, string> = {
  artistic: "絶妙手！なかなか見つけられない一手だよ。",
  best: "最善の一手だよ。この場面でいちばんいい選択だね。",
  great: "Great！ここはこの一手しかない場面だったよ。",
  excellent: "良い手だね。最善とほとんど変わらないよ。",
  good: "悪くない手だよ。もう少しいい選択肢もあったけどね。",
  book: "セオリーどおりの手だね。",
  inaccuracy: "ちょっともったいない手かも。もう少しいい選択肢があったよ。",
  mistake: "ここは悪手だね。ほかの選択肢を考えてみよう。",
  blunder: "ここは大きく損をしちゃう手だよ。次は気をつけようね。",
};

/**
 * 1手ぶんの局後検討。chess.com の Game Review と同じ並び(オーナー確定):
 *
 *   1. 上: 解説役「バリィ」の台詞(吹き出し)。タップで詳しい話が開く
 *   2. 下: 評価のバッジ + その手の表記(`UTG bet 33%` / `BB x/r` …)+ 評価名
 *   3. その下: 情報(ストリート・有効スタック・ポット)
 *
 * バッジはサーバーが決めた格付け(プリフロップはGTOのEV損、ポストフロップはNotionの評価)。
 * 台詞はオーナーの知識から局面の条件に当たったものを1件引く。評価が付いた理由の解説が
 * 必ず先に来る(`reviewKnowledge.ts` の戦略加点)。当たるものが無ければ格付けごとの一言。
 * Notionの評価が付いた手では、GTOのEV損を並べない(バッジの根拠が違うため)。
 */
export function DecisionHeadline({
  decision,
  notation,
  info,
  context,
}: {
  decision: ReviewedDecision;
  /** その手の表記(`UTG bet 33%` など。`actionNotation.ts`)。 */
  notation: string;
  /** 表記の下に小さく出す情報(ストリート・スタック・ポットなど)。 */
  info?: string;
  /** 解説の引き当てに使う文脈。渡さなければ格付けごとの一言になる。 */
  context?: KnowledgeContext;
}) {
  const facts = useMemo(
    // ボードはその決定の時点まで切って判定する(最終ボードで見ると質感がずれる)。
    () => (context ? factsForDecision(decision.street, context) : EMPTY_FACTS),
    [decision.street, context]
  );
  const c = decision.classification;
  const note = c && context ? matchKnowledge(decision, REVIEW_KNOWLEDGE, facts)[0] : undefined;
  const meta = c ? CLASSIFICATION_META[c] : null;
  // EV損はGTOで格付けした手にだけ出す(Notionの評価・対象外の手には出さない)。
  const evLoss = c && !decision.strategy?.grade ? decision.evLossBb : null;
  const solving = c === null && decision.outOfScopeReason === "solving";

  const line = note
    ? note.summary
    : c
      ? GRADE_LINE[c]
      : solving
        ? "いまソルバーで解析しているよ。終わったら自動で出てくるからね。"
        : `この手は解析の対象外だよ。理由: ${outOfScopeLabel(decision.outOfScopeReason, decision.analyzable)}`;

  return (
    <div>
      <KnowledgeBody summary={line} title={note?.title} body={note?.body} sourceUrl={note?.sourceUrl} />

      <div className="mt-3 flex items-center gap-2">
        {c ? (
          <ClassificationBadge classification={c} size={22} />
        ) : solving ? (
          <Loader size="sm" />
        ) : (
          <Icon name="info" className="h-[18px] w-[18px] shrink-0 text-fg-3" />
        )}
        <p className="min-w-0 flex-1 truncate text-[15px] font-black tracking-[-0.01em] text-fg">{notation}</p>
        {meta ? (
          <span className="shrink-0 text-[13px] font-black" style={{ color: meta.color }}>
            {meta.label}
          </span>
        ) : (
          <span className="shrink-0 text-[12px] font-bold text-fg-3">{solving ? "解析中" : "対象外"}</span>
        )}
        {evLoss !== null && evLoss > 0.02 && (
          <span className="shrink-0 rounded-lg bg-crimson-500/15 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-crimson-300">
            −{evLoss.toFixed(2)}bb
          </span>
        )}
      </div>
      {info && <p className="mt-1 pl-[30px] text-[11px] font-semibold tabular-nums text-fg-3">{info}</p>}
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
  title?: string | undefined;
  body?: string | undefined;
  sourceUrl?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const speaker = REVIEW_SPEAKER;
  const expandable = !!(title && body);
  return (
    <div className="flex items-start gap-2.5">
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
            onClick={() => expandable && setOpen((v) => !v)}
            aria-expanded={expandable ? open : undefined}
            disabled={!expandable}
            className={`flex w-full items-start gap-2 px-3 py-2 text-left ${expandable ? "pressable" : "cursor-default"}`}
          >
            {!speaker && <Icon name="info" className="mt-[2px] h-3.5 w-3.5 shrink-0 text-accent" />}
            <span className="min-w-0 flex-1">
              {speaker && <span className="mb-0.5 block text-[10px] font-black text-accent">{speaker.name}</span>}
              <span className="block text-[12px] font-semibold leading-[1.6] text-fg">{summary}</span>
            </span>
            {expandable && (
              <Icon
                name="chevron-right"
                className={`mt-[2px] h-3 w-3 shrink-0 text-fg-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
              />
            )}
          </button>
          <AnimatePresence initial={false}>
            {open && expandable && (
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
