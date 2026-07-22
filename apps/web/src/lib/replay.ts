import type { PublicHandState, PublicSeatState, Street } from "@meta-geo/engine";
// 値のimportはindex(node:crypto依存のdeck.tsを含む)を経由せず、deep pathで行う(webバンドル対策)。
import { parseCard, type Card } from "@meta-geo/engine/src/types/card.js";
import type { SeatAction, SeatPlayerInfo } from "./socket";
import type { ReviewedDecision, ReviewHandTimeline, TournamentReviewHand } from "./reviewApi";

/**
 * 棋譜解析のテーブル通し再生エンジン。
 * 保存済みタイムライン(全席のスタック/ホールカード + 全アクションの toAmount/potBefore)から、
 * 各アクション適用後の PublicHandState スナップショットを純関数で再構築する。
 * PokerTable はプレゼンテーション専用コンポーネントなので、このスナップショットを渡すだけで
 * ライブと同じ見た目の盤面が再生できる。
 */

export type ReplayStep =
  | {
      type: "handStart";
      handId: string;
      handNumber: number;
      smallBlind: number;
      bigBlind: number;
      ante: number;
      heroCards: string[];
      /** ブラインド/アンテだけ投入された開始時点の盤面。 */
      snapshot: PublicHandState;
    }
  | {
      type: "action";
      handId: string;
      handNumber: number;
      sequenceNumber: number;
      /** このアクション適用後の盤面。 */
      snapshot: PublicHandState;
      actorSeat: number;
      actorIsHero: boolean;
      seatAction: SeatAction;
      actionKind: string;
      street: string;
      /** heroの意思決定ならその分類結果。 */
      decision: ReviewedDecision | null;
    };

export interface TournamentReplay {
  steps: ReplayStep[];
  /** バーにピン留めするステップ(? / ?? / !!)。 */
  pins: { stepIndex: number; classification: string }[];
  /** 各ハンドの先頭ステップindex(区切りカード)。 */
  handStartIndices: Record<string, number>;
  /** seq→stepIndex(ワースト/ベストのジャンプ用)。key = `${handId}:${sequenceNumber}` */
  stepIndexByDecision: Record<string, number>;
}

const STREET_BOARD_LEN: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

function boardFor(street: string, board: string[]): readonly Card[] {
  const n = STREET_BOARD_LEN[street] ?? 0;
  return board
    .slice(0, n)
    .map((c) => parseCard(c))
    .filter((c): c is Card => c !== null);
}

/** 1ハンドのタイムラインをステップ列へ畳み込む。 */
function buildHandSteps(hand: TournamentReviewHand, heroUserId: string): ReplayStep[] {
  const t = hand.timeline;
  const heroSeatEntry = t.seats.find((s) => s.userId === heroUserId);
  const heroSeat = heroSeatEntry?.seatIndex ?? -1;
  // hero + 全プレイヤー(villain)の決定を1つのマップに統合(再生の各アクションに評価バッジを付ける)。
  const decisionBySeq = new Map<number, ReviewedDecision>();
  for (const d of hand.decisions) decisionBySeq.set(d.sequenceNumber, d);
  for (const d of hand.villainDecisions) decisionBySeq.set(d.sequenceNumber, d);

  // 席ごとの畳み込み状態。
  const stack = new Map<number, number>();
  const streetContribution = new Map<number, number>();
  const handContribution = new Map<number, number>();
  const status = new Map<number, "active" | "folded" | "allIn">();
  for (const s of t.seats) {
    stack.set(s.seatIndex, s.startingStack);
    streetContribution.set(s.seatIndex, 0);
    handContribution.set(s.seatIndex, 0);
    status.set(s.seatIndex, "active");
  }
  let currentStreet = "preflop";
  let potSoFar = 0; // 現時点の総ポット(全席のhand+street拠出合計)

  // ポジション表示用のSB/BB席。記録されたpostBlindアクションの額から特定する
  // (SBデッドのハンドではlevelSmallBlind額のpostBlindが存在せずnullになる)。
  const smallBlindSeat =
    t.actions.find((a) => a.kind === "postBlind" && a.toAmount === t.levelSmallBlind)?.seatIndex ?? null;
  const bigBlindSeat =
    t.actions.find((a) => a.kind === "postBlind" && a.toAmount === t.levelBigBlind)?.seatIndex ??
    t.seats[0]?.seatIndex ??
    0;

  function snapshot(street: string, actingSeatIndex: number | null): PublicHandState {
    const seats: PublicSeatState[] = t.seats.map((s) => ({
      seatIndex: s.seatIndex,
      playerId: s.userId,
      stack: stack.get(s.seatIndex) ?? 0,
      status: status.get(s.seatIndex) ?? "active",
      streetContribution: streetContribution.get(s.seatIndex) ?? 0,
      handContribution: handContribution.get(s.seatIndex) ?? 0,
      hasActedThisStreet: false,
    }));
    const streetTotal = [...streetContribution.values()].reduce((a, b) => a + b, 0);
    return {
      street: street as Street,
      board: boardFor(street, t.board),
      potTotal: potSoFar,
      currentBetToMatch: Math.max(0, ...[...streetContribution.values()]),
      lastFullRaiseSize: 0,
      actingSeatIndex,
      buttonFixedPos: t.buttonFixedPos,
      smallBlindSeat,
      bigBlindSeat,
      collectedPot: Math.max(0, potSoFar - streetTotal),
      pots: [],
      seats,
      isComplete: false,
      bigBlind: t.levelBigBlind,
    };
  }

  /** 席の現ストリート拠出を toAmount(累計) に更新し、差分をスタック/ポットへ反映する。 */
  function commit(seatIndex: number, toAmount: number) {
    const prev = streetContribution.get(seatIndex) ?? 0;
    const delta = Math.max(0, toAmount - prev);
    streetContribution.set(seatIndex, Math.max(prev, toAmount));
    stack.set(seatIndex, Math.max(0, (stack.get(seatIndex) ?? 0) - delta));
    potSoFar += delta;
  }

  const steps: ReplayStep[] = [];

  for (const a of t.actions) {
    // ストリート遷移: 現ストリート拠出をハンド拠出へ繰り込む。
    if (a.street !== currentStreet) {
      for (const s of t.seats) {
        const sc = streetContribution.get(s.seatIndex) ?? 0;
        handContribution.set(s.seatIndex, (handContribution.get(s.seatIndex) ?? 0) + sc);
        streetContribution.set(s.seatIndex, 0);
      }
      currentStreet = a.street;
    }

    if (a.kind === "postBlind") {
      commit(a.seatIndex, (streetContribution.get(a.seatIndex) ?? 0) + (a.toAmount ?? 0));
      continue;
    }
    if (a.kind === "postAnte") {
      // アンテはストリート拠出ではなくハンド拠出として直接ポットへ。
      const amt = a.toAmount ?? 0;
      handContribution.set(a.seatIndex, (handContribution.get(a.seatIndex) ?? 0) + amt);
      stack.set(a.seatIndex, Math.max(0, (stack.get(a.seatIndex) ?? 0) - amt));
      potSoFar += amt;
      continue;
    }

    // ブラインド/アンテ投入が終わった最初の実アクションの直前に、区切りカード(開始盤面)を挟む。
    if (steps.length === 0) {
      steps.push({
        type: "handStart",
        handId: hand.handId,
        handNumber: hand.handNumber,
        smallBlind: t.levelSmallBlind,
        bigBlind: t.levelBigBlind,
        ante: t.levelAnte,
        heroCards: heroSeatEntry?.holeCards ?? [],
        snapshot: snapshot("preflop", a.seatIndex),
      });
    }

    // 実アクションの適用。
    const prevStreetContribution = streetContribution.get(a.seatIndex) ?? 0;
    if (a.kind === "fold") {
      status.set(a.seatIndex, "folded");
    } else if (a.toAmount !== null) {
      commit(a.seatIndex, a.toAmount);
      if (a.kind === "allIn" || (stack.get(a.seatIndex) ?? 0) <= 0) status.set(a.seatIndex, "allIn");
    }

    const seatAction: SeatAction = {
      kind: (a.kind === "bet" || a.kind === "raise" || a.kind === "call" || a.kind === "check" || a.kind === "fold" || a.kind === "allIn"
        ? a.kind
        : "check") as SeatAction["kind"],
      toAmount: a.toAmount ?? prevStreetContribution,
    };

    steps.push({
      type: "action",
      handId: hand.handId,
      handNumber: hand.handNumber,
      sequenceNumber: a.sequenceNumber,
      snapshot: snapshot(currentStreet, a.seatIndex),
      actorSeat: a.seatIndex,
      actorIsHero: a.seatIndex === heroSeat,
      seatAction,
      actionKind: a.kind,
      street: a.street,
      // hero/villain問わず、そのアクションの評価(あれば)を付ける。
      decision: decisionBySeq.get(a.sequenceNumber) ?? null,
    });
  }

  return steps;
}

/** トナメ全体のハンド列から通し再生のステップ列とピンを構築する。 */
export function buildTournamentReplay(hands: TournamentReviewHand[], heroUserId: string): TournamentReplay {
  const steps: ReplayStep[] = [];
  const pins: { stepIndex: number; classification: string }[] = [];
  const handStartIndices: Record<string, number> = {};
  const stepIndexByDecision: Record<string, number> = {};

  for (const hand of hands) {
    const handSteps = buildHandSteps(hand, heroUserId);
    for (const step of handSteps) {
      const idx = steps.length;
      if (step.type === "handStart") {
        handStartIndices[step.handId] = idx;
      } else {
        stepIndexByDecision[`${step.handId}:${step.sequenceNumber}`] = idx;
        const c = step.decision?.classification;
        // ピン(シークバーのマーカー)は ? / ?? / !! のみ、かつ hero(自分)の決定だけ(全員入れると煩雑)。
        if (step.actorIsHero && (c === "mistake" || c === "blunder" || c === "artistic")) {
          pins.push({ stepIndex: idx, classification: c });
        }
      }
      steps.push(step);
    }
  }

  return { steps, pins, handStartIndices, stepIndexByDecision };
}

/** 再生テーブル用の SeatPlayerInfo マップを合成する。 */
export function playersFromTimeline(timeline: ReviewHandTimeline): Record<number, SeatPlayerInfo> {
  const out: Record<number, SeatPlayerInfo> = {};
  for (const s of timeline.seats) {
    out[s.seatIndex] = {
      userId: s.userId,
      displayName: s.displayName,
      avatarKey: s.avatarKey,
      isBot: false,
      away: false,
    };
  }
  return out;
}

/** 再生テーブル用の全席ホールカード公開マップ。 */
export function revealedFromTimeline(timeline: ReviewHandTimeline): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  for (const s of timeline.seats) {
    if (s.holeCards.length === 2) out[s.seatIndex] = s.holeCards;
  }
  return out;
}
