"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SPRING_MOVE } from "@/lib/motion";
import { RafuVoice } from "@/lib/speakerContext";
import { RAFU_SPEAKER } from "@/data/reviewSpeaker";
import { usePricingSheet } from "@/components/PricingSheet";
import type { ReviewedDecision, ReviewHandTimeline, TournamentReviewHand } from "@/lib/reviewApi";
import { CLASSIFICATION_META, type Classification } from "@/lib/classification";
import { ClassificationBadge } from "@/components/review/ClassificationBadge";
import { DecisionHeadline } from "@/components/review/DecisionHeadline";
import { actionLabel, decisionInfo, STREET_EN } from "@/lib/actionNotation";
import type { KnowledgeContext } from "@/lib/reviewKnowledge";
import { PokerTable } from "@/components/PokerTable";
import { FitBox } from "@/components/review/FitBox";
import { PlayingCard } from "@/components/PlayingCard";
import { playersFromTimeline, revealedFromTimeline, type ReplayStep, type TournamentReplay } from "@/lib/replay";
import { OPEN_RAISE_BUCKET, OPEN_RAISE_SOURCE_BUCKETS, PREFLOP_DISPLAY_BUCKET_LABELS, POSTFLOP_BUCKET_LABELS } from "@/lib/geoApi";
import { bucketColor, bucketTextColor } from "@/components/geo/colors";
import { HandClassMatrix } from "@/components/geo/HandClassMatrix";
import { Icon } from "@/components/Icon";

/**
 * 棋譜解析の通し再生(全画面)。chess.com の局後検討と同じ配置(オーナー確定):
 *
 *   ヘッダー
 *   評価カード(上): バリィの台詞 → 評価の行(バッジ + `UTG bet 33%` + 評価名)→ 情報 → GTO推奨 → GEO解
 *   卓(中央): 空いた領域に合わせて `PokerTable` が縮む
 *   手の一覧(下): 今のハンドの手を横一列に。今の手を強調して中央に寄せる。両端に ‹ ›
 *
 * `TournamentReviewModal` から切り出したもの。固定データで単体描画できる。
 */

/** iOSのグループリスト背景(systemGroupedBackground)。 */
export const SHEET_BG = "#101012";
/** iOSのヘアライン分割線。 */
export const HAIRLINE = "rgba(255,255,255,0.10)";

/**
 * mergeOpenRaiseOptions(geoApi.ts)は件数(count)を持つ本来のActionOption向けで、
 * ここで扱うGEO解の頻度チップは頻度(frequency)のみの軽量な型(GeoDecisionInfo.options)。
 * 同じ対象バケット(raise2-5/raise5+/allIn)を頻度の単純合算で「Open Raise」1つへ統合する、
 * この型専用の版。
 */
function mergeOpenRaiseFrequencies(
  options: { bucket: string; frequency: number }[],
): { bucket: string; frequency: number; representativeBucket?: string }[] {
  const sources = options.filter((o) => OPEN_RAISE_SOURCE_BUCKETS.includes(o.bucket));
  if (sources.length === 0) return options;
  const rest = options.filter((o) => !OPEN_RAISE_SOURCE_BUCKETS.includes(o.bucket));
  const frequency = sources.reduce((sum, o) => sum + o.frequency, 0);
  const representativeBucket = [...sources].sort((a, b) => b.frequency - a.frequency)[0]?.bucket;
  return [...rest, { bucket: OPEN_RAISE_BUCKET, frequency, ...(representativeBucket ? { representativeBucket } : {}) }];
}

function bucketLabel(street: string, bucket: string): string {
  // プリフロップは表示専用のOpen Raise統合バケット("openRaise")のラベルも解決できるよう、
  // 生バケットのラベル表(PREFLOP_BUCKET_LABELS)ではなく統合込みの表を使う。
  const table = street === "preflop" ? PREFLOP_DISPLAY_BUCKET_LABELS : POSTFLOP_BUCKET_LABELS;
  return (table as Record<string, string>)[bucket] ?? bucket;
}

/** GEO母集団解(頻度チップ + タップで169レンジ表を展開)。heroの決定でn≥5000のときのみ。 */
function GeoSolution({ d }: { d: ReviewedDecision }) {
  const [open, setOpen] = useState(false);
  if (!d.geo) return null;
  const geo = d.geo;
  const isPreflop = d.street === "preflop";
  const bucketTable = isPreflop ? PREFLOP_DISPLAY_BUCKET_LABELS : POSTFLOP_BUCKET_LABELS;
  // プリフロップはRaise 2-5bb/Raise 5bb+/Allinを表示専用の「Open Raise」1つへ統合する
  // (PositionPillBar/PositionActionRow/HandClassMatrixと表示を揃える。ユーザー指示)。
  const options: { bucket: string; frequency: number; representativeBucket?: string }[] = isPreflop
    ? mergeOpenRaiseFrequencies(geo.options)
    : geo.options;
  const shown = [...options].filter((o) => o.frequency > 0).sort((a, b) => b.frequency - a.frequency);
  return (
    <div className="mt-2.5 rounded-2xl bg-mint-500/[0.08] px-3 py-2.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="pressable flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-1 rounded-full bg-mint-500/15 px-2 py-0.5 text-[11px] font-black text-mint-400">
          <Icon name="graph-up" className="h-3 w-3" />
          GEO解
        </span>
        <span className="text-[11px] font-semibold text-fg-2 tabular-nums">母集団 n={geo.sampleSize.toLocaleString()}</span>
        <Icon name="chevron-down" className={`ml-auto h-4 w-4 text-fg-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {shown.map((o) => {
          // 統合後の「openRaise」バケットは単体では色を持たないため、統合前の実バケットのうち
          // 最多件数だったもの(representativeBucket)へ解決する(HandClassMatrixと同じ規則)。
          const color = bucketColor(o.representativeBucket ?? o.bucket);
          return (
            <div key={o.bucket} className="rounded-full px-2.5 py-1" style={{ background: color, color: bucketTextColor(color) }}>
              <span className="text-[11px] font-bold">{bucketLabel(d.street, o.bucket)}</span>
              <span className="ml-1 text-[11px] font-black tabular-nums">{Math.round(o.frequency * 100)}%</span>
            </div>
          );
        })}
      </div>
      {open && (
        <div className="mt-2.5">
          <HandClassMatrix matrix={geo.matrix} bucketLabels={bucketTable} mergeOpenRaise={isPreflop} />
        </div>
      )}
    </div>
  );
}

/** 再生の1手を「UTG bet 33%」の形で書く。 */
function stepNotation(step: Extract<ReplayStep, { type: "action" }>, timeline: ReviewHandTimeline): string {
  return actionLabel(timeline.actions, step.sequenceNumber, {
    buttonFixedPos: timeline.buttonFixedPos,
    bigBlind: timeline.levelBigBlind,
  });
}

/**
 * 意思決定パネル。上にバリィの台詞、下に評価と「UTG bet 33%」の表記、
 * その下に GTO推奨の頻度と GEO母集団解。評価が付くのは自分の決定だけ。
 */
function DecisionPanel({
  d,
  notation,
  info,
  context,
}: {
  d: ReviewedDecision;
  notation: string;
  info: string;
  context?: KnowledgeContext;
}) {
  return (
    <div>
      {/* GTO の正解のアクションは、情報の横に小さく並べる(縦の高さを使わない)。 */}
      <DecisionHeadline
        decision={d}
        notation={notation}
        info={info}
        context={context}
        gtoLabelOf={(bucket) => bucketLabel(d.street, bucket)}
      />
      <GeoSolution d={d} />
    </div>
  );
}

/**
 * 手の一覧(chess.com の手順リストに当たる)。今のハンドの手を横一列に並べる。
 * 自分の手は評価バッジ付きで、文字もバッジと同じ色。相手の手は薄い色。ストリートが変わるところに小さな区切り。
 * 今の手は強調し、手が進むと自動で横スクロールして中央に寄せる。タップでその手へ。
 */
function ReplayMoveStrip({
  steps,
  stepIndex,
  handId,
  timeline,
  goTo,
  oppBySeq,
}: {
  steps: ReplayStep[];
  stepIndex: number;
  handId: string;
  timeline: ReviewHandTimeline;
  goTo: (idx: number) => void;
  /** 相手の決定の評価(プラチナだけ)。相手の手にもバッジを付ける。 */
  oppBySeq: Map<number, ReviewedDecision>;
}) {
  const reduced = useReducedMotion();
  const refs = useRef(new Map<number, HTMLButtonElement>());
  const items = useMemo(
    () => steps.map((s, idx) => ({ s, idx })).filter(({ s }) => s.handId === handId),
    [steps, handId]
  );

  // 最初(開いた直後・ハンドが変わった直後)は一瞬で合わせ、そのあとの手送りは滑らかに寄せる。
  const placedFor = useRef<string | null>(null);
  useEffect(() => {
    const instant = reduced || placedFor.current !== handId;
    placedFor.current = handId;
    refs.current.get(stepIndex)?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: instant ? "auto" : "smooth",
    });
  }, [stepIndex, reduced, handId]);

  let lastStreet: string | null = null;
  return (
    <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 py-1">
      {items.map(({ s, idx }) => {
        const current = idx === stepIndex;
        // 今の手はアクセントの「中」(背景 accent/15 + 下線)。
        const base = `pressable flex shrink-0 items-center gap-1 rounded-lg border-b-2 px-2 py-1.5 text-[13px] font-black tracking-[-0.01em] tabular-nums ${
          current ? "border-accent bg-accent/15" : "border-transparent"
        }`;
        if (s.type === "handStart") {
          return (
            <button
              key={idx}
              ref={(el) => void (el ? refs.current.set(idx, el) : refs.current.delete(idx))}
              onClick={() => goTo(idx)}
              className={`${base} text-fg-2`}
            >
              #{s.handNumber}
            </button>
          );
        }
        const divider = s.street !== lastStreet ? (STREET_EN[s.street] ?? s.street) : null;
        lastStreet = s.street;
        const c = s.actorIsHero ? (s.decision?.classification ?? null) : (oppBySeq.get(s.sequenceNumber)?.classification ?? null);
        return (
          <span key={idx} className="flex shrink-0 items-center gap-1">
            {divider && <span className="px-1 text-[10px] font-bold uppercase tracking-[0.08em] text-fg-3">{divider}</span>}
            <button
              ref={(el) => void (el ? refs.current.set(idx, el) : refs.current.delete(idx))}
              onClick={() => goTo(idx)}
              className={`${base} ${s.actorIsHero ? "text-fg" : "text-fg-3"}`}
              // 評価の付いた自分の手は、バッジと同じ色の文字にする(chess.com の手順リストと同じ)。
              style={c ? { color: CLASSIFICATION_META[c as Classification]?.color } : undefined}
              aria-current={current ? "step" : undefined}
            >
              {c && <ClassificationBadge classification={c as Classification} size={16} />}
              {stepNotation(s, timeline)}
            </button>
          </span>
        );
      })}
    </div>
  );
}

export function ReviewReplayView({
  hands,
  replay,
  heroUserId,
  stepIndex,
  goTo,
  onBack,
}: {
  hands: TournamentReviewHand[];
  replay: TournamentReplay;
  heroUserId: string;
  stepIndex: number;
  goTo: (idx: number) => void;
  onBack: () => void;
}) {
  const steps = replay.steps;
  const total = steps.length;
  const step: ReplayStep | null = steps[stepIndex] ?? null;
  const currentHand = useMemo(
    () => (step ? hands.find((h) => h.handId === step.handId) ?? null : null),
    [hands, step]
  );
  const heroSeat = currentHand?.timeline.seats.find((s) => s.userId === heroUserId);
  const heroSeatIndex = heroSeat?.seatIndex ?? null;
  const heroCards = useMemo(() => heroSeat?.holeCards ?? [], [heroSeat]);
  // 相手の決定(プラチナ)と、ぼかしの位置(プラチナ以外)。
  const oppBySeq = useMemo(
    () => new Map((currentHand?.opponentDecisions ?? []).map((d) => [d.sequenceNumber, d] as const)),
    [currentHand]
  );
  const lockedSeqs = useMemo(() => new Set((currentHand?.opponentLocked ?? []).map((l) => l.sequenceNumber)), [currentHand]);
  const { openPricing } = usePricingSheet();
  // 解説の引き当てに使う文脈。ハンドが切り替わるたびに作り直す。
  const knowledgeContext = useMemo<KnowledgeContext | undefined>(
    () =>
      currentHand
        ? {
            board: currentHand.timeline.board,
            heroHoleCards: heroCards,
            actions: currentHand.timeline.actions,
            buttonFixedPos: currentHand.timeline.buttonFixedPos,
            // 卓は常に6席(配られた人数ではない。空席があるとポットの形・BvB の判定がずれていた)。
            seatCount: 6,
          }
        : undefined,
    [currentHand, heroCards]
  );

  if (!step || !currentHand) return null;
  const seatCount = Math.max(6, currentHand.timeline.seats.length);

  return (
    // exit は付けない。この画面はモーダル(AnimatePresence の子)の中で総括と入れ替わるだけで、
    // exit を付けると AnimatePresence に退場待ちとして登録されたまま残り、モーダルを閉じても
    // 透明な全画面の膜が消えずにヒストリー画面のタップを全部塞いでいた(フリーズに見えた)。
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden"
      style={{ background: SHEET_BG }}
    >
      {/* すりガラスのナビゲーションバー */}
      <header className="glass-header shrink-0 flex items-center gap-2.5 px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-2.5">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-fg"
          aria-label="総括へ戻る"
        >
          <Icon name="chevron-left" className="h-4 w-4" />
        </motion.button>
        <p className="text-[16px] font-bold tracking-tight text-fg">棋譜解析</p>
        <p className="ml-auto rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-fg-2 tabular-nums">
          Hand #{step.handNumber} · {stepIndex + 1}/{total}
        </p>
      </header>

      {/* 上: 評価カード(chess.com と同じく、解説は画面の上)。
          高さは場面によらず一定にする。中身に合わせて伸び縮みさせると、そのたびに卓の空き領域が変わって
          卓の大きさが変わり、場面を切り替えるたびに卓がちらついていた(オーナー指摘)。
          高さは標準的な解説(見出し + バリィの3行 + 情報の行)がちょうど入る量に詰め、入りきらない解説は
          FitBox が文字ごと縮めて収める(下に何も無い空白を作らない。オーナー指摘)。 */}
      <div className="shrink-0 px-3 pt-2">
        <motion.div
          key={stepIndex}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_MOVE}
          className="rounded-[20px] bg-surface shadow-e2"
          style={{ border: `0.5px solid ${HAIRLINE}` }}
        >
          <FitBox className="h-[176px] px-3.5 py-3" contentKey={stepIndex}>
          {step.type === "handStart" ? (
            <div className="flex items-center gap-3">
              <div>
                <p className="text-[15px] font-bold tracking-tight text-fg">Hand #{step.handNumber}</p>
                <p className="text-[11px] font-medium text-fg-2 tabular-nums">
                  ブラインド {step.smallBlind.toLocaleString()}/{step.bigBlind.toLocaleString()}
                  {step.ante > 0 ? ` (アンティ ${step.ante.toLocaleString()})` : ""}
                </p>
              </div>
              {step.heroCards.length === 2 && (
                <div className="ml-auto flex gap-1">
                  {step.heroCards.map((c, i) => (
                    <div key={i} className="w-9">
                      <PlayingCard card={c} size="sm" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : step.decision && step.actorIsHero ? (
            <DecisionPanel
              d={step.decision}
              notation={stepNotation(step, currentHand.timeline)}
              info={decisionInfo(step.decision.street, step.decision.effStackBb, step.decision.potBb)}
              context={knowledgeContext}
            />
          ) : step.type === "action" && !step.actorIsHero && oppBySeq.has(step.sequenceNumber) ? (
            // 相手の決定(プラチナ): ラフくんが同じ中身を関西弁で解説する。
            <RafuVoice>
              <DecisionPanel
                d={oppBySeq.get(step.sequenceNumber)!}
                notation={stepNotation(step, currentHand.timeline)}
                info={decisionInfo(
                  oppBySeq.get(step.sequenceNumber)!.street,
                  oppBySeq.get(step.sequenceNumber)!.effStackBb,
                  oppBySeq.get(step.sequenceNumber)!.potBb
                )}
                context={
                  knowledgeContext && {
                    ...knowledgeContext,
                    heroHoleCards: currentHand.timeline.seats.find((s) => s.seatIndex === step.actorSeat)?.holeCards ?? [],
                  }
                }
              />
            </RafuVoice>
          ) : step.type === "action" && !step.actorIsHero && lockedSeqs.has(step.sequenceNumber) ? (
            <LockedRafu notation={stepNotation(step, currentHand.timeline)} onUnlock={() => openPricing("platinum")} />
          ) : (
            // 評価の付かない手(解説の無い相手の手・自分の定型の手)は表記だけ。
            <p className={`text-[14px] font-black tracking-[-0.01em] ${step.actorIsHero ? "text-fg" : "text-fg-3"}`}>
              {stepNotation(step, currentHand.timeline)}
            </p>
          )}
          </FitBox>
        </motion.div>
      </div>

      {/* 中央: 卓 */}
      <main className="flex-1 min-h-0 flex flex-col justify-center px-2 overflow-hidden">
        <PokerTable
          state={step.snapshot}
          yourSeatIndex={heroSeatIndex}
          yourCards={heroCards}
          seatCount={seatCount}
          revealedHoleCards={revealedFromTimeline(currentHand.timeline)}
          players={playersFromTimeline(currentHand.timeline)}
          bigBlind={currentHand.timeline.levelBigBlind}
          lastActionBySeat={step.type === "action" ? { [step.actorSeat]: step.seatAction } : {}}
          lastHandDeltaBySeat={null}
          turnTimer={null}
        />
      </main>

      {/* 下: 手の一覧(chess.com と同じく、アクションは画面の下) */}
      <div
        className="shrink-0 border-t px-2 pt-1 pb-[calc(env(safe-area-inset-bottom)+10px)]"
        style={{ borderColor: HAIRLINE }}
      >
        {/* トーナメント全体の進み具合と、悪手・大悪手・絶妙手のピン(タップでジャンプ)。 */}
        <div className="relative mx-12 h-4">
          <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-white/10" />
          <div
            className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-accent/60"
            style={{ width: total > 1 ? `${(stepIndex / (total - 1)) * 100}%` : "0%" }}
          />
          {total > 1 &&
            replay.pins.map((pin, i) => (
              <button
                key={i}
                onClick={() => goTo(pin.stepIndex)}
                className="pressable absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${(pin.stepIndex / (total - 1)) * 100}%` }}
                aria-label={CLASSIFICATION_META[pin.classification as Classification]?.label ?? pin.classification}
              >
                <svg width={10} height={10} viewBox="0 0 10 10">
                  <circle
                    cx="5"
                    cy="5"
                    r="4"
                    fill={CLASSIFICATION_META[pin.classification as Classification]?.color ?? "#999"}
                    stroke="#ffffff"
                    strokeWidth="1.2"
                  />
                </svg>
              </button>
            ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => goTo(stepIndex - 1)}
            disabled={stepIndex <= 0}
            className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg disabled:opacity-30"
            aria-label="前のアクション"
          >
            <Icon name="chevron-left" className="h-5 w-5" />
          </button>
          <ReplayMoveStrip
            steps={steps}
            stepIndex={stepIndex}
            handId={step.handId}
            timeline={currentHand.timeline}
            goTo={goTo}
            oppBySeq={oppBySeq}
          />
          <button
            onClick={() => goTo(stepIndex + 1)}
            disabled={stepIndex >= total - 1}
            className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg disabled:opacity-30"
            aria-label="次のアクション"
          >
            <Icon name="chevron-right" className="h-5 w-5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/** 読めない(ぼかした)ラフくんの台詞の見本。中身ではなく、ぼかしの下の文字の形だけ。 */
const LOCKED_SAMPLE = "この場面はな、相手のレンジを考えたらここはこう打つのがええねん。サイズもちゃんと見とかなあかんで。";

/**
 * プラチナ以外: 相手の手の解説を、ぼかしたラフくんの吹き出しで見せ、プラチナへ誘導する(課金のフック)。
 * 解説の中身はサーバーから届いていない(ぼかしの下は見本の文字)。タップでプランのシートを開く。
 */
function LockedRafu({ notation, onUnlock }: { notation: string; onUnlock: () => void }) {
  return (
    <button type="button" onClick={onUnlock} className="pressable block w-full text-left">
      <p className="mb-2 text-[14px] font-black tracking-[-0.01em] text-fg-3">{notation}</p>
      <div className="relative flex items-start gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- 小さな立ち絵 */}
        <img
          src={RAFU_SPEAKER.avatarSrc}
          alt={RAFU_SPEAKER.name}
          draggable={false}
          className="h-14 w-auto shrink-0 select-none"
          style={{ aspectRatio: "318 / 420" }}
        />
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-line bg-surface-2 px-3 py-2">
          <span className="mb-0.5 block text-[10px] font-black text-accent">{RAFU_SPEAKER.name}</span>
          <span aria-hidden className="block select-none text-[12px] font-semibold leading-[1.6] text-fg blur-[5px]">
            {LOCKED_SAMPLE}
          </span>
          <span className="absolute inset-0 flex items-center justify-center bg-surface-2/40">
            <span className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-black text-on-accent shadow-glow-sm">
              <Icon name="lock" className="h-3.5 w-3.5" />
              相手プレイヤーの解説はプラチナプランで
            </span>
          </span>
        </div>
      </div>
    </button>
  );
}

