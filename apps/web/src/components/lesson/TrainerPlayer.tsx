"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import type { PublicHandState } from "@meta-geo/engine/src/handEngine.js";
import { Icon } from "@/components/Icon";
import { PokerTable } from "@/components/PokerTable";
import { ACTION_EN, ActionButton } from "@/components/ActionBar";
import { ClassificationBadge } from "@/components/review/ClassificationBadge";
import { bucketColor, bucketTextColor } from "@/components/geo/colors";
import { HAIRLINE, SHEET_BG } from "@/components/review/ReviewReplayView";
import { CLASSIFICATION_META, type Classification } from "@/lib/classification";
import { FADE, SPRING_MOVE } from "@/lib/motion";
import type { SeatAction, SeatPlayerInfo } from "@/lib/socket";
import {
  TRAINER_POSITIONS,
  actionLabel,
  aggression,
  applyAction,
  dealHand,
  gradeDecision,
  handIndex,
  handName,
  potOf,
  sampleAction,
  type DecisionResult,
  type TrainerData,
  type TrainerGrade,
  type TrainerHand,
  type TrainerNode,
  type TrainerStack,
} from "@/lib/trainer";
import type { TrainerSettings } from "./TrainerTab";
import { clearTrainerSession, loadTrainerSession, saveTrainerSession } from "./trainerSession";

const CHIP = 100; // 1bb = 100 点(卓の表示用)
const GRADE_TO_CLASS: Record<TrainerGrade, Classification> = {
  best: "best",
  correct: "excellent",
  inaccuracy: "inaccuracy",
  wrong: "mistake",
  blunder: "blunder",
};
const DELAY = { normal: { act: 700, end: 1400 }, fast: { act: 350, end: 800 }, turbo: { act: 120, end: 450 } };
const NAMES = ["ミナト", "ソラ", "ハル", "リク", "ユイ", "カイ", "ナギ"];
const AVATARS = ["animal:cat", "animal:shark", "animal:penguin", "animal:lion", "animal:parrot", "animal:cat", "animal:shark"];

const dataCache = new Map<number, Promise<TrainerData | null>>();
function loadData(stack: number): Promise<TrainerData | null> {
  let p = dataCache.get(stack);
  if (!p) {
    p = fetch(`/trainer/${stack}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<TrainerData>) : null))
      .catch(() => null);
    dataCache.set(stack, p);
  }
  return p;
}

type Decision = DecisionResult & { node: TrainerNode; hand: number; code: string; stack: number };

/** 卓に出す状態(席番号 = UTG を 0 とした位置)。 */
function tableState(h: TrainerHand): PublicHandState {
  const top = Math.max(...h.seats.map((s) => s.bet));
  return {
    street: "preflop",
    board: [],
    potTotal: Math.round(potOf(h) * CHIP),
    currentBetToMatch: Math.round(top * CHIP),
    lastFullRaiseSize: CHIP,
    actingSeatIndex: h.toAct,
    buttonFixedPos: 5,
    smallBlindSeat: 6,
    bigBlindSeat: 7,
    collectedPot: Math.round(h.pot * CHIP),
    pots: [],
    seats: h.seats.map((s, i) => ({
      seatIndex: i,
      playerId: `t${i}`,
      stack: Math.round(s.stack * CHIP),
      status: s.folded ? ("folded" as const) : s.stack <= 0 ? ("allIn" as const) : ("active" as const),
      streetContribution: Math.round(s.bet * CHIP),
      handContribution: Math.round(s.bet * CHIP),
      hasActedThisStreet: false,
    })),
    isComplete: h.done,
    bigBlind: CHIP,
  } as PublicHandState;
}

function seatAction(code: string, bet: number, allIn: boolean): SeatAction {
  if (code === "F") return { kind: "fold", toAmount: 0 };
  if (code === "C") return { kind: allIn ? "allIn" : "call", toAmount: Math.round(bet * CHIP) };
  if (code === "X") return { kind: "check", toAmount: 0 };
  return { kind: allIn ? "allIn" : "raise", toAmount: Math.round(bet * CHIP) };
}

const topBet = (h: TrainerHand) => Math.max(...h.seats.map((s) => s.bet));
const fmtBb = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(v * 10 === Math.round(v * 10) ? 1 : 2));

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

export function TrainerPlayer({ settings, onClose }: { settings: TrainerSettings; onClose: () => void }) {
  const [data, setData] = useState<Record<number, TrainerData | null> | null>(null);
  // アプリを閉じて戻っても続きから(iOS は裏に回ると画面を作り直すことがあり、特訓が終わっていた。オーナー指摘)。
  const [saved] = useState(() => loadTrainerSession());
  const [hand, setHand] = useState<TrainerHand | null>(() => (saved?.hand as TrainerHand | null) ?? null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [base] = useState(() => ({ n: saved?.n ?? 0, scoreSum: saved?.scoreSum ?? 0, evLoss: saved?.evLoss ?? 0 }));
  const [handsPlayed, setHandsPlayed] = useState(saved?.handsPlayed ?? 0);
  /** 自分が打つ直前のハンド(「もう一度」で戻す)。 */
  const beforeActRef = useRef<TrainerHand | null>(null);
  const [paused, setPaused] = useState<Decision | null>(null);
  const [rng, setRng] = useState<number | null>(null);
  const heroDecidedRef = useRef(false);
  const delay = DELAY[settings.speed];

  useEffect(() => {
    void Promise.all(settings.stacks.map((s) => loadData(s).then((d) => [s, d] as const))).then((list) =>
      setData(Object.fromEntries(list)),
    );
  }, [settings.stacks]);

  const usableStacks = useMemo(
    () => (data ? settings.stacks.filter((s) => data[s] && Object.keys(data[s]!.nodes).length > 0) : []),
    [data, settings.stacks],
  );

  const nodeOf = useCallback((h: TrainerHand): TrainerNode | null => data?.[h.stack]?.nodes[h.pa] ?? null, [data]);

  const newHand = useCallback(() => {
    if (!usableStacks.length) return;
    // 自分に判断が回ってくるハンドになるまで配り直す(データの無い場面は飛ばす)。
    for (let tries = 0; tries < 50; tries++) {
      const stack = pick(usableStacks) as TrainerStack;
      const heroPos = pick(settings.positions);
      const h = dealHand(stack, heroPos);
      heroDecidedRef.current = false;
      setPaused(null);
      setHand(h);
      return;
    }
  }, [usableStacks, settings.positions]);

  useEffect(() => {
    if (usableStacks.length && !hand) newHand();
  }, [usableStacks, hand, newHand]);

  const heroIdx = hand ? TRAINER_POSITIONS.indexOf(hand.heroPos) : 0;

  // 相手の手番は自動で進める。終わったら次のハンド。
  useEffect(() => {
    if (!hand || paused) return;
    if (hand.done) {
      const t = setTimeout(() => {
        if (heroDecidedRef.current) setHandsPlayed((n) => n + 1);
        newHand();
      }, heroDecidedRef.current ? delay.end : 0);
      return () => clearTimeout(t);
    }
    const node = nodeOf(hand);
    if (hand.toAct === heroIdx) {
      if (!node) {
        // この場面のデータはまだ無い。数えずに次のハンドへ。
        const t = setTimeout(newHand, heroDecidedRef.current ? delay.end : 0);
        return () => clearTimeout(t);
      }
      setRng(settings.rng === "off" ? null : 1 + Math.floor(Math.random() * 100));
      return;
    }
    const seat = hand.seats[hand.toAct!]!;
    const idx = handIndex(seat.cards[0], seat.cards[1]);
    let code = "F";
    if (node) {
      if (settings.villain === "top") {
        code = node.a.reduce((b, x) => ((x.s[idx] ?? 0) > (b.s[idx] ?? 0) ? x : b)).c;
      } else code = sampleAction(node, idx);
    } else if (seat.bet >= Math.max(...hand.seats.map((s) => s.bet))) code = "C";
    const t = setTimeout(() => setHand(applyAction(hand, code)), heroDecidedRef.current ? delay.act : 0);
    return () => clearTimeout(t);
  }, [hand, paused, heroIdx, nodeOf, newHand, delay, settings.villain, settings.rng]);

  const finished = handsPlayed >= settings.hands;
  const heroTurn = !!hand && !hand.done && hand.toAct === heroIdx && !paused && !finished;
  const heroNode = heroTurn ? nodeOf(hand!) : null;
  const heroSeat = hand ? hand.seats[heroIdx]! : null;
  const heroHand = heroSeat ? handIndex(heroSeat.cards[0], heroSeat.cards[1]) : 0;

  const act = (code: string) => {
    if (!hand || !heroNode) return;
    beforeActRef.current = hand;
    const r = gradeDecision(heroNode, heroHand, code);
    const d: Decision = { ...r, node: heroNode, hand: heroHand, code, stack: hand.stack };
    setDecisions((list) => [...list, d]);
    heroDecidedRef.current = true;
    if (settings.pause === "always" || (settings.pause === "mistake" && r.grade !== "best" && r.grade !== "correct")) setPaused(d);
    setHand(applyAction(hand, code));
  };

  const n = base.n + decisions.length;
  const scoreSum = base.scoreSum + decisions.reduce((a, d) => a + d.score, 0);
  const score = n ? (scoreSum / n) * 100 : null;
  const evLoss = base.evLoss + decisions.reduce((a, d) => a + d.evLoss, 0);

  // 進み具合を端末に残す(終わったら消す)。
  useEffect(() => {
    if (finished) clearTrainerSession();
    else saveTrainerSession({ settings, hand, handsPlayed, n, scoreSum, evLoss });
  }, [finished, settings, hand, handsPlayed, n, scoreSum, evLoss]);

  const close = () => {
    clearTrainerSession();
    onClose();
  };

  /** 「もう一度」: 同じ手・同じ場面で打ち直す。さっきの判断は成績から外す。 */
  const retry = () => {
    const h = beforeActRef.current;
    if (!h) return setPaused(null);
    setDecisions((list) => list.slice(0, -1));
    heroDecidedRef.current = false;
    setPaused(null);
    setHand(h);
  };
  const last = decisions[decisions.length - 1] ?? null;

  const players: Record<number, SeatPlayerInfo> = {};
  const lastAction: Record<number, SeatAction> = {};
  if (hand) {
    let k = 0;
    hand.seats.forEach((s, i) => {
      players[i] =
        i === heroIdx
          ? { userId: "trainer-you", displayName: "あなた", avatarKey: null, away: false, frame: null }
          : { userId: `trainer-${i}`, displayName: NAMES[k]!, avatarKey: AVATARS[k++]!, away: false, frame: null };
      if (s.lastCode) lastAction[i] = seatAction(s.lastCode, s.bet, s.stack <= 0);
    });
  }

  const sortedActions = heroNode ? [...heroNode.a].sort((a, b) => aggression(a.c) - aggression(b.c)) : [];

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[80] flex flex-col overflow-hidden"
      style={{ background: SHEET_BG }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={FADE}
    >
      {/* 上: 閉じる・スタック・成績を1行にまとめる(卓を広く取るため) */}
      <header className="glass-header flex shrink-0 items-center gap-2 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+8px)]">
        <motion.button
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={close}
          aria-label="閉じる"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-fg"
        >
          <Icon name="close" className="h-4 w-4" />
        </motion.button>
        <p className="shrink-0 text-[14px] font-bold tracking-tight text-fg">{hand ? `${hand.stack}bb` : "特訓"}</p>
        <div className="ml-auto flex min-w-0 items-center gap-3 text-[11px] tabular-nums text-fg-2">
          <span>
            GTOスコア <b className="text-[13px] text-fg">{score === null ? "--" : `${score.toFixed(1)}%`}</b>
          </span>
          <span>
            EVロス <b className="text-[13px] text-fg">{evLoss.toFixed(2)}bb</b>
          </span>
          <span className="rounded-full bg-white/[0.05] px-2 py-0.5 font-semibold">
            {Math.min(handsPlayed + (finished ? 0 : 1), settings.hands)}/{settings.hands}
          </span>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col justify-center overflow-hidden px-2">
        {!data ? (
          <p className="text-center text-[13px] text-fg-2">読み込み中…</p>
        ) : !usableStacks.length ? (
          <p className="px-6 text-center text-[13px] leading-relaxed text-fg-2">選んだスタックのデータはまだ準備中。</p>
        ) : hand ? (
          <PokerTable
            state={tableState(hand)}
            yourSeatIndex={heroIdx}
            yourCards={heroSeat ? [...heroSeat.cards] : []}
            seatCount={8}
            revealedHoleCards={null}
            players={players}
            bigBlind={CHIP}
            lastActionBySeat={lastAction}
            lastHandDeltaBySeat={null}
            turnTimer={null}
          />
        ) : null}
        {/* 直前の判断。卓の上に小さく重ねる(場所を取らない) */}
        {last && !paused && (
          // 中央寄せは外側の箱で行う(motion の y が transform を上書きし、-translate-x が効かず右へはみ出していた)。
          <div className="pointer-events-none absolute inset-x-2 top-1.5 z-20 flex justify-center">
          <motion.div
            key={decisions.length}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING_MOVE}
            className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-surface px-2.5 py-1"
            style={{ border: `0.5px solid ${HAIRLINE}` }}
          >
            <ClassificationBadge classification={GRADE_TO_CLASS[last.grade]} size={16} />
            <span className="shrink-0 text-[12px] font-black text-fg">{CLASSIFICATION_META[GRADE_TO_CLASS[last.grade]].label}</span>
            <span className="truncate text-[11px] text-fg-2">
              {handName(last.hand)} ・ {actionLabel(last.code, last.stack)}(頻度 {(last.freq * 100).toFixed(0)}%)・ -{last.evLoss.toFixed(2)}bb
            </span>
          </motion.div>
          </div>
        )}
        {paused && <PausePanel d={paused} onNext={() => setPaused(null)} onRetry={retry} />}
        {finished && (
          <div className="absolute inset-0 z-30 flex items-center px-4">
            <div className="glass-panel w-full rounded-3xl p-5 text-center">
              <p className="text-[18px] font-black text-fg">おつかれさま</p>
              <p className="mt-2 text-[13px] text-fg-2">
                {settings.hands}ハンド ・ GTOスコア {score === null ? "--" : `${score.toFixed(1)}%`} ・ EVロス {evLoss.toFixed(2)}bb
              </p>
              <button
                type="button"
                onClick={close}
                className="pressable-lg mt-4 h-12 w-full rounded-2xl bg-accent text-[15px] font-black text-on-accent shadow-glow"
              >
                もどる
              </button>
            </div>
          </div>
        )}
      </main>

      {/* 下: いつものアクションバーと同じボタン。高さは一定(手番でなくても同じ)にして卓が跳ねないようにする。 */}
      <div className="shrink-0 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-1">
        <div className="relative mx-auto flex h-[104px] max-w-md flex-col justify-end gap-1.5">
          {heroTurn && heroNode && (
            <>
              {/* 乱数: 大きく、ボタンのすぐ上の決まった場所に出す(混合戦略の頻度をこの数で決める)。 */}
              {rng !== null && (
                <div className="flex items-center justify-center">
                  <span className="flex items-baseline gap-2 rounded-full bg-surface-2 px-4 py-0.5" style={{ border: `0.5px solid ${HAIRLINE}` }}>
                    <span className="text-[11px] font-bold tracking-[0.12em] text-fg-3">乱数</span>
                    <span className="w-[2.2ch] text-center text-[24px] font-black leading-tight tabular-nums text-accent">{rng}</span>
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                {sortedActions.map((x) => {
                  const tone = x.c === "F" ? "fold" : x.c === "C" || x.c === "X" ? "call" : "raise";
                  const amt = x.c === "RAI" ? hand!.stack : x.c.startsWith("R") ? Number(x.c.slice(1)) : x.c === "C" ? topBet(hand!) : 0;
                  const name =
                    x.c === "F" ? ACTION_EN.fold : x.c === "X" ? ACTION_EN.check : x.c === "C" ? ACTION_EN.call : x.c === "RAI" ? ACTION_EN.allIn : ACTION_EN.raise;
                  return (
                    <ActionButton key={x.c} tone={tone} ariaLabel={actionLabel(x.c, hand!.stack)} onClick={() => act(x.c)}>
                      {amt > 0 ? (
                        <>
                          <span className="text-[9px] font-bold tracking-[0.16em] opacity-80">{name}</span>
                          <span className="mt-0.5 text-[16px] font-black tabular-nums tracking-[-0.01em]">{fmtBb(amt)}bb</span>
                        </>
                      ) : (
                        <span className="text-[15px] font-black tracking-[0.08em]">{name}</span>
                      )}
                    </ActionButton>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}

/** 行動の色(GEO データベースの帯と同じ4色)。オールインは帯の中で見分けられるよう、とても大きいベットの濃い赤。 */
function trainerActionColor(code: string): string {
  if (code === "F") return bucketColor("fold");
  if (code === "C" || code === "X") return bucketColor("call");
  if (code === "RAI") return bucketColor("bet100+");
  return bucketColor("raise2-5");
}

/**
 * 止めたとき: その手の、行動ごとの頻度と期待値(GTO Wizard の Actions の板と同じ作り)。
 * 面も背景も不透明(オーナー指示: 透けると読みにくい)。「もう一度」で同じ場面を打ち直し、「GTOを見る」でこの場面の表を開く。
 */
function PausePanel({ d, onNext, onRetry }: { d: Decision; onNext: () => void; onRetry: () => void }) {
  const [showRange, setShowRange] = useState(false);
  const rows = [...d.node.a].sort((a, b) => aggression(b.c) - aggression(a.c));
  const freq = (c: string) => d.node.a.find((x) => x.c === c)?.s[d.hand] ?? 0;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-canvas px-3">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={SPRING_MOVE}
        className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[#1b1b1d] shadow-e4"
      >
        <div className="flex shrink-0 items-center gap-2 bg-[#252528] px-3 py-2.5">
          <ClassificationBadge classification={GRADE_TO_CLASS[d.grade]} size={22} showLabel />
          <span className="ml-auto text-[13px] font-bold text-[#9a9a9a]">{d.stack}bb</span>
          <span className="text-[17px] font-black tabular-nums text-[#e6e6e6]">{handName(d.hand)}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {/* 行動の板(色の板。左上に行動、左下に頻度、右下に期待値)。自分の選んだ行動は白い枠。 */}
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
            {rows.map((x) => {
              const color = trainerActionColor(x.c);
              const mine = x.c === d.code;
              return (
                <div
                  key={x.c}
                  className={`flex h-[92px] min-w-0 flex-col justify-between rounded-lg p-2 ${mine ? "ring-2 ring-inset ring-[#e6e6e6]" : ""}`}
                  style={{ background: color, color: bucketTextColor(color) }}
                >
                  <span className="flex items-start justify-between gap-1">
                    <span className="truncate text-[13px] font-bold leading-tight">{actionLabel(x.c, d.stack)}</span>
                    {mine && <span className="shrink-0 rounded bg-black/30 px-1 text-[9px] font-black text-white">YOU</span>}
                  </span>
                  <span className="flex items-end justify-between gap-1">
                    <span className="text-[20px] font-black leading-none tabular-nums">{Math.round(freq(x.c) * 100)}%</span>
                    <span className="text-right text-[10px] leading-tight tabular-nums opacity-90">
                      EV
                      <br />
                      {(x.e[d.hand] ?? 0).toFixed(2)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          {/* 頻度の帯 */}
          <div className="mt-1 flex h-3 overflow-hidden rounded-md bg-[#2a2a2d]">
            {[...rows].reverse().map((x) => (
              <span key={x.c} style={{ width: `${freq(x.c) * 100}%`, background: trainerActionColor(x.c) }} />
            ))}
          </div>
          <p className="mt-2 px-1 text-[12px] tabular-nums text-[#9a9a9a]">
            あなた: <b className="text-[#e6e6e6]">{actionLabel(d.code, d.stack)}</b>(頻度 {(d.freq * 100).toFixed(1)}%)・ EVロス{" "}
            <b className="text-[#e6e6e6]">-{d.evLoss.toFixed(2)}bb</b>
          </p>

          {/* この場面の表(169 の手を行動の頻度で塗り分け。いまの手は白い枠)。 */}
          {showRange && (
            <div className="mt-2 grid gap-[2px]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
              {Array.from({ length: 169 }, (_, h) => (
                <span
                  key={h}
                  className={`relative aspect-square overflow-hidden rounded-[2px] bg-[#2a2a2d] ${h === d.hand ? "ring-2 ring-white" : ""}`}
                >
                  <span className="absolute inset-0 flex">
                    {[...rows].reverse().map((x) => (
                      <span key={x.c} style={{ width: `${(x.s[h] ?? 0) * 100}%`, background: trainerActionColor(x.c) }} />
                    ))}
                  </span>
                  <span className="absolute left-[6%] top-[4%] text-[clamp(6px,2vw,10px)] font-medium text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.4)]">
                    {handName(h)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-1.5 bg-[#1b1b1d] p-2 pt-0">
          <button type="button" onClick={onRetry} className="pressable h-11 rounded-xl bg-[#2a2a2d] text-[13px] font-black text-[#e6e6e6]">
            もう一度
          </button>
          <button
            type="button"
            onClick={() => setShowRange((v) => !v)}
            aria-pressed={showRange}
            className={`pressable h-11 rounded-xl text-[13px] font-black ${showRange ? "bg-[#e6e6e6] text-[#1b1b1d]" : "bg-[#2a2a2d] text-[#e6e6e6]"}`}
          >
            {showRange ? "表を閉じる" : "GTOを見る"}
          </button>
          <button type="button" onClick={onNext} className="pressable h-11 rounded-xl bg-accent text-[13px] font-black text-on-accent">
            次へ
          </button>
        </div>
      </motion.div>
    </div>
  );
}
