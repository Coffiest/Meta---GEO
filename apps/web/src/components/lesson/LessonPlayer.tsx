"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { HandEngine, type PublicHandState } from "@meta-geo/engine/src/handEngine.js";
import { decideBotAction, lastAggressorSeat } from "@meta-geo/engine/src/autoPlayer.js";
import { cardToString, parseCard, type Card } from "@meta-geo/engine/src/types/card.js";
import type { PlayerAction } from "@meta-geo/engine/src/types/action.js";
import type { Lesson, LessonAct, LessonScene } from "@/data/lessons";
import { ClassificationBadge } from "@/components/review/ClassificationBadge";
import { CLASSIFICATION_META } from "@/lib/classification";
import { completeLesson } from "@/lib/lessonApi";
import { FADE, SPRING_MOVE } from "@/lib/motion";
import type { SeatAction, SeatPlayerInfo } from "@/lib/socket";
import { Icon } from "@/components/Icon";
import { PokerTable } from "@/components/PokerTable";
import { ActionBar } from "@/components/ActionBar";
import { BallyBubble } from "@/components/BallyBubble";
import { FitBox } from "@/components/review/FitBox";
import { HAIRLINE, SHEET_BG } from "@/components/review/ReviewReplayView";

/**
 * 1レッスンを進める画面(全画面)。棋譜解析と同じ並び: 上にバリィの解説(高さ固定の箱)、真ん中に卓、下に操作(高さ固定)。
 * 卓は段階が変わっても同じ1つを出し続ける(付け替えると読み込み直してちらつく)。上下の箱の高さも一定なので、卓の大きさは変わらない。
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
  const seat = (seatIndex: number, playerId: string, bet = 0) => ({
    seatIndex,
    playerId,
    stack: START_STACK - bet,
    status: "active" as const,
    streetContribution: bet,
    handContribution: bet,
    hasActedThisStreet: false,
  });
  const heroBet = scene?.bets?.hero ?? 0;
  const ballyBet = scene?.bets?.bally ?? 0;
  const pot = scene?.pot ?? 0;
  return {
    street: "river",
    board: cards(scene?.board),
    potTotal: pot + heroBet + ballyBet,
    currentBetToMatch: 0,
    lastFullRaiseSize: BB,
    actingSeatIndex: null,
    buttonFixedPos: HERO,
    smallBlindSeat: HERO,
    bigBlindSeat: BALLY,
    collectedPot: pot,
    pots: [],
    seats: withBally ? [seat(HERO, "you", heroBet), seat(BALLY, "bally", ballyBet)] : [seat(HERO, "you", heroBet)],
    isComplete: false,
    bigBlind: BB,
  };
}

/** 場面を卓の値(状態・席の人・表の手札・席のアクション)にする。6人卓の局面(table)があればそれを使う。 */
function sceneTable(scene: LessonScene | undefined): {
  state: PublicHandState;
  players: Record<number, SeatPlayerInfo>;
  revealed: Record<number, string[]> | null;
  lastAction: Record<number, SeatAction>;
} {
  const t = scene?.table;
  if (!t) {
    const base = sceneState(scene, true);
    const state: PublicHandState = scene?.focus?.length ? { ...base, actingSeatIndex: scene.focus[0]! } : base;
    return {
      state,
      players: { [HERO]: HERO_PLAYER, [BALLY]: BALLY_PLAYER },
      revealed: scene?.bally ? { [BALLY]: scene.bally } : null,
      lastAction: {},
    };
  }
  const board = cards(scene?.board);
  const street = board.length >= 5 ? "river" : board.length === 4 ? "turn" : board.length === 3 ? "flop" : "preflop";
  const bets = t.seats.map((x) => (x.bet ?? 0) * BB);
  const pot = (t.pot ?? 0) * BB;
  const state: PublicHandState = {
    street,
    board,
    potTotal: pot + bets.reduce((a, b) => a + b, 0),
    currentBetToMatch: Math.max(0, ...bets),
    lastFullRaiseSize: BB,
    actingSeatIndex: scene?.focus?.[0] ?? null,
    buttonFixedPos: t.button,
    smallBlindSeat: (t.button + 1) % SEAT_COUNT,
    bigBlindSeat: (t.button + 2) % SEAT_COUNT,
    collectedPot: pot,
    pots: [],
    seats: t.seats.map((x) => ({
      seatIndex: x.seat,
      playerId: `s${x.seat}`,
      stack: (x.stack ?? 100) * BB,
      status: x.folded ? ("folded" as const) : ("active" as const),
      streetContribution: (x.bet ?? 0) * BB,
      handContribution: (x.bet ?? 0) * BB,
      hasActedThisStreet: false,
    })),
    isComplete: false,
    bigBlind: BB,
  };
  const players: Record<number, SeatPlayerInfo> = {};
  const revealed: Record<number, string[]> = {};
  const lastAction: Record<number, SeatAction> = {};
  for (const x of t.seats) {
    if (x.seat === HERO) players[x.seat] = HERO_PLAYER;
    else if (x.name === "バリィ") players[x.seat] = { ...BALLY_PLAYER, userId: `lesson-bally-${x.seat}` };
    else {
      const i = Math.max(0, PRACTICE_NAMES.indexOf(x.name ?? ""));
      players[x.seat] = { userId: `lesson-s${x.seat}`, displayName: x.name ?? PRACTICE_NAMES[i]!, avatarKey: PRACTICE_AVATARS[i]!, away: false, frame: null };
    }
    if (x.cards) revealed[x.seat] = x.cards;
    if (x.act) lastAction[x.seat] = { kind: x.act, toAmount: (x.bet ?? 0) * BB };
  }
  return { state, players, revealed: Object.keys(revealed).length ? revealed : null, lastAction };
}

/** 卓の局面から、自分(席0)のアクションバーの値。 */
function spotBar(state: PublicHandState) {
  const me = state.seats.find((x) => x.seatIndex === HERO)!;
  const bets = state.seats.map((x) => x.streetContribution).sort((a, b) => b - a);
  const top = bets[0] ?? 0;
  const second = bets[1] ?? 0;
  const maxRaiseTo = me.streetContribution + me.stack;
  const active = state.seats.filter((x) => x.status !== "folded").map((x) => x.stack + x.streetContribution);
  return {
    toCall: Math.max(0, top - me.streetContribution),
    minRaiseTo: Math.min(maxRaiseTo, top > 0 ? top + Math.max(BB, top - second) : BB),
    maxRaiseTo,
    streetContribution: me.streetContribution,
    effective: Math.min(...active),
  };
}

/** 解説の文。**…** は色付きの太字(アクセント)、!!…!! は赤い太字(大悪手の色)。 */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|!![^!]+!!)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-black text-accent">
            {p.slice(2, -2)}
          </strong>
        ) : p.startsWith("!!") && p.endsWith("!!") ? (
          <strong key={i} className="font-black" style={{ color: CLASSIFICATION_META.blunder.color }}>
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

type Phase =
  | { kind: "talk"; step: number; page: number }
  | { kind: "flip"; step: number; revealed: boolean }
  | { kind: "guided"; step: number }
  | { kind: "practice"; step: number }
  /** 選択肢の問題。ask = 答える前 / wrong = 間違えた(答えを見るか、もう一度解くか)/ right = 正解 / shown = 答えを見た */
  | { kind: "quiz"; step: number; status: "ask" | "wrong" | "right" | "shown" }
  /** 卓の局面の問題(アクションバーで答える)。status は quiz と同じ。 */
  | { kind: "spot"; step: number; status: "ask" | "wrong" | "right" | "shown" }
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

  // 棋譜解析と同じく、話の場面は「‹」で1つ前へ戻れる。ハンドを打つ段階(実際に押す・実践)の中へは戻らない。
  const prev = useMemo(() => prevOf(lesson, phase), [lesson, phase]);
  const back = useCallback(() => {
    if (prev) setPhase(prev);
  }, [prev]);

  // 一発で正解できなかった問題(星の計算に使う)。
  const missed = useRef(new Set<number>());
  const quizCount = lesson.steps.filter((s) => s.kind === "quiz" || s.kind === "spot").length;

  useEffect(() => {
    if (phase.kind !== "done") return;
    const stars = quizCount ? Math.round((3 * (quizCount - missed.current.size)) / quizCount) : 0;
    void completeLesson(accessToken, lesson.id, stars);
  }, [phase.kind, accessToken, lesson.id, quizCount]);

  const stepIndex = phase.kind === "done" ? lesson.steps.length : phase.step;

  // 3つの段階のどれでも、卓・台詞・下の操作を同じ形で返す(卓を同じ位置の同じ部品のまま描くため)。
  const stat = useStaticScene(lesson, phase, phase.kind === "done" ? onClose : next, prev ? back : null);
  const guided = useGuidedHand(phase.kind === "guided", next);
  const practiceStep = phase.kind === "practice" ? lesson.steps[phase.step] : undefined;
  const practice = usePracticeTable(phase.kind === "practice", practiceStep?.kind === "practice" ? practiceStep.hands : 6, next);
  const quiz = useQuizView(lesson, phase, setPhase, (step) => missed.current.add(step), next, prev ? back : null);
  const spot = useSpotView(lesson, phase, setPhase, (step) => missed.current.add(step), next, prev ? back : null);
  const view =
    phase.kind === "guided"
      ? guided
      : phase.kind === "practice"
        ? practice
        : phase.kind === "quiz"
          ? quiz
          : phase.kind === "spot"
            ? spot
            : stat;
  const bubbleKey = `${stepIndex}:${phase.kind === "talk" ? phase.page : ""}:${view.text}`;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[80] flex flex-col overflow-hidden"
      style={{ background: SHEET_BG }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={FADE}
    >
      {/* すりガラスのナビゲーションバー(棋譜解析と同じ) */}
      <header className="glass-header flex shrink-0 items-center gap-2.5 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+10px)]">
        <motion.button
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-fg"
        >
          <Icon name="close" className="h-4 w-4" />
        </motion.button>
        <p className="min-w-0 flex-1 truncate text-[16px] font-bold tracking-tight text-fg">{lesson.title}</p>
        <p className="ml-auto rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-fg-2">
          {Math.min(stepIndex + 1, lesson.steps.length)}/{lesson.steps.length}
        </p>
      </header>
      <div className="h-[2px] shrink-0 bg-white/[0.06]">
        <motion.div
          className="h-full bg-accent"
          animate={{ width: `${(stepIndex / Math.max(1, lesson.steps.length)) * 100}%` }}
          transition={SPRING_MOVE}
        />
      </div>

      {/* 上: バリィの解説。高さは一定(伸び縮みすると卓の大きさが変わってちらつく)。入りきらなければ FitBox が縮める。 */}
      <div className="shrink-0 px-3 pt-2">
        <motion.div
          key={bubbleKey}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_MOVE}
          className="rounded-[20px] bg-surface shadow-e2"
          style={{ border: `0.5px solid ${HAIRLINE}` }}
        >
          <FitBox className="h-[176px] px-3.5 py-3" contentKey={bubbleKey}>
            <BallyBubble size="lg">
              {view.badge && (
                <span className="mb-1 flex">
                  <ClassificationBadge classification={view.badge} size={20} showLabel />
                </span>
              )}
              <span className="block whitespace-pre-wrap text-[13px]">
                <RichText text={view.text} />
              </span>
            </BallyBubble>
          </FitBox>
        </motion.div>
      </div>

      {/* 真ん中: 卓(常に出す) */}
      <main className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden px-2">
        <PokerTable {...view.table} />
      </main>

      {/* 下: 操作。高さはアクションバーと同じ 132px で一定。 */}
      <div className="shrink-0 border-t px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-1" style={{ borderColor: HAIRLINE }}>
        <div className="flex h-[132px] flex-col justify-center">{view.bottom}</div>
      </div>
    </motion.div>,
    document.body,
  );
}

type TableProps = ComponentProps<typeof PokerTable>;
type LessonView = { table: TableProps; text: string; tone?: "normal" | "hint"; badge?: "best" | "blunder"; bottom: ReactNode };

/** 「次へ」など、下の箱に置く大きなボタン(1画面に1つだけの強いアクセント)。 */
function NextButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable-lg flex h-14 w-full items-center justify-center gap-1.5 rounded-2xl bg-accent text-[16px] font-black text-on-accent shadow-glow"
    >
      {label}
      <Icon name="chevron-right" className="h-5 w-5" />
    </button>
  );
}

/** 1つ前の場面。話(talk)とフリップの中だけを戻る。前がハンドを打つ段階なら戻らない(null)。 */
function prevOf(lesson: Lesson, p: Phase): Phase | null {
  if (p.kind === "talk" && p.page > 0) return { ...p, page: p.page - 1 };
  if (p.kind === "flip" && p.revealed) return { ...p, revealed: false };
  if (p.kind === "guided" || p.kind === "practice") return null;
  const step = p.kind === "done" ? lesson.steps.length : p.step;
  const before = lesson.steps[step - 1];
  if (!before) return null;
  if (before.kind === "talk") return { kind: "talk", step: step - 1, page: before.pages.length - 1 };
  if (before.kind === "flip") return { kind: "flip", step: step - 1, revealed: true };
  if (before.kind === "quiz") return { kind: "quiz", step: step - 1, status: "ask" };
  if (before.kind === "spot") return { kind: "spot", step: step - 1, status: "ask" };
  return null;
}

function startOf(lesson: Lesson, step: number): Phase {
  const s = lesson.steps[step];
  if (!s) return { kind: "done" };
  if (s.kind === "talk") return { kind: "talk", step, page: 0 };
  if (s.kind === "flip") return { kind: "flip", step, revealed: false };
  if (s.kind === "guided") return { kind: "guided", step };
  if (s.kind === "quiz") return { kind: "quiz", step, status: "ask" };
  if (s.kind === "spot") return { kind: "spot", step, status: "ask" };
  return { kind: "practice", step };
}

/** 下の箱の「‹」+「次へ」(棋譜解析と同じく左で戻る)。 */
function BackNext({ label, onNext, onBack }: { label: string; onNext: () => void; onBack: (() => void) | null }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack ?? undefined}
        disabled={!onBack}
        aria-label="前へ"
        className="pressable flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-fg disabled:opacity-30"
      >
        <Icon name="chevron-left" className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <NextButton label={label} onClick={onNext} />
      </div>
    </div>
  );
}

/** 選択肢の問題。間違えたら「答えを見る」か「もう一度解く」を選ぶ(オーナー確定)。 */
function useQuizView(
  lesson: Lesson,
  phase: Phase,
  setPhase: (p: Phase) => void,
  onMiss: (step: number) => void,
  onNext: () => void,
  onBack: (() => void) | null,
): LessonView {
  const step = phase.kind === "quiz" ? lesson.steps[phase.step] : undefined;
  const q = step?.kind === "quiz" ? step : null;
  const qt = sceneTable(q?.scene);
  const table: TableProps = {
    state: qt.state,
    yourSeatIndex: HERO,
    yourCards: q?.scene?.hero ?? [],
    seatCount: SEAT_COUNT,
    revealedHoleCards: qt.revealed,
    players: qt.players,
    bigBlind: BB,
    lastActionBySeat: qt.lastAction,
    lastHandDeltaBySeat: null,
    turnTimer: null,
  };
  if (phase.kind !== "quiz" || !q) return { table, text: "", bottom: null };
  const at = phase.step;
  const set = (status: "ask" | "wrong" | "right" | "shown") => setPhase({ kind: "quiz", step: at, status });

  if (phase.status === "right" || phase.status === "shown") {
    const text =
      phase.status === "right" ? `正解!\n${q.explain}` : `答えは「${q.choices[q.answer]}」だよ。\n${q.explain}`;
    return { table, text, bottom: <BackNext label="次へ" onNext={onNext} onBack={onBack} /> };
  }
  if (phase.status === "wrong") {
    return {
      table,
      text: `ちがうよ。\n${q.hint}`,
      tone: "hint",
      bottom: (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => set("shown")}
            className="pressable-lg h-14 rounded-2xl bg-white/[0.06] text-[15px] font-black text-fg ring-1 ring-white/10"
          >
            答えを見る
          </button>
          <button
            type="button"
            onClick={() => set("ask")}
            className="pressable-lg h-14 rounded-2xl bg-accent text-[15px] font-black text-on-accent shadow-glow"
          >
            もう一度解く
          </button>
        </div>
      ),
    };
  }
  return {
    table,
    text: `問題: ${q.question}`,
    bottom: (
      <div className={`grid gap-2 ${q.choices.length > 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {q.choices.map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              if (i === q.answer) set("right");
              else {
                onMiss(at);
                set("wrong");
              }
            }}
            className="pressable-lg flex h-[60px] items-center justify-center rounded-2xl bg-surface-2 px-2 text-center text-[13px] font-bold leading-tight text-fg shadow-e1 ring-1 ring-accent/40"
          >
            {c}
          </button>
        ))}
      </div>
    ),
  };
}

/** talk / flip / done: 場面(手札・バリィの手・ボード)の卓と「次へ」。場面の無いページも、空の卓を出したままにする。 */
function useStaticScene(lesson: Lesson, phase: Phase, onNext: () => void, onBack: (() => void) | null): LessonView {
  let text = "おつかれさま!このレッスンはおしまいだよ。";
  let scene: LessonScene | undefined;
  if (phase.kind === "talk") {
    const step = lesson.steps[phase.step];
    const page = step?.kind === "talk" ? step.pages[phase.page] : undefined;
    text = page?.text ?? "";
    scene = page?.scene;
  } else if (phase.kind === "flip") {
    const step = lesson.steps[phase.step];
    if (step?.kind === "flip") {
      text = phase.revealed ? step.result : step.intro;
      scene = phase.revealed ? { hero: step.hero, bally: step.bally, board: step.board } : { hero: step.hero, bally: step.bally };
      const heroWins = step.result.includes("きみの勝ち");
      if (phase.revealed) scene = { ...scene, winner: heroWins ? "hero" : "bally" };
    }
  }
  // 卓にはいつもバリィも座らせる(ページごとに席が増えたり消えたりしない)。
  const { state, players, revealed, lastAction } = sceneTable(scene);
  const delta = scene?.winner ? { [scene.winner === "hero" ? HERO : BALLY]: 1 } : null;
  const label = phase.kind === "done" ? "一覧へもどる" : phase.kind === "flip" && !phase.revealed ? "ボードを開ける" : "次へ";

  return {
    table: {
      state,
      yourSeatIndex: HERO,
      yourCards: scene?.hero ?? [],
      seatCount: SEAT_COUNT,
      revealedHoleCards: revealed,
      players,
      bigBlind: BB,
      lastActionBySeat: lastAction,
      lastHandDeltaBySeat: delta,
      turnTimer: null,
    },
    text,
    badge: scene?.badge,
    bottom: (
      // 棋譜解析と同じく、左に「‹」(前へ)、右へ進む。
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack ?? undefined}
          disabled={!onBack}
          aria-label="前へ"
          className="pressable flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-fg disabled:opacity-30"
        >
          <Icon name="chevron-left" className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <NextButton label={label} onClick={onNext} />
        </div>
      </div>
    ),
  };
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

function useGuidedHand(active: boolean, onDone: () => void): LessonView {
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
    if (!active || state.isComplete || state.actingSeatIndex !== BALLY) return;
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
  }, [active, state, engine, sync]);

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

  return {
    table: {
      state,
      yourSeatIndex: HERO,
      yourCards: heroCards,
      seatCount: SEAT_COUNT,
      revealedHoleCards: null,
      players: { [HERO]: HERO_PLAYER, [BALLY]: BALLY_PLAYER },
      bigBlind: BB,
      lastActionBySeat: last,
      lastHandDeltaBySeat: finished ? { [HERO]: 1 } : null,
      turnTimer: null,
    },
    text: hint ?? text,
    tone: hint ? "hint" : "normal",
    bottom: finished ? (
      <NextButton label="次へ" onClick={onDone} />
    ) : (
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
    ),
  };
}

/** 実践: 練習相手と6人卓を1周(ボタンが全員を1回ずつ回る)。100BB・ブラインドは上げない。 */
function usePracticeTable(active: boolean, hands: number, onDone: () => void): LessonView {
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

  // 実践の段階に入ったときに最初のハンドを配る。
  useEffect(() => {
    if (active && !engineRef.current) startHand(0);
  }, [active, startHand]);

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
    if (!active || !engine || !state || state.isComplete || state.actingSeatIndex === null || state.actingSeatIndex === HERO) return;
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
  }, [active, state, sync]);

  if (!state || !engineRef.current) {
    return {
      table: {
        state: sceneState(undefined, true),
        yourSeatIndex: HERO,
        yourCards: [],
        seatCount: SEAT_COUNT,
        revealedHoleCards: null,
        players: { [HERO]: HERO_PLAYER, [BALLY]: BALLY_PLAYER },
        bigBlind: BB,
        lastActionBySeat: {},
        lastHandDeltaBySeat: null,
        turnTimer: null,
      },
      text: "",
      bottom: null,
    };
  }
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

  return {
    table: {
      state,
      yourSeatIndex: HERO,
      yourCards: heroCards,
      seatCount: SEAT_COUNT,
      revealedHoleCards: result?.shown ?? null,
      players,
      bigBlind: BB,
      lastActionBySeat: last,
      lastHandDeltaBySeat: result?.delta ?? null,
      turnTimer: null,
    },
    text,
    bottom: result ? (
      <NextButton
        label={lastHand ? "おわる" : "次のハンドへ"}
        onClick={() => {
          if (lastHand) onDone();
          else {
            setHandNo(handNo + 1);
            startHand(handNo + 1);
          }
        }}
      />
    ) : (
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
    ),
  };
}

/** 卓の局面の問題。本物のアクションバーで答える。間違えたら大悪手のバッジとヒント、「答えを見る」か「もう一度解く」。 */
function useSpotView(
  lesson: Lesson,
  phase: Phase,
  setPhase: (p: Phase) => void,
  onMiss: (step: number) => void,
  onNext: () => void,
  onBack: (() => void) | null,
): LessonView {
  const step = phase.kind === "spot" ? lesson.steps[phase.step] : undefined;
  const q = step?.kind === "spot" ? step : null;
  const t = sceneTable(q?.scene);
  const table: TableProps = {
    state: { ...t.state, actingSeatIndex: phase.kind === "spot" && phase.status === "ask" ? HERO : t.state.actingSeatIndex },
    yourSeatIndex: HERO,
    yourCards: q?.scene.hero ?? [],
    seatCount: SEAT_COUNT,
    revealedHoleCards: t.revealed,
    players: t.players,
    bigBlind: BB,
    lastActionBySeat: t.lastAction,
    lastHandDeltaBySeat: null,
    turnTimer: null,
  };
  if (phase.kind !== "spot" || !q) return { table, text: "", bottom: null };
  const at = phase.step;
  const set = (status: "ask" | "wrong" | "right" | "shown") => setPhase({ kind: "spot", step: at, status });
  const ACT_LABEL: Record<LessonAct, string> = { check: "チェック", bet: "ベット", call: "コール", raise: "レイズ", fold: "フォールド", allIn: "オールイン" };

  if (phase.status === "right" || phase.status === "shown") {
    const size = q.size ? `(${q.size[0]}〜${q.size[1]}BB)` : "";
    const text = phase.status === "right" ? q.explain : `答えは「${ACT_LABEL[q.expect]}」${size}だよ。\n${q.explain}`;
    return { table, text, badge: "best", bottom: <BackNext label="次へ" onNext={onNext} onBack={onBack} /> };
  }
  if (phase.status === "wrong") {
    return {
      table,
      text: `ちがうよ。\n${q.hint}`,
      badge: "blunder",
      bottom: (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => set("shown")}
            className="pressable-lg h-14 rounded-2xl bg-white/[0.06] text-[15px] font-black text-fg ring-1 ring-white/10"
          >
            答えを見る
          </button>
          <button
            type="button"
            onClick={() => set("ask")}
            className="pressable-lg h-14 rounded-2xl bg-accent text-[15px] font-black text-on-accent shadow-glow"
          >
            もう一度解く
          </button>
        </div>
      ),
    };
  }
  const bar = spotBar(t.state);
  const onAction = (a: PlayerAction) => {
    const to = "toAmount" in a ? (a.toAmount ?? 0) : 0;
    const isAllIn = a.kind === "allIn" || ((a.kind === "raise" || a.kind === "bet") && to >= bar.maxRaiseTo);
    let ok: boolean;
    if (q.expect === "allIn") ok = isAllIn;
    else if (q.expect === "raise" || q.expect === "bet") {
      ok = (a.kind === "raise" || a.kind === "bet") && !isAllIn;
      if (ok && q.size) ok = to / BB >= q.size[0] - 1e-9 && to / BB <= q.size[1] + 1e-9;
    } else ok = a.kind === q.expect;
    if (ok) set("right");
    else {
      onMiss(at);
      set("wrong");
    }
  };
  return {
    table,
    text: q.prompt,
    bottom: (
      <ActionBar
        isYourTurn
        street={t.state.street}
        canCheck={bar.toCall <= 0}
        toCall={bar.toCall}
        minRaiseToAmount={bar.minRaiseTo}
        maxRaiseToAmount={bar.maxRaiseTo}
        potTotal={t.state.potTotal}
        streetContribution={bar.streetContribution}
        canRaise
        bigBlind={BB}
        effectiveStackBehind={bar.effective}
        onAction={onAction}
        away={false}
        onToggleAway={() => {}}
        checkFoldArmed={false}
        onToggleCheckFold={() => {}}
      />
    ),
  };
}
