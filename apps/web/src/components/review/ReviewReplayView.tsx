"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SPRING_MOVE } from "@/lib/motion";
import type { ReviewedDecision, ReviewHandTimeline, TournamentReviewHand } from "@/lib/reviewApi";
import { CLASSIFICATION_META, type Classification } from "@/lib/classification";
import { ClassificationBadge } from "@/components/review/ClassificationBadge";
import { DecisionHeadline } from "@/components/review/DecisionHeadline";
import { actionLabel, decisionInfo, STREET_EN } from "@/lib/actionNotation";
import type { KnowledgeContext } from "@/lib/reviewKnowledge";
import { PokerTable } from "@/components/PokerTable";
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
      <DecisionHeadline decision={d} notation={notation} info={info} context={context} />
      {d.gtoActions && d.gtoActions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {d.gtoActions
            .filter((a) => a.frequency > 0)
            .map((a) => (
              <div key={a.bucket} className="rounded-full px-2.5 py-1" style={{ background: bucketColor(a.bucket), color: bucketTextColor(bucketColor(a.bucket)) }}>
                <span className="text-[11px] font-bold">{bucketLabel(d.street, a.bucket)}</span>
                <span className="ml-1 text-[11px] font-black tabular-nums">{Math.round(a.frequency * 100)}%</span>
                <span className="ml-1 text-[9px] font-bold tabular-nums opacity-80">
                  EV{a.evBb >= 0 ? "+" : ""}
                  {a.evBb.toFixed(1)}
                </span>
              </div>
            ))}
        </div>
      )}
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
}: {
  steps: ReplayStep[];
  stepIndex: number;
  handId: string;
  timeline: ReviewHandTimeline;
  goTo: (idx: number) => void;
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
        const c = s.actorIsHero ? (s.decision?.classification ?? null) : null;
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
  // 解説の引き当てに使う文脈。ハンドが切り替わるたびに作り直す。
  const knowledgeContext = useMemo<KnowledgeContext | undefined>(
    () =>
      currentHand
        ? {
            board: currentHand.timeline.board,
            heroHoleCards: heroCards,
            actions: currentHand.timeline.actions,
            buttonFixedPos: currentHand.timeline.buttonFixedPos,
            seatCount: currentHand.timeline.seats.length,
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

      {/* 上: 評価カード(chess.com と同じく、解説は画面の上) */}
      <div className="shrink-0 px-3 pt-2">
        <motion.div
          key={stepIndex}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_MOVE}
          className="max-h-[42vh] overflow-y-auto rounded-[20px] bg-surface px-3.5 py-3 shadow-e2"
          style={{ border: `0.5px solid ${HAIRLINE}` }}
        >
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
          ) : (
            // 評価の付かない手(相手の手・自分の定型の手)は表記だけ。相手の手札は分からない
            // 前提なので、相手のアクションには評価を付けない(オーナー確定)。
            <p className={`text-[14px] font-black tracking-[-0.01em] ${step.actorIsHero ? "text-fg" : "text-fg-3"}`}>
              {stepNotation(step, currentHand.timeline)}
            </p>
          )}
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
