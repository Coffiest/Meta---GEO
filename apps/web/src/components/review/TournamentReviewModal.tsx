"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  fetchTournamentReview,
  type ReviewedDecision,
  type TournamentReview,
  type TournamentReviewHand,
} from "@/lib/reviewApi";
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

/**
 * トーナメント棋譜解析(chess.comのGame Review準拠)をポップアップモーダルで表示。
 *   1. 総括(下部シート): GTOスコア / 総ロスEV / 分類カウント表 / ワースト・ベストのハイライト
 *   2. 「棋譜解析を開始」→ 全画面でトナメ全体を1アクションずつ通し再生
 * 画面遷移ではなくモーダルで開く(確定仕様)。呼び出し側で AnimatePresence によりマウント制御する。
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

/** 相手のアクション表示(薄いテキスト)。 */
function villainActionText(step: Extract<ReplayStep, { type: "action" }>, name: string): string {
  const label = ACTION_KIND_LABEL[step.actionKind] ?? step.actionKind;
  const amount =
    step.actionKind === "bet" || step.actionKind === "raise" || step.actionKind === "call" || step.actionKind === "allIn"
      ? ` ${step.seatAction.toAmount.toLocaleString()}`
      : "";
  return `${name}: ${label}${amount}`;
}

/** heroの意思決定パネル(バッジ + アクション名 + EV損 + GTO推奨チップ)。 */
function DecisionPanel({ d }: { d: ReviewedDecision }) {
  if (d.classification === null) {
    if (d.outOfScopeReason === "solving") {
      return (
        <div className="flex items-center gap-2 text-[12px] font-bold text-ink-500">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-ink-500 border-t-transparent animate-spin" />
          ソルバー解析中… 自動で反映されます
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-bold text-ink-700">あなた: {d.actionName}</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-600">
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
      <div className="flex items-center gap-2 flex-wrap">
        <ClassificationBadge classification={d.classification} showLabel size={24} />
        <span className="text-[13px] font-black text-ink-950">あなた: {d.actionName}</span>
        {d.evLossBb !== null && d.evLossBb > 0.02 && (
          <span className="text-[11px] font-bold text-crimson-500 tabular-nums">EV −{d.evLossBb.toFixed(2)}bb</span>
        )}
      </div>
      {d.gtoActions && d.gtoActions.length > 0 && (
        <div className="mt-2 flex gap-1.5 flex-wrap">
          {d.gtoActions
            .filter((a) => a.frequency > 0)
            .map((a) => (
              <div key={a.bucket} className="rounded-lg px-2 py-1 text-white" style={{ background: bucketColor(a.bucket) }}>
                <span className="text-[11px] font-bold">{bucketLabel(d.street, a.bucket)}</span>
                <span className="text-[11px] font-black tabular-nums ml-1">{Math.round(a.frequency * 100)}%</span>
                <span className="text-[9px] font-bold tabular-nums ml-1 opacity-80">
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
  const [view, setView] = useState<"summary" | "replay">("summary");
  const [stepIndex, setStepIndex] = useState(0);
  const pollTries = useRef(0);

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
    fetchTournamentReview(tournamentId, accessToken)
      .then((res) => {
        if (cancelled) return;
        if (!res) setError("このトーナメントの解析を取得できませんでした。");
        else setData(res);
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
        if (res) setData(res);
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
        className="fixed inset-0 z-[70] bg-white flex flex-col overflow-hidden"
      >
        {/* ヘッダー */}
        <header className="shrink-0 flex items-center gap-2 px-4 pt-4 pb-2">
          <button
            onClick={() => setView("summary")}
            className="h-8 w-8 rounded-full border border-ink-950 bg-white flex items-center justify-center active:scale-95 transition-transform"
            aria-label="総括へ戻る"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4 text-ink-950">
              <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-ink-950">棋譜解析</p>
          <p className="ml-auto text-[11px] font-bold text-ink-500 tabular-nums">
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

        {/* 下部パネル: 区切りカード or 評価 */}
        <div className="shrink-0 px-4 pt-1">
          <div className="rounded-2xl border border-ink-200 bg-white px-3.5 py-2.5 min-h-[72px] flex flex-col justify-center">
            {step.type === "handStart" ? (
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-[13px] font-black text-ink-950">Hand #{step.handNumber}</p>
                  <p className="text-[10px] font-bold text-ink-500 tabular-nums">
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
              <p className="text-[12px] font-bold text-ink-500">
                あなた: {ACTION_KIND_LABEL[step.actionKind] ?? step.actionKind}
                {step.seatAction.toAmount > 0 ? ` ${step.seatAction.toAmount.toLocaleString()}` : ""}
              </p>
            ) : (
              <p className="text-[12px] font-bold text-ink-400">
                {villainActionText(step, playersFromTimeline(currentHand.timeline)[step.actorSeat]?.displayName ?? `Seat ${step.actorSeat + 1}`)}
              </p>
            )}
          </div>
        </div>

        {/* コントロール: ◀︎ ▶︎ + シークバー(? / ?? / !! のピン) */}
        <div className="shrink-0 px-4 pt-2 pb-5">
          <div className="relative h-6 mb-1">
            {/* ピン(タップでジャンプ)。仕様: ? / ?? / !! のみ。 */}
            {total > 1 &&
              replay.pins.map((pin, i) => (
                <button
                  key={i}
                  onClick={() => goTo(pin.stepIndex)}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 active:scale-125 transition-transform"
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
            <button
              onClick={() => goTo(stepIndex - 1)}
              disabled={stepIndex <= 0}
              className="h-11 w-11 shrink-0 rounded-full border border-ink-950 bg-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30"
              aria-label="前のアクション"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-5 w-5 text-ink-950">
                <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, total - 1)}
              value={stepIndex}
              onChange={(e) => goTo(Number(e.target.value))}
              className="flex-1 accent-ink-950"
              aria-label="シークバー"
            />
            <button
              onClick={() => goTo(stepIndex + 1)}
              disabled={stepIndex >= total - 1}
              className="h-11 w-11 shrink-0 rounded-full bg-ink-950 text-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30"
              aria-label="次のアクション"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-5 w-5">
                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ================= 総括ビュー(下部シート) =================
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-2xl border border-ink-950 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+20px)]"
      >
        {/* シートヘッダー */}
        <div className="flex items-center gap-2 mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-ink-950">棋譜解析 — 総括</p>
          <button
            onClick={onClose}
            className="ml-auto h-8 w-8 rounded-full border border-ink-200 bg-white flex items-center justify-center active:scale-95 transition-transform"
            aria-label="閉じる"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4 text-ink-600">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-ink-200 bg-ink-50 p-8 text-sm text-ink-500">
            <span className="h-4 w-4 rounded-full border-2 border-ink-950 border-t-transparent animate-spin" />
            全ハンドを解析中…
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-crimson-500/10 ring-1 ring-crimson-500/30 text-crimson-500 text-sm px-4 py-3">
            {error}
          </div>
        ) : data ? (
          <>

            {/* GTOスコア + 総ロスEV */}
            <div className="rounded-2xl border border-ink-950 bg-white p-4 mb-3">
              <div className="flex items-end justify-between">
                <p className="text-5xl font-black text-ink-950 tabular-nums leading-none">
                  {data.gtoAccuracy !== null ? `${data.gtoAccuracy}%` : "—"}
                  <span className="text-[11px] font-bold text-ink-400 ml-1.5">GTOスコア</span>
                </p>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-ink-400">総ロスEV</p>
                  <p className="text-xl font-black text-crimson-500 tabular-nums leading-tight">
                    −{summary.totalEvLoss.toFixed(1)}bb
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-ink-400 mt-2 tabular-nums">
                解析済み意思決定 {data.classifiedDecisions}/{data.totalDecisions} · 全 {data.hands.length} ハンド
              </p>
              {data.solving && (
                <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-ink-500">
                  <span className="h-3 w-3 rounded-full border-2 border-ink-500 border-t-transparent animate-spin" />
                  ソルバー解析中… 結果は自動で反映されます
                </p>
              )}
            </div>

            {/* 分類カウント表(chess.com風)。発生した評価のみ表示(0件は非表示)。 */}
            {(() => {
              const shown = DISPLAY_CLASSIFICATION_ORDER.map((c) => ({ c, n: displayCount(summary.counts, c) })).filter(
                (x) => x.n > 0
              );
              return (
                <div className="rounded-2xl border border-ink-200 bg-white p-3.5 mb-3">
                  {shown.length > 0 ? (
                    <div className="space-y-1">
                      {shown.map(({ c, n }) => (
                        <div key={c} className="flex items-center gap-2.5 py-0.5">
                          <ClassificationBadge classification={c} size={20} />
                          <span className="text-[12px] font-bold" style={{ color: CLASSIFICATION_META[c].color }}>
                            {CLASSIFICATION_META[c].label}
                          </span>
                          <span className="ml-auto text-[13px] font-black text-ink-950 tabular-nums">{n}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] font-bold text-ink-400 text-center py-2">解析対象のスポットがありませんでした。</p>
                  )}
                </div>
              );
            })()}

            {/* ワースト / ベスト ハイライト(タップで該当アクションへ) */}
            {(summary.worst || summary.best) && (
              <div className="space-y-1.5 mb-4">
                {summary.worst && (
                  <button
                    onClick={() => jumpToDecision(summary.worst!.handId, summary.worst!.d.sequenceNumber)}
                    className="w-full flex items-center gap-3 rounded-xl border border-crimson-500/40 bg-crimson-500/5 px-3 py-2.5 active:bg-crimson-500/10 text-left"
                  >
                    {summary.worst.d.classification && (
                      <ClassificationBadge classification={summary.worst.d.classification} size={24} />
                    )}
                    <div className="min-w-0">
                      <p className="text-[12px] font-black text-ink-950 truncate">
                        ワースト: Hand #{summary.worst.handNumber} · {STREET_LABEL[summary.worst.d.street] ?? summary.worst.d.street} ·{" "}
                        {summary.worst.d.actionName}
                      </p>
                      <p className="text-[10px] font-bold text-crimson-500 tabular-nums">
                        EV −{(summary.worst.d.evLossBb ?? 0).toFixed(2)}bb
                      </p>
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4 text-ink-400 ml-auto shrink-0">
                      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
                {summary.best && (
                  <button
                    onClick={() => jumpToDecision(summary.best!.handId, summary.best!.d.sequenceNumber)}
                    className="w-full flex items-center gap-3 rounded-xl border border-ink-200 bg-white px-3 py-2.5 active:bg-ink-50 text-left"
                  >
                    {summary.best.d.classification && (
                      <ClassificationBadge classification={summary.best.d.classification} size={24} />
                    )}
                    <div className="min-w-0">
                      <p className="text-[12px] font-black text-ink-950 truncate">
                        ベスト: Hand #{summary.best.handNumber} · {STREET_LABEL[summary.best.d.street] ?? summary.best.d.street} ·{" "}
                        {summary.best.d.actionName}
                      </p>
                      <p className="text-[10px] font-bold" style={{ color: CLASSIFICATION_META[summary.best.d.classification ?? "best"].color }}>
                        {CLASSIFICATION_META[summary.best.d.classification ?? "best"].label}
                      </p>
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-4 w-4 text-ink-400 ml-auto shrink-0">
                      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* 棋譜解析を開始 */}
            <button
              onClick={() => {
                setStepIndex(0);
                setView("replay");
              }}
              disabled={steps.length === 0}
              className="w-full rounded-2xl bg-ink-950 text-white py-3.5 text-[14px] font-black tracking-wide active:scale-[0.99] transition-transform disabled:opacity-40"
            >
              棋譜解析を開始
            </button>
            {steps.length === 0 && (
              <p className="text-sm text-ink-400 text-center py-6">再生できるハンドがありません。</p>
            )}
          </>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
