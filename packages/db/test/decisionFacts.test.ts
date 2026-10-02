import { describe, expect, it } from "vitest";
import {
  bigPotKindOf,
  buildDecisionFacts,
  thinkBucketOf,
  type FactAction,
  type FactHandInput,
} from "../src/decisionFacts.js";

/**
 * 研究用の「1アクション = 1行」を作る純関数のテスト(DB不要)。
 * 6人卓・ボタン0。BTN(0)がレイズ、BB(2)がコール、フロップで BB チェック → BTN ベット → BB フォールド。
 */

let seq = 0;
function act(seatIndex: number, street: string, kind: string, toAmount: number | null, potBefore: number, over: Partial<FactAction> = {}): FactAction {
  seq += 1;
  return { sequenceNumber: seq, seatIndex, street, kind, toAmount, potBefore, thinkMs: null, timedOut: false, timeBankUsed: false, ...over };
}

function hand(over: Partial<FactHandInput> = {}): FactHandInput {
  seq = 0;
  const actions = [
    act(1, "preflop", "postBlind", 50, 0),
    act(2, "preflop", "postBlind", 100, 50),
    act(3, "preflop", "fold", null, 150, { thinkMs: 800 }),
    act(4, "preflop", "fold", null, 150, { thinkMs: 1200 }),
    act(5, "preflop", "fold", null, 150, { timedOut: true, thinkMs: 20000 }),
    act(0, "preflop", "raise", 250, 150, { thinkMs: 3500 }),
    act(1, "preflop", "fold", null, 400, { thinkMs: 600 }),
    act(2, "preflop", "call", 250, 400, { thinkMs: 7000 }),
    act(2, "flop", "check", null, 550, { thinkMs: 1500 }),
    act(0, "flop", "bet", 180, 550, { thinkMs: 25000, timeBankUsed: true }),
    act(2, "flop", "fold", null, 730, { thinkMs: 4000 }),
  ];
  return {
    id: "h1",
    tournamentId: "t1",
    gameType: "sng",
    handNumber: 10,
    buttonFixedPos: 0,
    bigBlind: 100,
    board: ["Kd", "7c", "2h"],
    wonByFold: true,
    startedAt: new Date("2026-10-01T00:10:00Z"),
    tournamentCreatedAt: new Date("2026-10-01T00:00:00Z"),
    tournamentStartingStack: 5000,
    playersRemaining: 3,
    payouts: [4000, 2000],
    fieldStacks: [5000, 3000, 2000],
    seats: [
      { seatIndex: 0, userId: "u0", isBot: false, startingStack: 5000, holeCards: ["As", "Kh"], isSmallBlind: false, isBigBlind: false, resultStackDelta: 250 },
      { seatIndex: 1, userId: "u1", isBot: true, startingStack: 2000, holeCards: ["7d", "2c"], isSmallBlind: true, isBigBlind: false, resultStackDelta: -50 },
      { seatIndex: 2, userId: "u2", isBot: false, startingStack: 3000, holeCards: ["Qh", "Jh"], isSmallBlind: false, isBigBlind: true, resultStackDelta: -250 },
    ],
    actions,
    potWinners: [["u0"]],
    history: new Map([
      ["u0", [{ handNumber: 9, startingStack: 2500, resultStackDelta: 2500, bigBlind: 100 }]],
      ["u2", [
        { handNumber: 9, startingStack: 6000, resultStackDelta: -3000, bigBlind: 100 },
        { handNumber: 8, startingStack: 6100, resultStackDelta: -100, bigBlind: 100 },
      ]],
    ]),
    ...over,
  };
}

describe("buildDecisionFacts", () => {
  const rows = buildDecisionFacts(hand());
  const bySeq = new Map(rows.map((r) => [r.sequenceNumber, r]));

  it("ブラインド/アンティの支払いは行にしない。決定だけを行にする", () => {
    expect(rows.every((r) => r.kind !== "postBlind" && r.kind !== "postAnte")).toBe(true);
    // 人間(u0, u2)の決定だけが行になる。自動で卓を埋めるプレイヤー(u1)の行は作らない(どこからも読まれないため)。
    expect(rows.map((r) => r.userId).sort()).toEqual(["u0", "u0", "u2", "u2", "u2"]);
  });

  it("思考時間・時間切れ・タイムバンクの帯", () => {
    expect(thinkBucketOf(1500, false, false)).toBe("0-2s");
    expect(thinkBucketOf(25000, false, true)).toBe("timebank");
    expect(thinkBucketOf(20000, true, false)).toBe("timeout");
    expect(bySeq.get(6)).toMatchObject({ kind: "raise", thinkMs: 3500, thinkBucket: "2-5s", position: "BTN", actionClass: "aggressive" });
    expect(bySeq.get(10)).toMatchObject({ thinkBucket: "timebank", timeBankUsed: true });
  });

  it("自動で卓を埋めるプレイヤーの行は作らないが、その決定はポットや直面額には反映される", () => {
    expect(bySeq.get(7)).toBeUndefined();
    // u1(SB)のフォールドのあと、BB(u2)のコールの直面額・ポットは正しいまま。
    expect(bySeq.get(8)).toMatchObject({ facingBb: 1.5, potBb: 4 });
  });

  it("直面額・ポット・スタック・サイズを、その時点の値で読む", () => {
    // BB のコール: 250 まで → 直面額は 250 − 100 = 150 = 1.5bb。
    expect(bySeq.get(8)).toMatchObject({ facingBb: 1.5, potBb: 4, stackBb: 29, position: "BB" });
    // フロップの BTN のベット 180 / ポット 550。
    expect(bySeq.get(10)!.betSizePot).toBeCloseTo(0.327, 3);
    expect(bySeq.get(10)).toMatchObject({ betSizeBucket: "<33%", madeHand: "topPair", spot: "cbet" });
  });

  it("VPIP / PFR とハンドの最初の行", () => {
    expect(bySeq.get(6)).toMatchObject({ firstInHand: true, handVpip: true, handPfr: true });
    expect(bySeq.get(10)).toMatchObject({ firstInHand: false });
    expect(bySeq.get(8)).toMatchObject({ handVpip: true, handPfr: false });
  });

  it("トーナメント: 優勝率=チップ比、インマネ率は ICM、バブル段階", () => {
    expect(bySeq.get(6)).toMatchObject({ winProb: 0.5, stackRank: 1, bubbleDistance: 1, bubbleStage: "bubble", itmPlaces: 2 });
    expect(bySeq.get(6)!.itmProb).toBeGreaterThan(0.8);
    expect(bySeq.get(6)!.winProbBucket).toBe("50%+");
  });

  it("直前の流れ: 大きいポットを取った/落とした・連敗・何ハンド目", () => {
    expect(bySeq.get(6)).toMatchObject({ prevBigPot: "bigWin", lastBigPotKind: "win", handsSinceBigPot: 1, handIndexInTournament: 2 });
    expect(bySeq.get(8)).toMatchObject({ prevBigPot: "bigLoss", lossStreak: 2, prevHandDeltaBb: -30 });
    expect(bySeq.get(6)).toMatchObject({ minutesIntoTournament: 10, stackVsStart: 1 });
  });

  it("結果: 収支(bb)・ポット獲得・ショーダウン", () => {
    expect(bySeq.get(6)).toMatchObject({ handResultBb: 2.5, wonHand: true, wentToShowdown: false });
    expect(bySeq.get(11)).toMatchObject({ handResultBb: -2.5, wonHand: false });
  });

  it("大きいポットの判定: スタックの半分以上か 20bb 以上", () => {
    expect(bigPotKindOf({ handNumber: 1, startingStack: 10000, resultStackDelta: 2000, bigBlind: 100 })).toBe("win");
    expect(bigPotKindOf({ handNumber: 1, startingStack: 10000, resultStackDelta: -1500, bigBlind: 100 })).toBeNull();
    expect(bigPotKindOf({ handNumber: 1, startingStack: 1000, resultStackDelta: -600, bigBlind: 100 })).toBe("loss");
  });

  it("研究用の状況が無い古いハンドでも行は作れる(値は null / unknown)", () => {
    const old = buildDecisionFacts(hand({ startedAt: null, playersRemaining: null, payouts: [], fieldStacks: [] }));
    expect(old.length).toBe(rows.length);
    expect(old[0]).toMatchObject({ winProb: null, itmProb: null, bubbleStage: "unknown", winProbBucket: "unknown", minutesIntoTournament: null });
  });
});
