import { describe, expect, it } from "vitest";
import { Tournament, type HandStartedEvent } from "../src/tournament.js";
import type { HandEngine } from "../src/handEngine.js";

/** 全員が BB まで降りてハンドを終える(ブラインドの位置だけを見るテスト用)。 */
function foldAround(hand: HandEngine): void {
  while (!hand.isHandComplete()) {
    const acting = hand.getActingSeatIndex();
    if (acting === null) break;
    hand.applyAction(acting, { kind: "fold" });
  }
}

function lastStarted(t: Tournament): HandStartedEvent {
  return [...t.getEvents()].reverse().find((e) => e.type === "handStarted") as HandStartedEvent;
}

function dealtSeats(hand: HandEngine): number[] {
  return hand.getPublicState().seats.map((s) => s.seatIndex).sort((a, b) => a - b);
}

function playHand(t: Tournament): { hand: HandEngine; started: HandStartedEvent } {
  const hand = t.startNextHand();
  const started = lastStarted(t);
  foldAround(hand);
  t.settleFinishedHand();
  return { hand, started };
}

const players = (seats: number[]) => seats.map((i) => ({ playerId: `P${i}`, displayName: `P${i}`, seatIndex: i }));

describe("途中から座る人(TDA)", () => {
  // 席 0,2,4 の3人。1ハンド目は 席0=BB(席番号の最も小さい人)/ ボタン=席2 / SB=席4。
  // 2ハンド目は BB=席2 / SB=席0 / ボタン=席4。
  it("ボタンと SB の間に座った人は1回休み、ボタンが通り過ぎてから配られる", () => {
    const t = new Tournament({ seatCount: 6, players: players([0, 2, 4]), startingStack: 20_000 });
    const h1 = playHand(t);
    expect([h1.started.buttonFixedPos, h1.started.smallBlindSeat, h1.started.bigBlindSeat]).toEqual([2, 4, 0]);

    // 次のハンドはボタン=席4・SB=席0。その間の席5に座る。
    t.addPlayer({ playerId: "NEW", displayName: "NEW", seatIndex: 5 });
    const h2 = playHand(t);
    expect([h2.started.buttonFixedPos, h2.started.smallBlindSeat, h2.started.bigBlindSeat]).toEqual([4, 0, 2]);
    expect(dealtSeats(h2.hand)).toEqual([0, 2, 4]);
    expect(t.getWaitingSeats()).toEqual([5]);

    // ボタンが席0へ進んだので、席5はボタンの右隣として配られる。ブラインドの流れは変わらない。
    const h3 = playHand(t);
    expect([h3.started.buttonFixedPos, h3.started.smallBlindSeat, h3.started.bigBlindSeat]).toEqual([0, 2, 4]);
    expect(dealtSeats(h3.hand)).toEqual([0, 2, 4, 5]);
    expect(t.getWaitingSeats()).toEqual([]);

    // BB は次に席5へ回ってくる(誰も BB を飛ばさない)。
    const h4 = playHand(t);
    expect(h4.started.bigBlindSeat).toBe(5);
  });

  it("次の BB の位置に座った人は、そのまま BB で入れる(BB イン)", () => {
    const t = new Tournament({ seatCount: 6, players: players([0, 2, 4]), startingStack: 20_000 });
    playHand(t); // BB=席0
    // 次の BB は前の BB(席0)の次の生存者。席1に座れば、その人が BB になる。
    t.addPlayer({ playerId: "NEW", displayName: "NEW", seatIndex: 1 });
    const h2 = playHand(t);
    expect(dealtSeats(h2.hand)).toEqual([0, 1, 2, 4]);
    expect(h2.started.bigBlindSeat).toBe(1);
    // SB とボタンは誰も来なかったときと同じ(SB=前の BB の席0、ボタン=前の SB の席4)。
    expect(h2.started.smallBlindSeat).toBe(0);
    expect(h2.started.buttonFixedPos).toBe(4);
  });

  it("BB の後ろ(ボタンより前)に座った人は、すぐ配られる", () => {
    const t = new Tournament({ seatCount: 6, players: players([0, 2, 4]), startingStack: 20_000 });
    playHand(t); // 次: ボタン=4 / SB=0 / BB=2
    t.addPlayer({ playerId: "NEW", displayName: "NEW", seatIndex: 3 });
    const h2 = playHand(t);
    expect(dealtSeats(h2.hand)).toEqual([0, 2, 3, 4]);
    expect([h2.started.buttonFixedPos, h2.started.smallBlindSeat, h2.started.bigBlindSeat]).toEqual([4, 0, 2]);
  });

  it("来たばかりの人が SB になることはない(どの席に座っても)", () => {
    for (const newSeat of [1, 3, 5]) {
      const t = new Tournament({ seatCount: 6, players: players([0, 2, 4]), startingStack: 20_000 });
      playHand(t);
      t.addPlayer({ playerId: "NEW", displayName: "NEW", seatIndex: newSeat });
      // 配られた最初のハンドで SB でないことを確かめる。
      for (let i = 0; i < 3; i++) {
        const { hand, started } = playHand(t);
        if (dealtSeats(hand).includes(newSeat)) {
          expect(started.smallBlindSeat).not.toBe(newSeat);
          break;
        }
      }
    }
  });

  it("ヘッズアップに3人目が来ても、ボタンと BB がぶつからない", () => {
    const t = new Tournament({ seatCount: 6, players: players([0, 3]), startingStack: 20_000 });
    playHand(t);
    for (const seat of [1, 2, 4, 5]) {
      if (t.getSeats().some((s) => s.seatIndex === seat)) continue;
      t.addPlayer({ playerId: `N${seat}`, displayName: `N${seat}`, seatIndex: seat });
      const { started } = playHand(t);
      expect(started.buttonFixedPos).not.toBe(started.bigBlindSeat);
      expect(started.smallBlindSeat).not.toBe(started.bigBlindSeat);
      break;
    }
  });

  it("バストした人の席にリエントリーでき、前の参加は記録に残る", () => {
    const t = new Tournament({ seatCount: 6, players: players([0, 1, 2]), startingStack: 20_000 });
    playHand(t);
    t.forceEliminate(1);
    t.addPlayer({ playerId: "P1", displayName: "P1", seatIndex: 1 });
    expect(t.getRetiredEntries().map((s) => s.playerId)).toEqual(["P1"]);
    expect(t.getSeats().find((s) => s.seatIndex === 1)?.stack).toBe(20_000);
    expect(() => t.addPlayer({ playerId: "X", displayName: "X", seatIndex: 0 })).toThrow();
  });

  it("1ハンド目のボタンは乱数で決まる(どの席も BB になりうる)", () => {
    const bbs = new Set<number>();
    for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.99]) {
      const t = new Tournament({ seatCount: 6, players: players([0, 1, 2, 3, 4, 5]), startingStack: 20_000, random: () => r });
      t.startNextHand();
      const s = lastStarted(t);
      bbs.add(s.bigBlindSeat);
      // 並びは常にボタン → SB → BB。
      expect(s.smallBlindSeat).toBe((s.bigBlindSeat + 5) % 6);
      expect(s.buttonFixedPos).toBe((s.bigBlindSeat + 4) % 6);
    }
    expect(bbs.size).toBe(6);

    const hu = new Tournament({ seatCount: 6, players: players([1, 4]), startingStack: 20_000, random: () => 0.7 });
    hu.startNextHand();
    const s = lastStarted(hu);
    expect(s.buttonFixedPos).toBe(s.smallBlindSeat);
    expect(s.bigBlindSeat).not.toBe(s.buttonFixedPos);
  });
});
