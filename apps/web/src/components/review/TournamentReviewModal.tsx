"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  fetchTournamentReview,
  type ReviewedDecision,
  type ReviewQuotaInfo,
  type TournamentReview,
  type TournamentReviewHand,
} from "@/lib/reviewApi";
import { useSubscriptionStatus } from "@/lib/subscription";
import { ReviewPaywall } from "@/components/review/ReviewPaywall";
import {
  CLASSIFICATION_META,
  DISPLAY_CLASSIFICATION_ORDER,
  displayCount,
  outOfScopeLabel,
  type Classification,
} from "@/lib/classification";
import { ClassificationBadge } from "@/components/review/ClassificationBadge";
import { PokerTable } from "@/components/PokerTable";
import { PlayingCard } from "@/components/PlayingCard";
import { buildTournamentReplay, playersFromTimeline, revealedFromTimeline, type ReplayStep } from "@/lib/replay";
import { PREFLOP_BUCKET_LABELS, POSTFLOP_BUCKET_LABELS } from "@/lib/geoApi";
import { bucketColor } from "@/components/geo/colors";
import { useCountUp } from "@/lib/useCountUp";

/**
 * トーナメント棋譜解析。Appleネイティブ(iOS HIG)風のデザイン言語で構成する:
 *  - 総括: グラバー付きのシート(systemGroupedBackground)+ラージタイトル+白のインセット
 *    グループカード。GTOスコアはリングゲージ+カウントアップで演出。
 *  - 再生: すりガラス(backdrop-blur)のヘッダー/コントロールバー+フローティングの評価カード。
 * アニメーションはスプリング+スタッガー(ease-out系)で統一し、reduced-motion時は簡略化する。
 * 画面遷移ではなくモーダルで開く(確定仕様)。呼び出し側で AnimatePresence によりマウント制御。
 */

const STREET_LABEL: Record<string, string> = { preflop: "プリフロップ", flop: "フロップ", turn: "ターン", river: "リバー" };

function bucketLabel(street: string, bucket: string): string {
  const table = street === "preflop" ? PREFLOP_BUCKET_LABELS : POSTFLOP_BUCKET_LABELS;
  return (table as Record<string, string>)[bucket] ?? bucket;
}

const ACTION_KIND_LABEL: Record<string, string> = {
  fold: "フォールド",
  check: "チェック",
  call: "コール",
  bet: "ベット",
  raise: "レイズ",
  allIn: "オールイン",
};

/** iOSのグループリスト背景(systemGroupedBackground)。 */
const SHEET_BG = "#f2f2f7";
/** iOSのヘアライン分割線。 */
const HAIRLINE = "rgba(60,60,67,0.12)";

/** スタッガー入場(親)。 */
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } };
/** 各セクションのライズイン。 */
const riseIn = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, damping: 26, stiffness: 340 } },
};

/** 相手のアクション表示(薄いテキスト)。 */
function villainActionText(step: Extract<ReplayStep, { type: "action" }>, name: string): string {
  const label = ACTION_KIND_LABEL[step.actionKind] ?? step.actionKind;
  const amount =
    step.actionKind === "bet" || step.actionKind === "raise" || step.actionKind === "call" || step.actionKind === "allIn"
      ? ` ${step.seatAction.toAmount.toLocaleString()}`
      : "";
  return `${name}: ${label}${amount}`;
}

/** GTOスコアのリングゲージ(カウントアップ+ゴールドのアーク)。 */
function ScoreRing({ score }: { score: number | null }) {
  const reduced = useReducedMotion();
  const animated = useCountUp(0, score ?? 0, 1100, 250);
  const shown = score === null ? null : reduced ? score : Math.round(animated);
  const R = 54;
  const C = 2 * Math.PI * R;
  const frac = (score ?? 0) / 100;
  return (
    <div className="relative h-[132px] w-[132px] shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#e5e5ea" strokeWidth="9" />
        {score !== null && (
          <motion.circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="url(#gto-ring-grad)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - frac) }}
            transition={reduced ? { duration: 0 } : { duration: 1.1, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
        <defs>
          <linearGradient id="gto-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f7c548" />
            <stop offset="100%" stopColor="#d4910a" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[36px] font-bold leading-none tracking-tight text-ink-950 tabular-nums">
          {shown === null ? "—" : shown}
        </span>
        <span className="mt-1 text-[11px] font-semibold text-ink-500">GTOスコア</span>
      </div>
    </div>
  );
}

/** heroの意思決定パネル(バッジ + アクション名 + EV損 + GTO推奨チップ)。 */
function DecisionPanel({ d }: { d: ReviewedDecision }) {
  if (d.classification === null) {
    if (d.outOfScopeReason === "solving") {
      return (
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-500">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-ink-500 border-t-transparent animate-spin" />
          ソルバー解析中… 自動で反映されます
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-ink-700">あなた: {d.actionName}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-semibold text-ink-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3 w-3 shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4.5" strokeLinecap="round" />
            <circle cx="12" cy="16" r="0.6" fill="currentColor" stroke="none" />
          </svg>
          解析対象外 · {outOfScopeLabel(d.outOfScopeReason, d.analyzable)}
        </span>
      </div>
    );
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <ClassificationBadge classification={d.classification} showLabel size={24} />
        <span className="text-[14px] font-bold text-ink-950">あなた: {d.actionName}</span>
        {d.evLossBb !== null && d.evLossBb > 0.02 && (
          <span className="rounded-full bg-crimson-500/10 px-2 py-0.5 text-[11px] font-bold text-crimson-500 tabular-nums">
            EV −{d.evLossBb.toFixed(2)}bb
          </span>
        )}
      </div>
      {d.gtoActions && d.gtoActions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {d.gtoActions
            .filter((a) => a.frequency > 0)
            .map((a) => (
              <div key={a.bucket} className="rounded-full px-2.5 py-1 text-white" style={{ background: bucketColor(a.bucket) }}>
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
    </div>
  );
}

/** 総括のハイライト(ワースト/ベスト)1件。タップで再生の該当ステップへジャンプ。 */
interface Highlight {
  kind: "worst" | "best";
  handId: string;
  handNumber: number;
  d: ReviewedDecision;
}

/** iOS風のチェブロン(リスト行の右端)。 */
function Chevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="ml-auto h-4 w-4 shrink-0 text-[#c7c7cc]">
      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TournamentReviewModal({
  tournamentId,
  accessToken,
  onClose,
}: {
  tournamentId: string;
  accessToken: string | undefined;
  onClose: () => void;
}) {
  const [data, setData] = useState<TournamentReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 無料枠超過(402)時のペイウォール情報。
  const [quota, setQuota] = useState<ReviewQuotaInfo | null>(null);
  const [view, setView] = useState<"summary" | "replay">("summary");
  const [stepIndex, setStepIndex] = useState(0);
  const pollTries = useRef(0);

  // サブスク状態(残り無料枠・加入バッジ表示用)。
  const { status: subStatus } = useSubscriptionStatus(accessToken);

  // 初回取得。
  useEffect(() => {
    if (!tournamentId) return;
    if (!accessToken) {
      setLoading(false);
      setError("ログインが必要です。");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setQuota(null);
    fetchTournamentReview(tournamentId, accessToken)
      .then((res) => {
        if (cancelled) return;
        if (res.status === "ok") setData(res.data);
        else if (res.status === "quota") setQuota(res.info);
        else setError("このトーナメントの解析を取得できませんでした。");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tournamentId, accessToken]);

  // ソルバー解析が未完了の間は約5秒間隔でポーリングし、「解析中…」をあとから埋める(最大5分)。
  useEffect(() => {
    if (!data?.solving || !accessToken) return;
    const timer = setInterval(() => {
      pollTries.current += 1;
      if (pollTries.current > 60) {
        clearInterval(timer);
        return;
      }
      fetchTournamentReview(tournamentId, accessToken).then((res) => {
        if (res.status === "ok") setData(res.data);
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [data?.solving, accessToken, tournamentId]);

  const heroUserId = data?.hands[0]?.heroUserId ?? "";
  const replay = useMemo(
    () => (data && heroUserId ? buildTournamentReplay(data.hands, heroUserId) : null),
    [data, heroUserId]
  );
  const handById = useMemo(() => {
    const m = new Map<string, TournamentReviewHand>();
    for (const h of data?.hands ?? []) m.set(h.handId, h);
    return m;
  }, [data]);

  // 総括: 分類カウント / 総ロスEV / ワースト・ベスト。
  const summary = useMemo(() => {
    const counts: Record<Classification, number> = {
      artistic: 0,
      best: 0,
      great: 0,
      excellent: 0,
      good: 0,
      book: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
    };
    let totalEvLoss = 0;
    let worst: Highlight | null = null;
    let best: Highlight | null = null;
    const bestPriority: Record<string, number> = { artistic: 0, great: 1, best: 2 };
    for (const h of data?.hands ?? []) {
      for (const d of h.decisions) {
        if (!d.classification) continue;
        counts[d.classification] += 1;
        if (d.evLossBb !== null) {
          totalEvLoss += d.evLossBb;
          if (d.evLossBb > 0.02 && (!worst || d.evLossBb > (worst.d.evLossBb ?? 0))) {
            worst = { kind: "worst", handId: h.handId, handNumber: h.handNumber, d };
          }
        }
        const p = bestPriority[d.classification];
        if (p !== undefined) {
          const cur = best ? bestPriority[best.d.classification ?? ""] ?? 9 : 9;
          if (p < cur) best = { kind: "best", handId: h.handId, handNumber: h.handNumber, d };
        }
      }
    }
    return { counts, totalEvLoss, worst, best };
  }, [data]);

  const steps = replay?.steps ?? [];
  const step: ReplayStep | null = steps[stepIndex] ?? null;
  const currentHand = step ? handById.get(step.handId) ?? null : null;
  const heroSeatIndex = currentHand?.timeline.seats.find((s) => s.userId === heroUserId)?.seatIndex ?? null;
  const heroCards = currentHand?.timeline.seats.find((s) => s.userId === heroUserId)?.holeCards ?? [];

  const goTo = useCallback(
    (idx: number) => setStepIndex(Math.max(0, Math.min(steps.length - 1, idx))),
    [steps.length]
  );
  const jumpToDecision = useCallback(
    (handId: string, sequenceNumber: number) => {
      const idx = replay?.stepIndexByDecision[`${handId}:${sequenceNumber}`];
      if (idx !== undefined) {
        setStepIndex(idx);
        setView("replay");
      }
    },
    [replay]
  );

  // 再生中はキーボードの←→でも操作できる。
  useEffect(() => {
    if (view !== "replay") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goTo(stepIndex - 1);
      if (e.key === "ArrowRight") goTo(stepIndex + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, stepIndex, goTo]);

  // ================= 再生ビュー(全画面) =================
  if (view === "replay" && data && replay && step && currentHand) {
    const total = steps.length;
    const seatCount = Math.max(6, currentHand.timeline.seats.length);
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex flex-col overflow-hidden"
        style={{ background: SHEET_BG }}
      >
        {/* すりガラスのナビゲーションバー */}
        <header
          className="shrink-0 flex items-center gap-2.5 px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-2.5 bg-white/70 backdrop-blur-xl"
          style={{ borderBottom: `0.5px solid ${HAIRLINE}` }}
        >
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setView("summary")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.05] text-ink-950"
            aria-label="総括へ戻る"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-4 w-4">
              <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>
          <p className="text-[16px] font-bold tracking-tight text-ink-950">棋譜解析</p>
          <p className="ml-auto rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-semibold text-ink-500 tabular-nums">
            Hand #{step.handNumber} · {stepIndex + 1}/{total}
          </p>
        </header>

        {/* テーブル(通し再生) */}
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

        {/* 下部: フローティングの評価カード(ステップごとにフェードライズ) */}
        <div className="shrink-0 px-4 pt-1">
          <motion.div
            key={stepIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 460 }}
            className="min-h-[76px] rounded-[20px] bg-white px-4 py-3 flex flex-col justify-center shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]"
            style={{ border: `0.5px solid ${HAIRLINE}` }}
          >
            {step.type === "handStart" ? (
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-[15px] font-bold tracking-tight text-ink-950">Hand #{step.handNumber}</p>
                  <p className="text-[11px] font-medium text-ink-500 tabular-nums">
                    ブラインド {step.smallBlind.toLocaleString()}/{step.bigBlind.toLocaleString()}
                    {step.ante > 0 ? ` (アンテ ${step.ante.toLocaleString()})` : ""}
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
            ) : step.actorIsHero && step.decision ? (
              <DecisionPanel d={step.decision} />
            ) : step.actorIsHero ? (
              <p className="text-[13px] font-semibold text-ink-500">
                あなた: {ACTION_KIND_LABEL[step.actionKind] ?? step.actionKind}
                {step.seatAction.toAmount > 0 ? ` ${step.seatAction.toAmount.toLocaleString()}` : ""}
              </p>
            ) : (
              <p className="text-[13px] font-medium text-ink-400">
                {villainActionText(step, playersFromTimeline(currentHand.timeline)[step.actorSeat]?.displayName ?? `Seat ${step.actorSeat + 1}`)}
              </p>
            )}
          </motion.div>
        </div>

        {/* コントロール: すりガラスのバー(◀︎ ▶︎ + シークバー + 分類ピン) */}
        <div className="shrink-0 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <div
            className="rounded-[22px] bg-white/70 backdrop-blur-xl px-3.5 pb-3 pt-1.5"
            style={{ border: `0.5px solid ${HAIRLINE}` }}
          >
            <div className="relative mx-12 h-6">
              {/* ピン(タップでジャンプ)。仕様: ? / ?? / !! のみ。 */}
              {total > 1 &&
                replay.pins.map((pin, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(pin.stepIndex)}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform active:scale-125"
                    style={{ left: `${(pin.stepIndex / (total - 1)) * 100}%` }}
                    aria-label={CLASSIFICATION_META[pin.classification as Classification]?.label ?? pin.classification}
                  >
                    <svg width={14} height={14} viewBox="0 0 14 14">
                      <circle
                        cx="7"
                        cy="7"
                        r="5.5"
                        fill={CLASSIFICATION_META[pin.classification as Classification]?.color ?? "#999"}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </button>
                ))}
            </div>
            <div className="flex items-center gap-3">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => goTo(stepIndex - 1)}
                disabled={stepIndex <= 0}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-ink-950 disabled:opacity-30"
                aria-label="前のアクション"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-5 w-5">
                  <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.button>
              <input
                type="range"
                min={0}
                max={Math.max(0, total - 1)}
                value={stepIndex}
                onChange={(e) => goTo(Number(e.target.value))}
                className="flex-1 accent-ink-950"
                aria-label="シークバー"
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => goTo(stepIndex + 1)}
                disabled={stepIndex >= total - 1}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-950 text-white shadow-[0_6px_16px_-6px_rgba(10,10,10,0.5)] disabled:opacity-30"
                aria-label="次のアクション"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-5 w-5">
                  <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // ================= 総括ビュー(iOSシート) =================
  const shownClasses = DISPLAY_CLASSIFICATION_ORDER.map((c) => ({ c, n: displayCount(summary.counts, c) })).filter(
    (x) => x.n > 0
  );
  const maxClassCount = Math.max(1, ...shownClasses.map((x) => x.n));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.3)]"
        style={{ background: SHEET_BG }}
      >
        {/* グラバー */}
        <div className="sticky top-0 z-10 -mx-4 px-4 pt-2.5 pb-1" style={{ background: SHEET_BG }}>
          <div className="mx-auto h-[5px] w-9 rounded-full bg-black/20" />
        </div>

        {/* ラージタイトル行 */}
        <div className="mt-2 mb-4 flex items-start gap-2">
          <div className="min-w-0">
            <h2 className="text-[28px] font-bold leading-tight tracking-tight text-ink-950">棋譜解析</h2>
            <div className="mt-1 flex items-center gap-1.5">
              <p className="text-[13px] font-medium text-ink-500">総括レポート</p>
              {subStatus?.active ? (
                <span className="rounded-full bg-gold-500 px-2 py-[2px] text-[10px] font-bold text-white">使い放題</span>
              ) : subStatus && !quota ? (
                <span className="rounded-full bg-black/[0.05] px-2 py-[2px] text-[10px] font-semibold text-ink-500 tabular-nums">
                  残り無料 {subStatus.reviewsRemaining}回
                </span>
              ) : null}
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="ml-auto mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-ink-600"
            aria-label="閉じる"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} className="h-3.5 w-3.5">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </motion.button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2.5 rounded-[20px] bg-white p-10 text-[14px] font-medium text-ink-500 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <span className="h-4 w-4 rounded-full border-2 border-ink-950 border-t-transparent animate-spin" />
            全ハンドを解析中…
          </div>
        ) : error ? (
          <div className="rounded-[20px] bg-crimson-500/10 px-4 py-3.5 text-[14px] font-medium text-crimson-500">{error}</div>
        ) : quota ? (
          <ReviewPaywall tournamentId={tournamentId} accessToken={accessToken} nextFreeAt={quota.nextFreeAt} />
        ) : data ? (
          <motion.div variants={stagger} initial="hidden" animate="show">
            {/* ヒーローカード: リングゲージ + メトリクス */}
            <motion.div
              variants={riseIn}
              className="mb-3 rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center gap-5">
                <ScoreRing score={data.gtoAccuracy} />
                <div className="min-w-0 flex-1">
                  <div className="pb-3" style={{ borderBottom: `0.5px solid ${HAIRLINE}` }}>
                    <p className="text-[11px] font-semibold text-ink-500">総ロスEV</p>
                    <p className="text-[24px] font-bold leading-tight tracking-tight text-crimson-500 tabular-nums">
                      −{summary.totalEvLoss.toFixed(1)}
                      <span className="ml-0.5 text-[13px] font-semibold">bb</span>
                    </p>
                  </div>
                  <div className="pt-3">
                    <p className="text-[11px] font-semibold text-ink-500">解析済み</p>
                    <p className="text-[17px] font-bold leading-tight text-ink-950 tabular-nums">
                      {data.classifiedDecisions}
                      <span className="text-ink-400">/{data.totalDecisions}</span>
                      <span className="ml-1.5 text-[12px] font-semibold text-ink-400">全{data.hands.length}ハンド</span>
                    </p>
                  </div>
                </div>
              </div>
              {data.solving && (
                <p className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-ink-500">
                  <span className="h-3 w-3 rounded-full border-2 border-ink-500 border-t-transparent animate-spin" />
                  ソルバー解析中… 結果は自動で反映されます
                </p>
              )}
            </motion.div>

            {/* 分類リスト(iOSインセットグループ+比率バー)。発生した評価のみ表示。 */}
            <motion.div variants={riseIn} className="mb-3 overflow-hidden rounded-[24px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              {shownClasses.length > 0 ? (
                shownClasses.map(({ c, n }, i) => (
                  <div
                    key={c}
                    className="flex items-center gap-3 px-4 py-3"
                    style={i > 0 ? { borderTop: `0.5px solid ${HAIRLINE}` } : undefined}
                  >
                    <ClassificationBadge classification={c} size={22} />
                    <span className="w-[74px] shrink-0 text-[13px] font-semibold" style={{ color: CLASSIFICATION_META[c].color }}>
                      {CLASSIFICATION_META[c].label}
                    </span>
                    <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-black/[0.05]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: CLASSIFICATION_META[c].color, originX: 0 }}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: n / maxClassCount }}
                        transition={{ duration: 0.7, delay: 0.35 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                    <span className="w-7 shrink-0 text-right text-[15px] font-bold text-ink-950 tabular-nums">{n}</span>
                  </div>
                ))
              ) : (
                <p className="px-4 py-5 text-center text-[13px] font-medium text-ink-400">解析対象のスポットがありませんでした。</p>
              )}
            </motion.div>

            {/* ワースト / ベスト ハイライト */}
            {(summary.worst || summary.best) && (
              <motion.div variants={riseIn} className="mb-4 overflow-hidden rounded-[24px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                {summary.worst && (
                  <button
                    onClick={() => jumpToDecision(summary.worst!.handId, summary.worst!.d.sequenceNumber)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-black/[0.03]"
                  >
                    {summary.worst.d.classification && (
                      <ClassificationBadge classification={summary.worst.d.classification} size={26} />
                    )}
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-crimson-500">ワースト</p>
                      <p className="truncate text-[14px] font-semibold text-ink-950">
                        Hand #{summary.worst.handNumber} · {STREET_LABEL[summary.worst.d.street] ?? summary.worst.d.street} ·{" "}
                        {summary.worst.d.actionName}
                        <span className="ml-1.5 text-[12px] font-bold text-crimson-500 tabular-nums">
                          −{(summary.worst.d.evLossBb ?? 0).toFixed(2)}bb
                        </span>
                      </p>
                    </div>
                    <Chevron />
                  </button>
                )}
                {summary.best && (
                  <button
                    onClick={() => jumpToDecision(summary.best!.handId, summary.best!.d.sequenceNumber)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-black/[0.03]"
                    style={summary.worst ? { borderTop: `0.5px solid ${HAIRLINE}` } : undefined}
                  >
                    {summary.best.d.classification && (
                      <ClassificationBadge classification={summary.best.d.classification} size={26} />
                    )}
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold" style={{ color: CLASSIFICATION_META[summary.best.d.classification ?? "best"].color }}>
                        ベスト · {CLASSIFICATION_META[summary.best.d.classification ?? "best"].label}
                      </p>
                      <p className="truncate text-[14px] font-semibold text-ink-950">
                        Hand #{summary.best.handNumber} · {STREET_LABEL[summary.best.d.street] ?? summary.best.d.street} ·{" "}
                        {summary.best.d.actionName}
                      </p>
                    </div>
                    <Chevron />
                  </button>
                )}
              </motion.div>
            )}

            {/* 棋譜解析を開始(iOS Filled Button) */}
            <motion.div variants={riseIn}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setStepIndex(0);
                  setView("replay");
                }}
                disabled={steps.length === 0}
                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] bg-ink-950 text-[17px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(10,10,10,0.5)] disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
                  <path d="M8.5 5.9c0-1.5 1.6-2.4 2.9-1.7l9.2 5.4c1.3.7 1.3 2.6 0 3.4l-9.2 5.4c-1.3.7-2.9-.2-2.9-1.7V5.9Z" />
                </svg>
                棋譜解析を開始
              </motion.button>
              {steps.length === 0 && (
                <p className="py-5 text-center text-[13px] font-medium text-ink-400">再生できるハンドがありません。</p>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
