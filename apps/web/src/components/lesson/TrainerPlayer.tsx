"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import type { PublicHandState } from "@meta-geo/engine/src/handEngine.js";
import { Icon } from "@/components/Icon";
import { PokerTable } from "@/components/PokerTable";
import { ACTION_EN, ActionButton } from "@/components/ActionBar";
import { ClassificationBadge } from "@/components/review/ClassificationBadge";
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
  const [hand, setHand] = useState<TrainerHand | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [handsPlayed, setHandsPlayed] = useState(0);
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
    const r = gradeDecision(heroNode, heroHand, code);
    const d: Decision = { ...r, node: heroNode, hand: heroHand, code, stack: hand.stack };
    setDecisions((list) => [...list, d]);
    heroDecidedRef.current = true;
    if (settings.pause === "always" || (settings.pause === "mistake" && r.grade !== "best" && r.grade !== "correct")) setPaused(d);
    setHand(applyAction(hand, code));
  };

  const score = decisions.length ? (decisions.reduce((a, d) => a + d.score, 0) / decisions.length) * 100 : null;
  const evLoss = decisions.reduce((a, d) => a + d.evLoss, 0);
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
          onClick={onClose}
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
          <motion.div
            key={decisions.length}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING_MOVE}
            className="pointer-events-none absolute left-1/2 top-1.5 z-20 flex max-w-[94%] -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface/90 px-2.5 py-1"
            style={{ border: `0.5px solid ${HAIRLINE}` }}
          >
            <ClassificationBadge classification={GRADE_TO_CLASS[last.grade]} size={16} />
            <span className="shrink-0 text-[12px] font-black text-fg">{CLASSIFICATION_META[GRADE_TO_CLASS[last.grade]].label}</span>
            <span className="truncate text-[11px] text-fg-2">
              {handName(last.hand)} ・ {actionLabel(last.code, last.stack)}(頻度 {(last.freq * 100).toFixed(0)}%)・ -{last.evLoss.toFixed(2)}bb
            </span>
          </motion.div>
        )}
        {paused && <PausePanel d={paused} onNext={() => setPaused(null)} />}
        {finished && (
          <div className="absolute inset-0 z-30 flex items-center px-4">
            <div className="glass-panel w-full rounded-3xl p-5 text-center">
              <p className="text-[18px] font-black text-fg">おつかれさま</p>
              <p className="mt-2 text-[13px] text-fg-2">
                {settings.hands}ハンド ・ GTOスコア {score === null ? "--" : `${score.toFixed(1)}%`} ・ EVロス {evLoss.toFixed(2)}bb
              </p>
              <button
                type="button"
                onClick={onClose}
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
        <div className="relative mx-auto flex h-[72px] max-w-md flex-col justify-end gap-1">
          {heroTurn && heroNode && (
            <>
              {rng !== null && (
                <p className="text-center text-[11px] font-bold tabular-nums text-fg-3">
                  乱数 <span className="text-[13px] text-accent">{rng}</span>
                </p>
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

/** ミスで止めたとき: その手の、行動ごとの頻度と期待値。 */
function PausePanel({ d, onNext }: { d: Decision; onNext: () => void }) {
  const rows = [...d.node.a].sort((a, b) => aggression(b.c) - aggression(a.c));
  return (
    <div className="absolute inset-0 z-30 flex items-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={SPRING_MOVE}
        className="glass-panel w-full rounded-3xl p-4"
      >
        <div className="flex items-center gap-2">
          <ClassificationBadge classification={GRADE_TO_CLASS[d.grade]} size={22} showLabel />
          <span className="ml-auto text-[13px] font-bold text-fg-2">{handName(d.hand)}</span>
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl bg-white/[0.04]">
          <div className="grid grid-cols-3 px-3 py-1.5 text-[11px] font-bold text-fg-3">
            <span>行動</span>
            <span className="text-right">頻度</span>
            <span className="text-right">期待値</span>
          </div>
          {rows.map((x) => (
            <div
              key={x.c}
              className={`grid grid-cols-3 border-t border-white/[0.06] px-3 py-2 text-[13px] tabular-nums ${
                x.c === d.code ? "font-black text-accent" : "text-fg"
              }`}
            >
              <span>{actionLabel(x.c, d.stack)}</span>
              <span className="text-right">{((x.s[d.hand] ?? 0) * 100).toFixed(1)}%</span>
              <span className="text-right">{(x.e[d.hand] ?? 0).toFixed(2)}bb</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onNext}
          className="pressable-lg mt-3 h-12 w-full rounded-2xl bg-accent text-[15px] font-black text-on-accent shadow-glow"
        >
          次へ
        </button>
      </motion.div>
    </div>
  );
}
