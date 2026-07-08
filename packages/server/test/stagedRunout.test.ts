import { afterEach, describe, expect, it, vi } from "vitest";
import { HandEngine, createOrderedDeck, type Card, type PublicHandState } from "@meta-geo/engine";
import { RUNOUT_STREET_PAUSE_MS, SHOWDOWN_TABLE_PAUSE_MS, scheduleStagedRunout } from "../src/gameServer.js";

/**
 * オールインコール成立時の公開順(TDAルール16)の検証:
 * 「先にショウダウン(手札のテーブルアップ)→ ストリートごとにボード公開 → 結果処理」。
 */

/** ヘッズアップで両者オールインになり、エンジンがボードを一括ランナウトした完了ハンドを作る */
function completedAllInHand(): HandEngine {
  const engine = new HandEngine({
    seats: [
      { seatIndex: 0, playerId: "P0", stack: 5000 },
      { seatIndex: 1, playerId: "P1", stack: 5000 },
    ],
    seatCount: 2,
    buttonFixedPos: 0,
    smallBlindSeat: 0,
    bigBlindSeat: 1,
    smallBlind: 50,
    bigBlind: 100,
    bbAnte: 0,
    deck: createOrderedDeck(),
  });

  // ヘッズアップはSB(=ボタン)が先にアクション。プリフロップで両者オールイン。
  engine.applyAction(0, { kind: "raise", toAmount: 5000 });
  engine.applyAction(1, { kind: "call" });
  expect(engine.isHandComplete()).toBe(true);
  expect(engine.getPublicState().board.length).toBe(5);
  return engine;
}

interface RecordedEvent {
  type: "state" | "showdown" | "done";
  boardLen?: number;
  isComplete?: boolean;
  revealedSeats?: number[];
}

function record(events: RecordedEvent[]) {
  return {
    emitState: (state: PublicHandState) =>
      events.push({ type: "state" as const, boardLen: state.board.length, isComplete: state.isComplete }),
    emitShowdown: (holeCards: Record<number, string[]>) =>
      events.push({ type: "showdown" as const, revealedSeats: Object.keys(holeCards).map(Number).sort() }),
    onDone: () => events.push({ type: "done" as const }),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("scheduleStagedRunout", () => {
  it("tables all hands first, then reveals flop/turn/river street by street, then finishes", () => {
    vi.useFakeTimers();
    const hand = completedAllInHand();
    const events: RecordedEvent[] = [];

    scheduleStagedRunout({ hand, boardLenBefore: 0, isStillCurrent: () => true, ...record(events) });

    // 即時: ボード0枚のままショウダウン(両者の手札公開)。ボードはまだ開かない。
    expect(events).toEqual([
      { type: "state", boardLen: 0, isComplete: false },
      { type: "showdown", revealedSeats: [0, 1] },
    ]);

    vi.advanceTimersByTime(SHOWDOWN_TABLE_PAUSE_MS);
    expect(events.at(-1)).toEqual({ type: "state", boardLen: 3, isComplete: false });

    vi.advanceTimersByTime(RUNOUT_STREET_PAUSE_MS);
    expect(events.at(-1)).toEqual({ type: "state", boardLen: 4, isComplete: false });

    vi.advanceTimersByTime(RUNOUT_STREET_PAUSE_MS);
    expect(events.at(-1)).toEqual({ type: "state", boardLen: 5, isComplete: false });

    // 最後に結果処理(handEnded送信側)へ進む
    vi.advanceTimersByTime(RUNOUT_STREET_PAUSE_MS);
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(events.filter((e) => e.type === "state").map((e) => e.boardLen)).toEqual([0, 3, 4, 5]);
  });

  it("only reveals the remaining streets when the all-in happens on the turn", () => {
    vi.useFakeTimers();
    const hand = completedAllInHand();
    const events: RecordedEvent[] = [];

    // ターンまで開いた状態(ボード4枚)でオールインコールが成立したケース
    scheduleStagedRunout({ hand, boardLenBefore: 4, isStillCurrent: () => true, ...record(events) });

    expect(events.map((e) => e.type)).toEqual(["state", "showdown"]);
    expect(events[0]).toEqual({ type: "state", boardLen: 4, isComplete: false });

    vi.advanceTimersByTime(SHOWDOWN_TABLE_PAUSE_MS);
    expect(events.at(-1)).toEqual({ type: "state", boardLen: 5, isComplete: false });

    vi.advanceTimersByTime(RUNOUT_STREET_PAUSE_MS);
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("stops emitting when the session has moved on (isStillCurrent=false)", () => {
    vi.useFakeTimers();
    const hand = completedAllInHand();
    const events: RecordedEvent[] = [];
    let current = true;

    scheduleStagedRunout({ hand, boardLenBefore: 0, isStillCurrent: () => current, ...record(events) });
    current = false;
    vi.advanceTimersByTime(SHOWDOWN_TABLE_PAUSE_MS + RUNOUT_STREET_PAUSE_MS * 5);

    // 即時分(ショウダウン)以降は何も配信されない
    expect(events.map((e) => e.type)).toEqual(["state", "showdown"]);
  });
});
