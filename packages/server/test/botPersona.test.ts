import { describe, expect, it } from "vitest";
import { HandEngine, createOrderedDeck, type Card } from "@meta-geo/engine";
import { decideStrongBotAction, type BotPersona } from "../src/botStrategy/index.js";
import { randomPersona } from "../src/botStrategy/persona.js";

/**
 * 打ち方の型と癖(オーナー指示 2026-11-05)。同じ型の6人で卓を回し、型ごとにプリフロップの参加率(VPIP)が
 * 期待どおりに分かれるか、最後まで打ち切れるか(エンジンが受け付けない手を出さないか)を確かめる。
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

function shuffled(rand: () => number): Card[] {
  const d = createOrderedDeck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j]!, d[i]!];
  }
  return d;
}

/** 1ハンドを最後まで打つ。各席がプリフロップで自分からチップを入れたか(VPIP)を返す。 */
function playHand(persona: BotPersona, rand: () => number): boolean[] {
  const hand = new HandEngine({
    seats: [0, 1, 2, 3, 4, 5].map((i) => ({ seatIndex: i, playerId: `P${i}`, stack: 4000 })),
    seatCount: 6,
    buttonFixedPos: 0,
    smallBlindSeat: 1,
    bigBlindSeat: 2,
    smallBlind: 50,
    bigBlind: 100,
    bbAnte: 100,
    deck: shuffled(rand),
  });
  const vpip = [false, false, false, false, false, false];
  for (let guard = 0; guard < 200; guard++) {
    const st = hand.getPublicState();
    if (st.isComplete || st.actingSeatIndex === null) break;
    const seat = st.actingSeatIndex;
    const s = st.seats.find((x) => x.seatIndex === seat)!;
    const hole = hand.getSeatHoleCards(seat) as unknown as readonly [Card, Card];
    const a = decideStrongBotAction({
      hand,
      seatIndex: seat,
      seatCount: 6,
      canRaise: !s.hasActedThisStreet,
      random: rand,
      persona,
      legacy: {
        street: st.street,
        holeCards: hole,
        board: st.board,
        currentBetToMatch: st.currentBetToMatch,
        streetContribution: s.streetContribution,
        minRaiseToAmount: hand.getMinRaiseToAmount(),
        potBefore: st.potTotal,
        stack: s.stack,
        canRaise: !s.hasActedThisStreet,
        bigBlind: 100,
        random: rand,
      },
    });
    if (st.street === "preflop" && (a.kind === "call" || a.kind === "raise" || a.kind === "allIn" || a.kind === "bet")) vpip[seat] = true;
    hand.applyAction(seat, a); // 受け付けない手なら例外で落ちる
  }
  return vpip;
}

function vpipOf(persona: BotPersona, seed: number, hands = 120): number {
  const rand = mulberry32(seed);
  let n = 0;
  let v = 0;
  for (let i = 0; i < hands; i++) {
    const r = playHand(persona, rand);
    // BB(席2)はただで見られることがあるので数えない
    for (const s of [0, 1, 3, 4, 5]) {
      n++;
      if (r[s]) v++;
    }
  }
  return v / n;
}

const P = (style: BotPersona["style"], looseness: number, aggression: number, traits: BotPersona["traits"] = []): BotPersona => ({
  style,
  traits,
  intensity: 0.8,
  looseness,
  aggression,
});

describe("自動の席の型と癖", () => {
  it("ルースはタイトより参加率が高く、グラスキャノンはほぼ全部参加する", () => {
    const loose = vpipOf(P("loosePassive", 0.25, -0.6, ["limper", "callingStation"]), 1, 60);
    const tight = vpipOf(P("tightPassive", -0.08, -0.6, ["underRaiser"]), 2, 60);
    const glass = vpipOf(P("glassCannon", 1, 1), 3, 20);
    expect(loose).toBeGreaterThan(tight + 0.15);
    expect(glass).toBeGreaterThan(0.95);
  }, 120_000);

  it("ランダムな型でも最後まで打ち切れる", () => {
    const rand = mulberry32(9);
    for (let i = 0; i < 40; i++) playHand(randomPersona(rand), rand);
  }, 120_000);

  it("型の割合: シャーク約30%・グラスキャノン約1%。シャークの癖は0〜2個、それ以外は2〜4個", () => {
    const rand = mulberry32(11);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 5000; i++) {
      const p = randomPersona(rand);
      counts[p.style] = (counts[p.style] ?? 0) + 1;
      if (p.style === "shark") expect(p.traits.length).toBeLessThanOrEqual(2);
      else if (p.style !== "glassCannon") {
        expect(p.traits.length).toBeGreaterThanOrEqual(2);
        expect(p.traits.length).toBeLessThanOrEqual(4);
      }
    }
    expect(counts.shark! / 5000).toBeGreaterThan(0.27);
    expect(counts.shark! / 5000).toBeLessThan(0.33);
    expect((counts.glassCannon ?? 0) / 5000).toBeLessThan(0.02);
  });
});
