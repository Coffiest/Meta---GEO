"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { ClassificationBadge } from "@/components/review/ClassificationBadge";
import { REVIEW_KNOWLEDGE } from "@/data/reviewKnowledge";
import { REVIEW_SPEAKER } from "@/data/reviewSpeaker";
import { EMPTY_FACTS, factsForDecision, matchKnowledge, type KnowledgeContext } from "@/lib/reviewKnowledge";
import { Loader } from "@/components/ui/Loader";
import { CLASSIFICATION_META, outOfScopeLabel, type Classification } from "@/lib/classification";
import { FADE, SPRING_MOVE, SPRING_THROW } from "@/lib/motion";
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

/** 見出しの「○○手です」(chess.com の「絶妙手です」に当たる)。 */
const GRADE_SENTENCE: Record<Classification, string> = {
  artistic: "絶妙手です",
  best: "最善手です",
  great: "素晴らしい手です",
  excellent: "良手です",
  good: "良手です",
  book: "常識的な手です",
  inaccuracy: "緩手です",
  mistake: "悪手です",
  blunder: "大悪手です",
};

/**
 * 1手ぶんの局後検討。chess.com の Game Review と同じ並び(オーナー確定):
 *
 *   1. 上: 評価のバッジ + その手の表記(`UTG bet 33%` / `BB x/r` …)+「○○手です」(+ GTOのEV損)
 *   2. 下: 解説役「バリィ」の台詞(吹き出し)。タップで詳しい話が開く
 *   3. その下: 情報(`Flop · ES 40BB · Pot 6.5BB`。ES = エフェクティブスタック)
 *
 * バッジはサーバーが決めた格付け(プリフロップはGTOのEV損、ポストフロップはNotionの評価)。
 * 台詞はオーナーの知識から局面の条件に当たったものを1件引く。評価が付いた理由の解説が
 * 必ず先に来る(`reviewKnowledge.ts` の戦略加点)。当たるものが無ければ格付けごとの一言。
 * GTOのEV損は「GTO −0.40bb」と根拠を明記して、Notionの評価が付いた手にも出す。
 * ソルバー待ちの間はバッジと解説を先に出し、EV損の位置に「GTO解析中」を出す。
 * 絶妙手はバッジを小さく弾ませて目立たせる(`ArtisticPop`)。
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
  // GTOのEV損は、バッジの根拠(プリフロップ=GTO / ポストフロップ=Notion)に関わらず出す。
  // 「GTO」と明記して、バッジと数字の根拠の違いが読めるようにする。
  const evLoss = c ? decision.evLossBb : null;
  const solving = c === null && decision.outOfScopeReason === "solving";
  // Notionの評価はすぐ出るが、GTOのEV損はソルバー待ち。バッジと解説を先に出し、EV損は後から埋まる。
  const gtoPending = c !== null && decision.outOfScopeReason === "solving";

  const line = note
    ? note.summary
    : c
      ? GRADE_LINE[c]
      : solving
        ? "いまソルバーで解析しているよ。終わったら自動で出てくるからね。"
        : `この手は解析の対象外だよ。理由: ${outOfScopeLabel(decision.outOfScopeReason, decision.analyzable)}`;

  return (
    <div>
      {/* 1行目: 評価バッジ・その手の表記(UTG bet 33% など)・「○○手です」。chess.com の局後検討と同じ並び。 */}
      <div className="flex items-center gap-2">
        {c === "artistic" ? (
          // key で決定ごとに作り直し、絶妙手の手に来るたびに1回だけ演出する。
          <ArtisticPop key={decision.sequenceNumber} color={meta?.color ?? "#14b8a6"}>
            <ClassificationBadge classification={c} size={24} />
          </ArtisticPop>
        ) : c ? (
          <ClassificationBadge classification={c} size={24} />
        ) : solving ? (
          <Loader size="sm" />
        ) : (
          <Icon name="info" className="h-[20px] w-[20px] shrink-0 text-fg-3" />
        )}
        <p className="min-w-0 flex-1 truncate text-[15px] font-black tracking-[-0.01em] text-fg">
          {notation}
          <span className="ml-2 font-bold">{c ? GRADE_SENTENCE[c] : solving ? "解析中です" : "解析の対象外です"}</span>
        </p>
        {evLoss !== null && evLoss > 0.02 && (
          <span className="shrink-0 rounded-lg bg-crimson-500/15 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-crimson-300">
            GTO −{evLoss.toFixed(2)}bb
          </span>
        )}
        {gtoPending && (
          <span className="shrink-0 rounded-lg bg-white/[0.05] px-1.5 py-0.5 text-[11px] font-bold text-fg-3">
            GTO解析中…
          </span>
        )}
      </div>

      {/* その下: バリィの解説 */}
      <div className="mt-2.5">
        <KnowledgeBody summary={line} title={note?.title} body={note?.body} sourceUrl={note?.sourceUrl} />
      </div>
      {info && <p className="mt-2 text-[11px] font-semibold tabular-nums text-fg-3">{info}</p>}
    </div>
  );
}

/**
 * 絶妙手のバッジの演出。ごくシンプルに、バッジが弾んで出て、同じ色の輪が1回だけ広がって消える。
 * 触って動かすものではないので、弾みはスプリング、輪の消え方は FADE(motion.ts)。
 * 視差を減らす設定のときは何もしない。
 */
function ArtisticPop({ color, children }: { color: string; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <span className="relative inline-flex shrink-0">
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: `0 0 0 2px ${color}` }}
        initial={{ scale: 1, opacity: 0.9 }}
        animate={{ scale: 2.4, opacity: 0 }}
        transition={{ scale: SPRING_MOVE, opacity: { ...FADE, duration: 0.6 } }}
      />
      <motion.span
        className="inline-flex"
        initial={{ scale: 0.4 }}
        animate={{ scale: 1 }}
        transition={SPRING_THROW}
      >
        {children}
      </motion.span>
    </span>
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
