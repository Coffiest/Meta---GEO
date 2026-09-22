import { describe, expect, it } from "vitest";
import { Tournament } from "../src/tournament.js";

describe("Tournament", () => {
  it("rotates the button across hands and eliminates busted players", () => {
    const tournament = new Tournament({
      seatCount: 6,
      players: [
        { playerId: "P0", displayName: "P0", seatIndex: 0 },
        { playerId: "P1", displayName: "P1", seatIndex: 1 },
        { playerId: "P2", displayName: "P2", seatIndex: 2 },
      ],
      startingStack: 20_000,
    });

    const hand1 = tournament.startNextHand();
    const firstEvent = tournament.getEvents()[0]!;
    expect(firstEvent.type).toBe("handStarted");
    expect(hand1.getStreet()).toBe("preflop");

    // Fold everyone to the big blind seat to keep this test deterministic.
    while (!hand1.isHandComplete()) {
      const acting = hand1.getActingSeatIndex();
      if (acting === null) break;
      hand1.applyAction(acting, { kind: "fold" });
    }
    tournament.settleFinishedHand();

    const seatsAfterHand1 = tournament.getSeats();
    const totalChips = seatsAfterHand1.reduce((sum, s) => sum + s.stack, 0);
    expect(totalChips).toBe(60_000);

    const hand2 = tournament.startNextHand();
    expect(hand2.getStreet()).toBe("preflop");
    // Button should have moved from the first hand's button.
    const events = tournament.getEvents();
    const started = events.filter((e) => e.type === "handStarted");
    expect(started).toHaveLength(2);
    expect(started[1]!.buttonFixedPos).not.toBe(started[0]!.buttonFixedPos);
  });

  /**
   * 「BBを飛ばして逃げている人・2回払っている人がいる」「BTNが一生回ってこない人がいる」という
   * 不具合の再発防止。実際にハンドを回し、handStartedイベントの列で検証する。
   */
  it("rotates blinds and the button fairly across a whole tournament", () => {
    const tournament = new Tournament({
      seatCount: 6,
      players: [0, 1, 2, 3, 4, 5].map((i) => ({ playerId: `P${i}`, displayName: `P${i}`, seatIndex: i })),
      startingStack: 3_000, // ブラインドで少しずつ削られ、やがてバストが出る大きさ
    });

    let guard = 0;
    while (!tournament.isTournamentOver() && guard < 300) {
      guard++;
      if (guard % 8 === 0) tournament.advanceToNextLevel(); // ブラインドを上げてバストを起こす
      const hand = tournament.startNextHand();
      // 全員BBまでフォールド(BBが勝つ)。こうするとブラインド徴収だけでスタックが動き、
      // バーストが自然に発生する。
      while (!hand.isHandComplete()) {
        const acting = hand.getActingSeatIndex();
        if (acting === null) break;
        try {
          hand.applyAction(acting, { kind: "fold" });
        } catch {
          hand.applyAction(acting, { kind: "check" });
        }
      }
      tournament.settleFinishedHand();
    }
    expect(tournament.isTournamentOver()).toBe(true);

    const started = tournament.getEvents().filter((e) => e.type === "handStarted");
    expect(started.length).toBeGreaterThan(10);

    // 1) 同じ席が2ハンド連続でBBを払わない。
    for (let i = 1; i < started.length; i++) {
      expect(started[i]!.bigBlindSeat).not.toBe(started[i - 1]!.bigBlindSeat);
    }

    // 2) BBはその時点の生存者を1人ずつ順に舐める。ある席がBBになってから次にBBになるまでの間に、
    //    その間ずっと生存していた席は必ず1回はBBになっている(=BBを飛ばして逃げられない)。
    for (const seat of [0, 1, 2, 3, 4, 5]) {
      const bbHands = started.map((e, i) => (e.bigBlindSeat === seat ? i : -1)).filter((i) => i >= 0);
      for (let k = 1; k < bbHands.length; k++) {
        const gap = bbHands[k]! - bbHands[k - 1]!;
        // 6人卓なら間隔は最大6。人数が減れば短くなる。1周を超えて飛ばされることは無い。
        expect(gap).toBeLessThanOrEqual(6);
      }
    }

    // 3) BTNも同じ周期で全員に回る。最初の1周(6ハンド)で6席すべてがBTNになる。
    const firstOrbitButtons = started.slice(0, 6).map((e) => e.buttonFixedPos);
    expect([...new Set(firstOrbitButtons)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("declares a winner once only one seat has chips left", () => {
    const tournament = new Tournament({
      seatCount: 6,
      players: [
        { playerId: "P0", displayName: "P0", seatIndex: 0 },
        { playerId: "P1", displayName: "P1", seatIndex: 1 },
      ],
      startingStack: 300, // small enough that a few forced all-ins end it quickly
    });

    let guard = 0;
    while (!tournament.isTournamentOver() && guard < 50) {
      guard++;
      const hand = tournament.startNextHand();
      // Push all-in every time to force a fast conclusion between two shrinking stacks.
      while (!hand.isHandComplete()) {
        const acting = hand.getActingSeatIndex();
        if (acting === null) break;
        try {
          hand.applyAction(acting, { kind: "allIn" });
        } catch {
          hand.applyAction(acting, { kind: "call" });
        }
      }
      tournament.settleFinishedHand();
    }

    expect(tournament.isTournamentOver()).toBe(true);
    expect(tournament.getWinnerPlayerId()).not.toBeNull();
    const winnerId = tournament.getWinnerPlayerId()!;
    const winnerSeat = tournament.getSeats().find((s) => s.playerId === winnerId)!;
    expect(winnerSeat.stack).toBe(600);
  });

  it("forceEliminate immediately busts a seat instead of letting it survive by folding", () => {
    const tournament = new Tournament({
      seatCount: 6,
      players: [
        { playerId: "P0", displayName: "P0", seatIndex: 0 },
        { playerId: "P1", displayName: "P1", seatIndex: 1 },
        { playerId: "P2", displayName: "P2", seatIndex: 2 },
      ],
      startingStack: 20_000,
    });

    // P1が離脱: 即バスト扱いになり、以降occupiedSeats(=次のハンドの対象)から外れる。
    tournament.forceEliminate(1);
    const seat1 = tournament.getSeats().find((s) => s.playerId === "P1")!;
    expect(seat1.bustedAtHand).not.toBeNull();

    const hand = tournament.startNextHand();
    expect(hand.getPublicState().seats.some((s) => s.seatIndex === 1)).toBe(false);

    // 既にバスト済みの席へ再度呼んでも上書きしない(handNumberが進んでも値は変わらない)。
    const bustedAtHandBefore = seat1.bustedAtHand;
    tournament.forceEliminate(1);
    expect(seat1.bustedAtHand).toBe(bustedAtHandBefore);
  });
});
