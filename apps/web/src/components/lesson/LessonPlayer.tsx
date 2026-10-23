"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { HandEngine, type PublicHandState } from "@meta-geo/engine/src/handEngine.js";
import { decideBotAction, lastAggressorSeat } from "@meta-geo/engine/src/autoPlayer.js";
import { cardToString, parseCard, type Card } from "@meta-geo/engine/src/types/card.js";
import type { PlayerAction } from "@meta-geo/engine/src/types/action.js";
import type { Lesson, LessonScene } from "@/data/lessons";
import { REVIEW_SPEAKER } from "@/data/reviewSpeaker";
import { completeLesson } from "@/lib/lessonApi";
import { FADE, SPRING_MOVE } from "@/lib/motion";
import type { SeatAction, SeatPlayerInfo } from "@/lib/socket";
import { Icon } from "@/components/Icon";
import { PokerTable } from "@/components/PokerTable";
import { ActionBar } from "@/components/ActionBar";

/**
 * 1レッスンを進める画面(全画面)。上に卓、下にバリィの吹き出し(棋譜解析の解説と同じ形)。
 *  - talk: 「次へ」で次のページ。ページごとに卓の場面(手札・バリィの手・ボード)を出す。
 *  - flip: 手札どうしの勝負を見せるだけ(配る → 「次へ」でボードを開けて勝ち負け)。
 *  - guided: バリィと決まった流れの1ハンド。言われたボタンを押す(チップの掛け方)。
 *  - practice: 練習相手と卓を1周。手番のたびにできることを案内する。
 * 対局は端末の中だけで動かす(サーバーは使わない)。成績には残さない。
 */
const SEAT_COUNT = 6;
const HERO = 0;
const BALLY = 3;
const BB = 100;
const START_STACK = 100 * BB;

const BALLY_PLAYER: SeatPlayerInfo = { userId: "lesson-bally", displayName: "バリィ", avatarKey: "char:bally", away: false, frame: null };
const HERO_PLAYER: SeatPlayerInfo = { userId: "lesson-you", displayName: "あなた", avatarKey: null, away: false, frame: null };
/** 実践の相手の名前と絵(人間と同じ10枚の絵)。 */
const PRACTICE_NAMES = ["ミナト", "ソラ", "ハル", "リク", "ユイ"];
const PRACTICE_AVATARS = ["animal:cat", "animal:shark", "animal:penguin", "animal:lion", "animal:parrot"];

function cards(list: string[] | undefined): Card[] {
  return (list ?? []).map((s) => parseCard(s)).filter((c): c is Card => c !== null);
}

/** 場面(手札・ボード)を卓の状態にする。 */
function sceneState(scene: LessonScene | undefined, withBally: boolean): PublicHandState {
  const seat = (seatIndex: number, playerId: string) => ({
    seatIndex,
    playerId,
    stack: START_STACK,
    status: "active" as const,
    streetContribution: 0,
    handContribution: 0,
    hasActedThisStreet: false,
  });
  return {
    street: "river",
    board: cards(scene?.board),
    potTotal: 0,
    currentBetToMatch: 0,
    lastFullRaiseSize: BB,
    actingSeatIndex: null,
    buttonFixedPos: HERO,
    smallBlindSeat: HERO,
    bigBlindSeat: BALLY,
    collectedPot: 0,
    pots: [],
    seats: withBally ? [seat(HERO, "you"), seat(BALLY, "bally")] : [seat(HERO, "you")],
    isComplete: false,
    bigBlind: BB,
  };
}

type Phase =
  | { kind: "talk"; step: number; page: number }
  | { kind: "flip"; step: number; revealed: boolean }
  | { kind: "guided"; step: number }
  | { kind: "practice"; step: number }
  | { kind: "done" };

export function LessonPlayer({ lesson, accessToken, onClose }: { lesson: Lesson; accessToken: string; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>(() => startOf(lesson, 0));

  const next = useCallback(() => {
    setPhase((p) => {
      if (p.kind === "talk") {
        const step = lesson.steps[p.step];
        if (step?.kind === "talk" && p.page + 1 < step.pages.length) return { ...p, page: p.page + 1 };
        return startOf(lesson, p.step + 1);
      }
      if (p.kind === "flip" && !p.revealed) return { ...p, revealed: true };
      if (p.kind === "done") return p;
      return startOf(lesson, p.step + 1);
    });
  }, [lesson]);

  useEffect(() => {
    if (phase.kind === "done") void completeLesson(accessToken, lesson.id, 0);
  }, [phase.kind, accessToken, lesson.id]);

  const stepIndex = phase.kind === "done" ? lesson.steps.length : phase.step;

  return createPortal(
    <motion.div className="fixed inset-0 z-[80] flex flex-col bg-canvas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={FADE}>
      <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+10px)]">
        <button type="button" onClick={onClose} aria-label="閉じる" className="pressable grid h-10 w-10 place-items-center rounded-full text-fg-2">
          <Icon name="close" className="h-6 w-6" />
        </button>
        <p className="min-w-0 flex-1 truncate text-[15px] font-black text-fg">{lesson.title}</p>
      </header>
      <div className="h-1 shrink-0 bg-white/[0.06]">
        <motion.div
          className="h-full bg-accent"
          animate={{ width: `${(stepIndex / Math.max(1, lesson.steps.length)) * 100}%` }}
          transition={SPRING_MOVE}
        />
      </div>

      {phase.kind === "guided" ? (
        <GuidedHand onDone={next} />
      ) : phase.kind === "practice" ? (
        <PracticeTable hands={(lesson.steps[phase.step] as { hands: number }).hands} onDone={next} />
      ) : (
        <StaticScene lesson={lesson} phase={phase} onNext={phase.kind === "done" ? onClose : next} />
      )}
    </motion.div>,
    document.body,
  );
}

function startOf(lesson: Lesson, step: number): Phase {
  const s = lesson.steps[step];
  if (!s) return { kind: "done" };
  if (s.kind === "talk") return { kind: "talk", step, page: 0 };
  if (s.kind === "flip") return { kind: "flip", step, revealed: false };
  if (s.kind === "guided") return { kind: "guided", step };
  return { kind: "practice", step };
}

/** バリィの吹き出し。 */
function Bubble({ text, tone = "normal" }: { text: string; tone?: "normal" | "hint" }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={text}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={SPRING_MOVE}
        className="glass-panel flex items-start gap-3 rounded-3xl p-3.5"
      >
        {REVIEW_SPEAKER && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={REVIEW_SPEAKER.avatarSrc} alt="" className="h-14 w-auto shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-accent">{REVIEW_SPEAKER?.name ?? ""}</p>
          <p className={`mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed ${tone === "hint" ? "text-accent" : "text-fg"}`}>{text}</p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/** talk / flip / done: 卓の場面と吹き出しと「次へ」。 */
function StaticScene({ lesson, phase, onNext }: { lesson: Lesson; phase: Phase; onNext: () => void }) {
  let text = "おつかれさま!このレッスンはおしまいだよ。";
  let scene: LessonScene | undefined;
  let withBally = false;
  if (phase.kind === "talk") {
    const step = lesson.steps[phase.step];
    const page = step?.kind === "talk" ? step.pages[phase.page] : undefined;
    text = page?.text ?? "";
    scene = page?.scene;
    withBally = Boolean(scene?.bally);
  } else if (phase.kind === "flip") {
    const step = lesson.steps[phase.step];
    if (step?.kind === "flip") {
      withBally = true;
      text = phase.revealed ? step.result : step.intro;
      scene = phase.revealed ? { hero: step.hero, bally: step.bally, board: step.board } : { hero: step.hero, bally: step.bally };
      const heroWins = step.result.includes("きみの勝ち");
      if (phase.revealed) scene = { ...scene, winner: heroWins ? "hero" : "bally" };
    }
  }
  const state = sceneState(scene, withBally || phase.kind === "flip");
  const players: Record<number, SeatPlayerInfo> = { [HERO]: HERO_PLAYER };
  if (state.seats.length > 1) players[BALLY] = BALLY_PLAYER;
  const revealed = scene?.bally ? { [BALLY]: scene.bally } : null;
  const delta = scene?.winner ? { [scene.winner === "hero" ? HERO : BALLY]: 1 } : null;

  return (
    <>
      <main className="relative min-h-0 flex-1">
        {scene?.hero ? (
          <PokerTable
            state={state}
            yourSeatIndex={HERO}
            yourCards={scene.hero}
            seatCount={SEAT_COUNT}
            revealedHoleCards={revealed}
            players={players}
            bigBlind={BB}
            lastActionBySeat={{}}
            lastHandDeltaBySeat={delta}
            turnTimer={null}
          />
        ) : (
          <div className="grid h-full place-items-center">
            {REVIEW_SPEAKER && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={REVIEW_SPEAKER.avatarSrc} alt="" className="h-40 w-auto opacity-90" />
            )}
          </div>
        )}
      </main>
      <div className="shrink-0 px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-2">
        <Bubble text={text} />
        <button
          type="button"
          onClick={onNext}
          className="pressable mt-2.5 w-full rounded-2xl bg-accent py-3.5 text-[16px] font-black text-on-accent shadow-glow"
        >
          {phase.kind === "done" ? "一覧へもどる" : phase.kind === "flip" && !phase.revealed ? "ボードを開ける" : "次へ"}
        </button>
      </div>
    </>
  );
}

/** 卓の状態から、自分の手番で使うアクションバーの値。 */
function heroBarProps(engine: HandEngine, state: PublicHandState, seatIndex: number) {
  const seat = state.seats.find((s) => s.seatIndex === seatIndex)!;
  const toCall = Math.max(0, state.currentBetToMatch - seat.streetContribution);
  const maxRaiseTo = seat.streetContribution + seat.stack;
  const active = state.seats.filter((s) => s.status === "active").map((s) => s.stack);
  return {
    toCall,
    maxRaiseTo,
    minRaiseTo: Math.min(maxRaiseTo, state.currentBetToMatch + state.lastFullRaiseSize),
    streetContribution: seat.streetContribution,
    canRaise: !seat.hasActedThisStreet && maxRaiseTo > state.currentBetToMatch,
    effective: active.length ? Math.min(...active) : seat.stack,
    minRaiseFromEngine: engine.getMinRaiseToAmount(),
  };
}

/** エンジンが打ったアクションを、卓のバッジ用に読む。 */
function lastSeatAction(engine: HandEngine): { seat: number; action: SeatAction } | null {
  const events = engine.getEvents();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as { type: string; seatIndex?: number; toAmount?: number };
    if (["fold", "check", "call", "bet", "raise", "allIn"].includes(e.type) && typeof e.seatIndex === "number") {
      return { seat: e.seatIndex, action: { kind: e.type as SeatAction["kind"], toAmount: e.toAmount ?? 0 } };
    }
  }
  return null;
}

/**
 * チップの掛け方: バリィと決まった流れの1ハンド(あなたは SB=ボタン、バリィは BB)。
 *  プリフロップ: あなたがコール → バリィがチェック
 *  フロップ: バリィがチェック → あなたがチェック
 *  ターン: バリィがベット → あなたがレイズ → バリィがコール
 *  リバー: バリィがチェック → あなたがオールイン → バリィがフォールド
 */
const GUIDE: { expect: PlayerAction["kind"]; label: string; text: string }[] = [
  { expect: "call", label: "コール", text: "まずは「コール」を押してみよう。BBと同じ額を出して、勝負に参加することだよ。" },
  { expect: "check", label: "チェック", text: "僕がチェックしたね。チップを出さずに次へ回すのがチェックだよ。押してみて。" },
  { expect: "raise", label: "レイズ", text: "僕がベットしたよ!ベットに上乗せするのがレイズだよ。レイズしてみよう。" },
  { expect: "allIn", label: "オールイン", text: "最後は、持ってるチップを全部出す「オールイン」だよ。押してみよう。" },
];

function GuidedHand({ onDone }: { onDone: () => void }) {
  const engineRef = useRef<HandEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new HandEngine({
      seats: [
        { seatIndex: HERO, playerId: "you", stack: START_STACK },
        { seatIndex: BALLY, playerId: "bally", stack: START_STACK },
      ],
      seatCount: SEAT_COUNT,
      buttonFixedPos: HERO,
      smallBlindSeat: HERO,
      bigBlindSeat: BALLY,
      smallBlind: BB / 2,
      bigBlind: BB,
      bbAnte: BB,
    });
  }
  const engine = engineRef.current;
  const [state, setState] = useState(() => engine.getPublicState());
  const [heroTurn, setHeroTurn] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [last, setLast] = useState<Record<number, SeatAction>>({});
  const ballyTurn = useRef(0);
  const heroCards = useMemo(() => engine.getSeatHoleCards(HERO).map(cardToString), [engine]);

  const sync = useCallback(() => {
    setState(engine.getPublicState());
    const la = lastSeatAction(engine);
    if (la) setLast({ [la.seat]: la.action });
  }, [engine]);

  // バリィの番は決まった手を打つ。
  useEffect(() => {
    if (state.isComplete || state.actingSeatIndex !== BALLY) return;
    const id = window.setTimeout(() => {
      const turn = ballyTurn.current++;
      const s = engine.getPublicState();
      const me = s.seats.find((x) => x.seatIndex === BALLY)!;
      const toCall = s.currentBetToMatch - me.streetContribution;
      let action: PlayerAction;
      if (turn === 2) action = { kind: "bet", toAmount: 300 };
      else if (turn === 5) action = { kind: "fold" };
      else action = toCall > 0 ? { kind: "call" } : { kind: "check" };
      engine.applyAction(BALLY, action);
      sync();
    }, 900);
    return () => window.clearTimeout(id);
  }, [state, engine, sync]);

  const onAction = (action: PlayerAction) => {
    const g = GUIDE[heroTurn];
    if (!g) return;
    const bar = heroBarProps(engine, engine.getPublicState(), HERO);
    const isAllIn = action.kind === "allIn" || ((action.kind === "raise" || action.kind === "bet") && action.toAmount === bar.maxRaiseTo);
    const ok =
      g.expect === "allIn" ? isAllIn : g.expect === "raise" ? (action.kind === "raise" || action.kind === "bet") && !isAllIn : action.kind === g.expect;
    if (!ok) {
      setHint(`今は「${g.label}」を押してね。`);
      return;
    }
    setHint(null);
    engine.applyAction(HERO, action);
    setHeroTurn((n) => n + 1);
    sync();
  };

  const finished = state.isComplete;
  const myTurn = !finished && state.actingSeatIndex === HERO;
  const bar = myTurn ? heroBarProps(engine, state, HERO) : null;
  const text = finished
    ? "僕が降りたね。これが「フォールド」。チップを出さずに降りることで、そのハンドのチップはもらえなくなるんだ。\nきみの勝ち!ポットのチップは全部きみのものだよ。"
    : myTurn
      ? GUIDE[heroTurn]?.text ?? ""
      : "僕の番だよ…";

  return (
    <>
      <main className="relative min-h-0 flex-1">
        <PokerTable
          state={state}
          yourSeatIndex={HERO}
          yourCards={heroCards}
          seatCount={SEAT_COUNT}
          revealedHoleCards={null}
          players={{ [HERO]: HERO_PLAYER, [BALLY]: BALLY_PLAYER }}
          bigBlind={BB}
          lastActionBySeat={last}
          lastHandDeltaBySeat={finished ? { [HERO]: 1 } : null}
          turnTimer={null}
        />
      </main>
      <div className="shrink-0 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2">
        <Bubble text={hint ?? text} tone={hint ? "hint" : "normal"} />
        {finished ? (
          <button type="button" onClick={onDone} className="pressable mt-2.5 w-full rounded-2xl bg-accent py-3.5 text-[16px] font-black text-on-accent shadow-glow">
            次へ
          </button>
        ) : (
          <div className="mt-2">
            <ActionBar
              isYourTurn={myTurn}
              street={state.street}
              canCheck={(bar?.toCall ?? 0) <= 0}
              toCall={bar?.toCall ?? 0}
              minRaiseToAmount={bar?.minRaiseTo ?? 0}
              maxRaiseToAmount={bar?.maxRaiseTo ?? 0}
              potTotal={state.potTotal}
              streetContribution={bar?.streetContribution ?? 0}
              canRaise={bar?.canRaise ?? false}
              bigBlind={BB}
              effectiveStackBehind={bar?.effective ?? 0}
              onAction={onAction}
              away={false}
              onToggleAway={() => {}}
              checkFoldArmed={false}
              onToggleCheckFold={() => {}}
            />
          </div>
        )}
      </div>
    </>
  );
}

/** 実践: 練習相手と6人卓を1周(ボタンが全員を1回ずつ回る)。100BB・ブラインドは上げない。 */
function PracticeTable({ hands, onDone }: { hands: number; onDone: () => void }) {
  const stacks = useRef<number[]>(Array.from({ length: SEAT_COUNT }, () => START_STACK));
  const [handNo, setHandNo] = useState(0);
  const engineRef = useRef<HandEngine | null>(null);
  const [state, setState] = useState<PublicHandState | null>(null);
  const [last, setLast] = useState<Record<number, SeatAction>>({});
  const [result, setResult] = useState<{ delta: Record<number, number>; shown: Record<number, string[]> } | null>(null);

  const players = useMemo(() => {
    const p: Record<number, SeatPlayerInfo> = { [HERO]: HERO_PLAYER };
    for (let i = 1; i < SEAT_COUNT; i++) {
      p[i] = { userId: `lesson-p${i}`, displayName: PRACTICE_NAMES[i - 1]!, avatarKey: PRACTICE_AVATARS[i - 1]!, away: false, frame: null };
    }
    return p;
  }, []);

  const startHand = useCallback((n: number) => {
    for (let i = 0; i < SEAT_COUNT; i++) if (stacks.current[i]! < BB * 2) stacks.current[i] = START_STACK;
    const button = n % SEAT_COUNT;
    const engine = new HandEngine({
      seats: stacks.current.map((stack, seatIndex) => ({ seatIndex, playerId: `p${seatIndex}`, stack })),
      seatCount: SEAT_COUNT,
      buttonFixedPos: button,
      smallBlindSeat: (button + 1) % SEAT_COUNT,
      bigBlindSeat: (button + 2) % SEAT_COUNT,
      smallBlind: BB / 2,
      bigBlind: BB,
      bbAnte: BB,
    });
    engineRef.current = engine;
    setLast({});
    setResult(null);
    setState(engine.getPublicState());
  }, []);

  useEffect(() => startHand(0), [startHand]);

  const sync = useCallback(() => {
    const engine = engineRef.current!;
    const s = engine.getPublicState();
    setState(s);
    const la = lastSeatAction(engine);
    if (la) setLast((prev) => ({ ...prev, [la.seat]: la.action }));
    if (s.isComplete) {
      const r = engine.getResult();
      const before = stacks.current.slice();
      const after = engine.getStacks();
      const delta: Record<number, number> = {};
      for (let i = 0; i < SEAT_COUNT; i++) {
        const now = after.get(i) ?? before[i]!;
        delta[i] = now - before[i]!;
        stacks.current[i] = now;
      }
      const shown: Record<number, string[]> = {};
      if (!r.wonByFold) {
        for (const [seat, cs] of engine.getAllHoleCards()) {
          const st = s.seats.find((x) => x.seatIndex === seat);
          if (st && st.status !== "folded") shown[seat] = cs.map(cardToString);
        }
      }
      setResult({ delta, shown });
    }
  }, []);

  // 練習相手の番。
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !state || state.isComplete || state.actingSeatIndex === null || state.actingSeatIndex === HERO) return;
    const seatIndex = state.actingSeatIndex;
    const id = window.setTimeout(() => {
      const s = engine.getPublicState();
      const seat = s.seats.find((x) => x.seatIndex === seatIndex)!;
      const hole = engine.getSeatHoleCards(seatIndex);
      let action: PlayerAction = { kind: "fold" };
      if (hole.length === 2) {
        action = decideBotAction({
          street: s.street,
          holeCards: hole as unknown as readonly [Card, Card],
          board: s.board,
          currentBetToMatch: s.currentBetToMatch,
          streetContribution: seat.streetContribution,
          minRaiseToAmount: engine.getMinRaiseToAmount(),
          potBefore: s.potTotal,
          stack: seat.stack,
          canRaise: !seat.hasActedThisStreet,
          activeOpponentCount: s.seats.filter((x) => x.seatIndex !== seatIndex && x.status !== "folded").length,
          bigBlind: BB,
          isAggressor: lastAggressorSeat(engine.getEvents()) === seatIndex,
        });
      }
      try {
        engine.applyAction(seatIndex, action);
      } catch {
        const toCall = s.currentBetToMatch - seat.streetContribution;
        engine.applyAction(seatIndex, toCall > 0 ? { kind: "fold" } : { kind: "check" });
      }
      sync();
    }, 800);
    return () => window.clearTimeout(id);
  }, [state, sync]);

  if (!state || !engineRef.current) return <main className="flex-1" />;
  const engine = engineRef.current;
  const myTurn = !state.isComplete && state.actingSeatIndex === HERO;
  const bar = myTurn ? heroBarProps(engine, state, HERO) : null;
  const heroCards = engine.getSeatHoleCards(HERO).map(cardToString);

  let text = `${handNo + 1} / ${hands} ハンド目。みんなの番を待ってね。`;
  if (myTurn && bar) {
    text =
      bar.toCall > 0
        ? `きみの番だよ。「コール」で${bar.toCall.toLocaleString()}出して勝負、「レイズ」で上乗せ、「フォールド」で降りられるよ。`
        : "きみの番だよ。「チェック」でそのまま次へ、「ベット」でチップを賭けられるよ。";
  } else if (result) {
    const won = (result.delta[HERO] ?? 0) > 0;
    text = won ? "きみの勝ち!ポットをもらえたね。" : "このハンドは終わり。次へ進もう。";
  }
  const lastHand = handNo + 1 >= hands;

  return (
    <>
      <main className="relative min-h-0 flex-1">
        <PokerTable
          state={state}
          yourSeatIndex={HERO}
          yourCards={heroCards}
          seatCount={SEAT_COUNT}
          revealedHoleCards={result?.shown ?? null}
          players={players}
          bigBlind={BB}
          lastActionBySeat={last}
          lastHandDeltaBySeat={result?.delta ?? null}
          turnTimer={null}
        />
      </main>
      <div className="shrink-0 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2">
        <Bubble text={text} />
        {result ? (
          <button
            type="button"
            onClick={() => {
              if (lastHand) onDone();
              else {
                setHandNo(handNo + 1);
                startHand(handNo + 1);
              }
            }}
            className="pressable mt-2.5 w-full rounded-2xl bg-accent py-3.5 text-[16px] font-black text-on-accent shadow-glow"
          >
            {lastHand ? "おわる" : "次のハンドへ"}
          </button>
        ) : (
          <div className="mt-2">
            <ActionBar
              isYourTurn={myTurn}
              street={state.street}
              canCheck={(bar?.toCall ?? 0) <= 0}
              toCall={bar?.toCall ?? 0}
              minRaiseToAmount={bar?.minRaiseTo ?? 0}
              maxRaiseToAmount={bar?.maxRaiseTo ?? 0}
              potTotal={state.potTotal}
              streetContribution={bar?.streetContribution ?? 0}
              canRaise={bar?.canRaise ?? false}
              bigBlind={BB}
              effectiveStackBehind={bar?.effective ?? 0}
              onAction={(a) => {
                try {
                  engine.applyAction(HERO, a);
                } catch {
                  return;
                }
                sync();
              }}
              away={false}
              onToggleAway={() => {}}
              checkFoldArmed={false}
              onToggleCheckFold={() => {}}
            />
          </div>
        )}
      </div>
    </>
  );
}
