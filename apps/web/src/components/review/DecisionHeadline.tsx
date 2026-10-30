"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { ClassificationBadge } from "@/components/review/ClassificationBadge";
import { DecisionInfoRow } from "@/components/review/DecisionInfoRow";
import { PowerNumberTable } from "@/components/review/PowerNumberTable";
import { GtowRangeTable } from "@/components/review/GtowRangeTable";
import { TermSegments, TermText } from "@/components/review/TermText";
import { splitTermsMany } from "@/lib/reviewGlossary";
import { REVIEW_KNOWLEDGE } from "@/data/reviewKnowledge";
import { useSpeaker } from "@/lib/speakerContext";
import { articleRuleById, fillTemplate, isFallbackRule, type TemplateVars } from "@/lib/articleRules";
import { handCategory, handLabel } from "@/lib/handCategory";
import { preflopComment } from "@/lib/preflopComment";
import { barrelComment } from "@/lib/barrelComment";
import { spotComment } from "@/lib/spotComment";
import { coachComment } from "@/lib/coachComment";
import { EMPTY_FACTS, factsForDecision, matchKnowledge, type KnowledgeContext } from "@/lib/reviewKnowledge";
import { Loader } from "@/components/ui/Loader";
import { CLASSIFICATION_META, outOfScopeLabel, type Classification } from "@/lib/classification";
import { FADE, SPRING_MOVE, SPRING_SHEET, SPRING_THROW } from "@/lib/motion";
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
  book: "定石どおりの手だね。",
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
  book: "定石手です",
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
  gtoLabelOf,
}: {
  decision: ReviewedDecision;
  /** その手の表記(`UTG bet 33%` など。`actionNotation.ts`)。 */
  notation: string;
  /** 表記の下に小さく出す情報(ストリート・スタック・ポットなど)。 */
  info?: string;
  /** 解説の引き当てに使う文脈。渡さなければ格付けごとの一言になる。 */
  context?: KnowledgeContext;
  /** 渡すと、情報の横に GTO の正解のアクション(`Fold 100% EV+0.0`)を小さく並べる。バケットの表示名。 */
  gtoLabelOf?: (bucket: string) => string;
}) {
  const facts = useMemo(
    // ボードはその決定の時点まで切って判定する(最終ボードで見ると質感がずれる)。
    () => (context ? factsForDecision(decision.street, context) : EMPTY_FACTS),
    [decision.street, context]
  );
  const c = decision.classification;
  const solving = c === null && decision.outOfScopeReason === "solving";
  // ダブル/トリプルバレル・プローブ・ドンク・チェックレイズの表で評価した手(チェック/コール/フォールドを含む)は、
  // 場合分けから台詞を組み立てる。
  const barrel = decision.strategy?.barrel;
  const spot = decision.strategy?.spot;
  // 知識ベース(GTO Wizard の記事など)のルール。サーバーが決定に当てはめたものを id で引く。
  // バッジの無い決定(マルチウェイ等)でも、当たっていれば解説だけは出す。
  const vars = templateVarsOf(decision, context, notation);
  const article = articleRuleById(decision.article?.id);
  const articleNote = article
    ? {
        title: fillTemplate(article.title, vars),
        summary: fillTemplate(article.summary, vars),
        body: fillTemplate(article.body, vars),
        sourceUrl: article.sourceUrl ?? undefined,
      }
    : undefined;
  // 解説の優先順(どの決定にも必ず何か出す。「解析の対象外だよ」だけで終わらせない):
  //  バレル/スポットの表 → 記事のルール → プリフロップの GTO の一般論 → Notion の知識 → 局面の既定の解説(spots.md)
  const note = ((): Note | undefined => {
    if (solving) return undefined;
    // コーチのルール(ポットコミット・オッズ・ポラライズ・ブロックベット・リバーの MDF など)。バッジの付く判定は
    // どの解説よりも先に出す(格付けもこれで決まっている)。解説だけの判定は、表の解説が無いときに出す。
    const coach = decision.coach ? coachComment(decision.coach) : undefined;
    if (coach && decision.coach?.grade) return coach;
    // 15bb 以下のオープンは、パワーナンバーの判定(格付けもこれ)。表を一緒に見せる。
    if (decision.powerNumber) return powerNumberComment(decision.powerNumber);
    if (c && barrel) return barrelComment(barrel, context?.board);
    if (c && spot) return spotComment(spot, context?.board);
    if (coach) return coach;
    if (articleNote && !isFallbackRule(article)) return articleNote;
    // プリフロップは、その手とレンジを名指しする GTO の一般論を、Notion の一般的な一言より先に出す。
    const preflop = preflopComment(decision, vars);
    const knowledge = context ? matchKnowledge(decision, REVIEW_KNOWLEDGE, facts)[0] : undefined;
    return preflop ?? knowledge ?? articleNote;
  })();
  // GTO Wizard の解で判定したプリフロップは、そのレンジの 13×13 の表を「詳しく見る」に出す(オーナー指示)。
  const gtowTable =
    decision.gtowScene && note && !note.extra ? (
      <GtowRangeTable scene={decision.gtowScene} stack={decision.gtowStack ?? 70} hand={handLabel(context?.heroHoleCards ?? []) ?? undefined} />
    ) : undefined;
  const points = note && "points" in note ? note.points : undefined;
  const meta = c ? CLASSIFICATION_META[c] : null;
  // GTOのEV損は、バッジの根拠(プリフロップ=GTO / ポストフロップ=Notion)に関わらず出す。
  // 「GTO」と明記して、バッジと数字の根拠の違いが読めるようにする。
  const evLoss = c ? decision.evLossBb : null;
  // Notionの評価はすぐ出るが、GTOのEV損はソルバー待ち。バッジと解説を先に出し、EV損は後から埋まる。
  const gtoPending = c !== null && decision.outOfScopeReason === "solving";

  // マルチウェイ(3人以上)のポストフロップは、ヘッズアップの解説に「1段階下がる」を添える(オーナー指示。判定は変えない)。
  const multiway = decision.street !== "preflop" && !decision.analyzable;
  const line = note
    ? multiway && !note.summary.includes("マルチウェイ")
      ? `ヘッズアップなら、${note.summary}ただしマルチウェイではベットサイズと頻度が1段階下がるよ！`
      : note.summary
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
          <ArtisticPop key={decision.sequenceNumber} color={meta?.color ?? "#00AEBB"}>
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
          <span className={`ml-2 font-bold ${!c && !solving && note ? "text-[12px] text-fg-3" : ""}`}>
            {c ? GRADE_SENTENCE[c] : solving ? "解析中です" : note ? "GTO評価なし" : "解析の対象外です"}
          </span>
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
        <KnowledgeBody
          summary={line}
          points={points}
          title={note?.title}
          body={note?.body}
          sourceUrl={note && "sourceUrl" in note ? note.sourceUrl : undefined}
          extra={note?.extra ?? gtowTable}
        />
      </div>
      {gtoLabelOf ? (
        <DecisionInfoRow info={info} gtoActions={decision.gtoActions} labelOf={gtoLabelOf} />
      ) : (
        info && <p className="mt-2 text-[11px] font-semibold tabular-nums text-fg-3">{info}</p>
      )}
    </div>
  );
}

/** 吹き出しに出す解説の形(表・記事・Notion・一般論のどれから来ても同じ)。 */
interface Note {
  title?: string;
  summary: string;
  body?: string;
  points?: { label: string; text: string }[];
  sourceUrl?: string;
  /** 「詳しく見る」の中に出す図(パワーナンバー表など)。 */
  extra?: ReactNode;
}

const PN_SOURCE = "https://poker-nyuumon.com/power-number/";

/** パワーナンバーの判定を、バリィの台詞と「詳しく見る」の本文・表にする。 */
function powerNumberComment(p: NonNullable<ReviewedDecision["powerNumber"]>): Note {
  const pnText = p.pn === "inf" ? "∞" : p.pn === "-" ? "–(空欄)" : String(p.pn);
  const effM = p.effectiveM.toFixed(1);
  const verdict = p.correct === "push" ? "オールイン" : "フォールド";
  const compare =
    p.pn === "inf"
      ? "∞ だから、どんな有効M でもオールイン"
      : p.pn === "-"
        ? `空欄のマスは有効M が 3 未満のときだけオールイン。有効M は ${effM} だから${verdict}`
        : `有効M ${effM} ${p.correct === "push" ? "<" : "≧"} ${pnText} だから${verdict}`;
  const summary = p.followed
    ? `${p.handClass} のパワーナンバーは ${pnText}。${compare}。表どおりの正解だよ!`
    : `${p.handClass} のパワーナンバーは ${pnText}。${compare}が正解だったよ。`;
  return {
    title: "パワーナンバーで判定(15bb 以下)",
    summary,
    points: [
      { label: "手札", text: `${p.handClass}(パワーナンバー ${pnText})` },
      { label: "M", text: `${p.m.toFixed(1)}(スタック ÷ ブラインドとアンティの合計)` },
      { label: "有効M", text: `${effM}(M × 後ろの ${p.playersBehind} 人)` },
      { label: "正解", text: verdict },
    ],
    body:
      "15bb 以下で、自分より前に誰も参加していない(全員フォールドで回ってきた)ときは、パワーナンバーでオールインかフォールドかを決める。\n" +
      "M = 持ちスタック ÷(SB + BB + アンティ)、有効M = M × 後ろに控えている人数。有効M が表の数字より小さければオールイン、そうでなければフォールド。\n" +
      "表の右上はスーテッド、対角はペア、左下はオフスート。∞ はいつでもオールイン、空欄は有効M が 3 未満のときだけオールイン。後ろの人数が少ないほど(BTN・SB ほど)広くオールインできるよ。",
    sourceUrl: PN_SOURCE,
    extra: <PowerNumberTable highlight={p.handClass} />,
  };
}

/** 解説の置き換え語(`{hand}` など)の、この決定での値。 */
function templateVarsOf(d: ReviewedDecision, context: KnowledgeContext | undefined, notation: string): TemplateVars {
  const v: TemplateVars = {};
  const hole = context?.heroHoleCards ?? [];
  const hand = handLabel(hole);
  const cat = handCategory(hole);
  if (hand) v.hand = hand;
  if (cat) v.handCategory = cat;
  const pos = notation.split(" ")[0];
  if (pos) v.pos = pos;
  v.effBb = d.effStackBb.toFixed(0);
  const facing = d.facingSizeBb ?? 0;
  if (facing > 0) {
    v.facingBb = facing.toFixed(1);
    // potBb は相手のベット込みのポット。コール後のポット = potBb + コール額。
    v.potOdds = String(Math.round((facing / (d.potBb + facing)) * 100));
  }
  if (d.potBb > 0) v.spr = (d.effStackBb / d.potBb).toFixed(1);
  return v;
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
 * バリィが左に立ち、吹き出しのしっぽがバリィの頭の横を指す。吹き出しの中は台詞(summary)だけを
 * 常時出し、要点の表(サイズ・バリュー・ブラフ…)と詳しい話(title/body/出典)は「詳しく見る」で
 * 同じ吹き出しの中に開く(要点を常時出すと吹き出しが伸び、その分だけ卓が小さくなっていた。オーナー指摘)。
 * 話し手が未設定(`REVIEW_SPEAKER` が null)なら、情報アイコンだけの吹き出しになる。
 */
function KnowledgeBody({
  summary,
  points,
  title,
  body,
  sourceUrl,
  extra,
}: {
  summary: string;
  extra?: ReactNode;
  /** 要点(ノートの打ち方の表)。「詳しく見る」で開いたときに出す。 */
  points?: { label: string; text: string }[] | undefined;
  title?: string | undefined;
  body?: string | undefined;
  sourceUrl?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const voice = useSpeaker();
  const speaker = voice.speaker;
  summary = voice.say(summary);
  const hasPoints = !!points && points.length > 0;
  const hasBody = !!(title && body);
  const expandable = hasPoints || hasBody || !!extra;
  return (
    <div className="flex items-start gap-2.5">
      {speaker && (
        // 画像は 331×419(比率を保つ)。暗い地でも白い体と黒い輪郭で浮くよう透過済み。
        <img
          src={speaker.avatarSrc}
          alt={speaker.name}
          draggable={false}
          className="h-14 w-auto shrink-0 select-none"
          style={{ aspectRatio: voice.aspect }}
        />
      )}
      <div className="relative min-w-0 flex-1">
        <div className="rounded-2xl border border-line bg-surface-2">
          <button
            type="button"
            onClick={() => expandable && setOpen(true)}
            aria-haspopup={expandable ? "dialog" : undefined}
            // disabled にはしない(disabled のボタンの中では用語のタップも届かなくなる)。
            aria-disabled={!expandable}
            className={`flex w-full items-start gap-2 px-3 py-2 text-left ${expandable ? "pressable" : "cursor-default"}`}
          >
            {!speaker && <Icon name="info" className="mt-[2px] h-3.5 w-3.5 shrink-0 text-accent" />}
            <span className="min-w-0 flex-1">
              {speaker && <span className="mb-0.5 block text-[10px] font-black text-accent">{speaker.name}</span>}
              <span className="block text-[12px] font-semibold leading-[1.6] text-fg"><TermText text={summary} /></span>
              {expandable && <span className="mt-1 block text-[10px] font-bold text-accent">詳しく見る</span>}
            </span>
            {expandable && <Icon name="chevron-right" className="mt-[2px] h-3 w-3 shrink-0 text-fg-3" />}
          </button>
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
      <KnowledgeSheet
        open={open && expandable}
        onClose={() => setOpen(false)}
        summary={summary}
        points={hasPoints ? points : undefined}
        title={title}
        body={hasBody ? body : undefined}
        sourceUrl={sourceUrl}
        extra={extra}
      />
    </div>
  );
}

/**
 * 「詳しく見る」の中身。卓が隠れてよいので、画面のほぼ全体を使って読みやすい大きさで出す(オーナー指示)。
 * 解析の画面はスプリングで動くモーダルの中にあり、その中の `fixed` は親の transform に閉じ込められるため、
 * body 直下へポータルで出す。下から出るシート(SPRING_SHEET)で、背景のタップか「閉じる」で閉じる。
 */
function KnowledgeSheet({
  open,
  onClose,
  summary,
  points,
  title,
  body,
  sourceUrl,
  extra,
}: {
  extra?: ReactNode;
  open: boolean;
  onClose: () => void;
  summary: string;
  points?: { label: string; text: string }[] | undefined;
  title?: string | undefined;
  body?: string | undefined;
  sourceUrl?: string | undefined;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const voice = useSpeaker();
  if (!mounted) return null;
  const speaker = voice.speaker;
  const say = voice.say;
  // 台詞・要点・本文で、同じ用語は最初の1回だけ下線を引く。
  const pointTexts = (points ?? []).map((p) => say(p.text));
  // 画面の並び(台詞 → 要点 → 本文)の順に分ける。
  const segs = splitTermsMany([summary, ...pointTexts, body ? say(body) : ""]);
  const summarySeg = segs[0]!;
  const pointSegs = segs.slice(1, 1 + pointTexts.length);
  const bodySeg = segs[segs.length - 1]!;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="knowledge-sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={FADE}
          onClick={onClose}
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title ?? "解説"}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING_SHEET}
            onClick={(e) => e.stopPropagation()}
            className="flex h-[92dvh] w-full max-w-xl flex-col rounded-t-sheet glass-sheet shadow-e4"
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              {speaker && (
                <img
                  src={speaker.avatarSrc}
                  alt=""
                  draggable={false}
                  className="h-10 w-auto shrink-0 select-none"
                  style={{ aspectRatio: voice.aspect }}
                />
              )}
              <div className="min-w-0 flex-1">
                {speaker && <p className="text-[11px] font-black text-accent">{speaker.name}</p>}
                <h2 className="text-[16px] font-black leading-snug tracking-tight text-fg">{title ?? "解説"}</h2>
              </div>
              <button type="button" onClick={onClose} className="pressable shrink-0 rounded-full bg-surface-3 px-3 py-1.5 text-[12px] font-bold text-fg">
                閉じる
              </button>
            </div>
            <div className="safe-area-bottom flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-4">
              <p className="text-[15px] font-bold leading-[1.75] text-fg"><TermSegments segments={summarySeg} /></p>
              {points && (
                <div className="mt-4 space-y-2 rounded-2xl bg-surface-2 p-3.5">
                  {points.map((p, i) => (
                    <div key={p.label} className="flex gap-3 text-[14px] leading-[1.7]">
                      <span className="w-[5em] shrink-0 font-black text-fg-3">{p.label}</span>
                      <span className="min-w-0 flex-1 text-fg-2"><TermSegments segments={pointSegs[i] ?? []} /></span>
                    </div>
                  ))}
                </div>
              )}
              {extra && <div className="mt-4">{extra}</div>}
              {body && (
                // オーナーの文章は改行も含めてそのまま出す(整形しない)。
                <p className="mt-4 whitespace-pre-wrap text-[14px] leading-[1.85] text-fg-2"><TermSegments segments={bodySeg} /></p>
              )}
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center gap-1 text-[12px] font-bold text-accent"
                >
                  出典
                  <Icon name="chevron-right" className="h-3 w-3 shrink-0" />
                </a>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
