import { describe, expect, it } from "vitest";
import { HandEngine, createOrderedDeck, parseCard, type Card, type PlayerAction } from "@meta-geo/engine";
import { decideStrongBotAction } from "../src/botStrategy/index.js";

/**
 * 自動の席の意思決定(GTO の表 + レンジに対する勝率)。乱数を固定し、たくさん引いて頻度を確かめる。
 * 6人卓、ボタン = 席0、SB = 席1、BB = 席2、UTG = 席3、HJ = 席4、CO = 席5。
 * 配り順は SB から時計回りに1枚ずつ2周(席1,2,3,4,5,0 → 席1,…)。その後バーン1枚+フロップ3枚。
 */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEAL_ORDER = [1, 2, 3, 4, 5, 0];
const key = (c: Card) => `${c.rank}${c.suit}`;

function shuffled(rand: () => number): Card[] {
  const d = createOrderedDeck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j]!, d[i]!];
  }
  return d;
}

/** 指定した席の手札・フロップを固定したデッキ(残りは乱数)。 */
function deckWith(rand: () => number, fixed: Record<number, string[]>, flop?: string[]): Card[] {
  const used = new Set<string>();
  const want = new Map<number, Card>();
  for (const [seat, cards] of Object.entries(fixed)) {
    const s = Number(seat);
    const order = DEAL_ORDER.indexOf(s);
    cards.forEach((c, round) => {
      const card = parseCard(c)!;
      want.set(round * 6 + order, card);
      used.add(key(card));
    });
  }
  if (flop) {
    flop.forEach((c, i) => {
      const card = parseCard(c)!;
      want.set(13 + i, card); // 12 = バーン
      used.add(key(card));
    });
  }
  const rest = shuffled(rand).filter((c) => !used.has(key(c)));
  const out: Card[] = [];
  let r = 0;
  for (let i = 0; i < 52; i++) out.push(want.get(i) ?? rest[r++]!);
  return out;
}

function newHand(stackBb: number, deck: Card[], stacks?: Record<number, number>): HandEngine {
  return new HandEngine({
    seats: [0, 1, 2, 3, 4, 5].map((i) => ({ seatIndex: i, playerId: `P${i}`, stack: (stacks?.[i] ?? stackBb) * 100 })),
    seatCount: 6,
    buttonFixedPos: 0,
    smallBlindSeat: 1,
    bigBlindSeat: 2,
    smallBlind: 50,
    bigBlind: 100,
    bbAnte: 100,
    deck,
  });
}

function decide(hand: HandEngine, seat: number, rand: () => number): PlayerAction {
  const state = hand.getPublicState();
  const s = state.seats.find((x) => x.seatIndex === seat)!;
  const hole = hand.getSeatHoleCards(seat) as unknown as readonly [Card, Card];
  return decideStrongBotAction({
    hand,
    seatIndex: seat,
    seatCount: 6,
    canRaise: !s.hasActedThisStreet,
    random: rand,
    legacy: {
      street: state.street,
      holeCards: hole,
      board: state.board,
      currentBetToMatch: state.currentBetToMatch,
      streetContribution: s.streetContribution,
      minRaiseToAmount: hand.getMinRaiseToAmount(),
      potBefore: state.potTotal,
      stack: s.stack,
      canRaise: !s.hasActedThisStreet,
      bigBlind: 100,
      random: rand,
    },
  });
}

const foldTo = (hand: HandEngine, seats: number[]) => seats.forEach((s) => hand.applyAction(s, { kind: "fold" }));
const aggressive = (a: PlayerAction) => a.kind === "raise" || a.kind === "allIn" || a.kind === "bet";

describe("自動の席: プリフロップ(GTO の表)", () => {
  it("BTN の 40bb のオープン率が 40% 以上", () => {
    const rand = mulberry32(1);
    let open = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const hand = newHand(40, shuffled(rand));
      foldTo(hand, [3, 4, 5]);
      if (aggressive(decide(hand, 0, rand))) open++;
    }
    expect(open / N).toBeGreaterThan(0.4);
  });

  it("BvB・10bb の SB は 55% 以上で参加し(ジャム/レイズ/リンプ)、10bb 以下のオープンはジャムかフォールド(または SB のリンプ)だけ", () => {
    const rand = mulberry32(2);
    let play = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const hand = newHand(10, shuffled(rand));
      foldTo(hand, [3, 4, 5, 0]);
      const a = decide(hand, 1, rand);
      if (a.kind !== "fold") play++;
      expect(a.kind === "raise").toBe(false);
    }
    expect(play / N).toBeGreaterThan(0.55);

    for (let i = 0; i < 200; i++) {
      const hand = newHand(8, shuffled(rand));
      foldTo(hand, [3, 4]);
      const a = decide(hand, 5, rand); // CO 8bb
      expect(["allIn", "fold"]).toContain(a.kind);
    }
  });

  it("BB は BTN のオープン(40bb)に 40% 以上を守る", () => {
    const rand = mulberry32(3);
    let defend = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const hand = newHand(40, shuffled(rand));
      foldTo(hand, [3, 4, 5]);
      hand.applyAction(0, { kind: "raise", toAmount: 250 });
      hand.applyAction(1, { kind: "fold" });
      if (decide(hand, 2, rand).kind !== "fold") defend++;
    }
    expect(defend / N).toBeGreaterThan(0.4);
  });

  it("100bb のオーバーシャブに AA・AKs・TT はコールし、72o は降りる。オールインへのコールは call で送る", () => {
    for (const [hole, expected] of [
      [["Ah", "Ad"], "call"],
      [["As", "Ks"], "call"],
      [["Th", "Td"], "call"],
      [["7c", "2d"], "fold"],
    ] as const) {
      const rand = mulberry32(4);
      const hand = newHand(100, deckWith(rand, { 2: [...hole] }));
      foldTo(hand, [3, 4, 5]);
      hand.applyAction(0, { kind: "allIn" });
      hand.applyAction(1, { kind: "fold" });
      expect(decide(hand, 2, rand).kind, hole.join("")).toBe(expected);
    }
  });

  it("15bb の SB のジャムに、BB は Nash のレンジどおり(AA はコール、72o は降りる)", () => {
    for (const [hole, expected] of [
      [["Ah", "Ad"], "call"],
      [["Kc", "Td"], "call"],
      [["7c", "2d"], "fold"],
    ] as const) {
      const rand = mulberry32(5);
      const hand = newHand(15, deckWith(rand, { 2: [...hole] }));
      foldTo(hand, [3, 4, 5, 0]);
      hand.applyAction(1, { kind: "allIn" });
      expect(decide(hand, 2, rand).kind, hole.join("")).toBe(expected);
    }
  });
});

describe("自動の席: ポストフロップ", () => {
  /** BTN オープン → BB コール → フロップ。 */
  function srpToFlop(rand: () => number, fixed: Record<number, string[]> = {}, flop?: string[]): HandEngine {
    const hand = newHand(40, deckWith(rand, fixed, flop));
    foldTo(hand, [3, 4, 5]);
    hand.applyAction(0, { kind: "raise", toAmount: 250 });
    hand.applyAction(1, { kind: "fold" });
    hand.applyAction(2, { kind: "call" });
    return hand;
  }

  it("ヘッズアップの SRP で、BTN の C ベット率が 55% 以上", () => {
    const rand = mulberry32(6);
    let bets = 0;
    const N = 160;
    for (let i = 0; i < N; i++) {
      const hand = srpToFlop(rand);
      hand.applyAction(2, { kind: "check" });
      if (aggressive(decide(hand, 0, rand))) bets++;
    }
    expect(bets / N).toBeGreaterThan(0.55);
  });

  it("レイザーでない BB はフロップでドンクしない(3% 未満)", () => {
    const rand = mulberry32(7);
    let donks = 0;
    const N = 160;
    for (let i = 0; i < N; i++) {
      const hand = srpToFlop(rand);
      if (aggressive(decide(hand, 2, rand))) donks++;
    }
    expect(donks / N).toBeLessThan(0.03);
  });

  it("フロップのセットは、ベットに直面して降りない", () => {
    const rand = mulberry32(8);
    for (let i = 0; i < 20; i++) {
      const hand = srpToFlop(rand, { 2: ["7c", "7d"] }, ["7h", "Ks", "2d"]);
      hand.applyAction(2, { kind: "check" });
      hand.applyAction(0, { kind: "bet", toAmount: 400 });
      expect(decide(hand, 2, rand).kind).not.toBe("fold");
    }
  });

  it("1回の判断は数十 ms 以内", () => {
    const rand = mulberry32(9);
    const hand = srpToFlop(rand);
    hand.applyAction(2, { kind: "check" });
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) decide(hand, 0, rand);
    expect((performance.now() - t0) / 20).toBeLessThan(60);
  });
});
