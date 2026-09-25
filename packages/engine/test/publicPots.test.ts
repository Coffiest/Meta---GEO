import { describe, expect, it } from "vitest";
import { HandEngine } from "../src/handEngine.js";
import { createOrderedDeck } from "../src/deck.js";
import type { Card } from "../src/types/card.js";

function c(spec: string): Card {
  const rankChar = spec.slice(0, -1);
  const suitChar = spec.slice(-1);
  const rank = ({ A: 14, K: 13, Q: 12, J: 11, T: 10 } as Record<string, number>)[rankChar] ?? Number(rankChar);
  const suit = ({ s: "spades", h: "hearts", d: "diamonds", c: "clubs" } as const)[suitChar as "s" | "h" | "d" | "c"];
  return { rank: rank as Card["rank"], suit };
}

/** 指定した順番のカードを先頭に配置し、残りは未使用の標準デッキで埋めた52枚のデッキを作る */
function fixedDeck(...specs: string[]): Card[] {
  const prefix = specs.map(c);
  const usedKeys = new Set(prefix.map((card) => `${card.rank}${card.suit}`));
  const rest = createOrderedDeck().filter((card) => !usedKeys.has(`${card.rank}${card.suit}`));
  return [...prefix, ...rest];
}

function makeHand(stacks: [number, number, number]) {
  // seat0=BTN, seat1=SB, seat2=BB / blinds 100/200, ante 200
  return new HandEngine({
    seats: [
      { seatIndex: 0, playerId: "btn", stack: stacks[0] },
      { seatIndex: 1, playerId: "sb", stack: stacks[1] },
      { seatIndex: 2, playerId: "bb", stack: stacks[2] },
    ],
    seatCount: 6,
    buttonFixedPos: 0,
    smallBlindSeat: 1,
    bigBlindSeat: 2,
    smallBlind: 100,
    bigBlind: 200,
    bbAnte: 200,
  });
}

describe("PublicHandState collectedPot / pots", () => {
  it("keeps current-street bets out of the collected pot until the street closes", () => {
    const hand = makeHand([10_000, 10_000, 10_000]);
    // プリフロップ中: 確定済みはBBアンテのみ。ブラインド/ベットは各席の前(streetContribution)。
    let state = hand.getPublicState();
    expect(state.collectedPot).toBe(200); // アンテのみ
    expect(state.potTotal).toBe(200 + 100 + 200); // 総額(アンテ+SB+BB)は従来どおり全拠出

    hand.applyAction(0, { kind: "raise", toAmount: 600 });
    state = hand.getPublicState();
    expect(state.collectedPot).toBe(200); // レイズはまだ確定していない

    hand.applyAction(1, { kind: "fold" });
    hand.applyAction(2, { kind: "call", toAmount: 600 });
    // ストリートが締まりフロップへ → 全額が確定済みポットへ移動
    state = hand.getPublicState();
    expect(state.street).toBe("flop");
    expect(state.collectedPot).toBe(200 + 100 + 600 + 600);
    expect(state.pots).toHaveLength(1);
    expect(state.pots[0]!.eligibleSeatIndexes.sort()).toEqual([0, 2]);
  });

  it("exposes main and side pots when a short stack is all-in", () => {
    const hand = makeHand([10_000, 10_000, 1_000]);
    // BB(席2)はアンテ200+ブラインド200で残り600。BTNが2000へレイズ、SBフォールド、BBオールイン(計800)。
    hand.applyAction(0, { kind: "raise", toAmount: 2_000 });
    hand.applyAction(1, { kind: "fold" });
    hand.applyAction(2, { kind: "allIn" });
    // BTNだけがチップを残しているため自動ランアウトで完了する。
    expect(hand.isHandComplete()).toBe(true);

    const state = hand.getPublicState();
    // BBのベット拠出は実効800(アンテ200は別途デッドマネー)。BTNの未コール分(2000-800=1200)は
    // 表示から除外(返却扱い)。ポット = BTN800 + SB100(フォールド分) + BB800 + アンテ200 = 1900。
    expect(state.collectedPot).toBe(1_900);
    expect(state.pots).toHaveLength(1);
    expect(state.pots[0]!.eligibleSeatIndexes).toEqual([0, 2]);
  });

  it("builds a genuine side pot with three players of different stacks", () => {
    const hand = makeHand([10_000, 4_000, 1_000]);
    // BB(1000)はアンテ+ブラインド後600。BTN 10000、SB 4000。
    hand.applyAction(0, { kind: "allIn" }); // BTN 10000オールイン
    hand.applyAction(1, { kind: "allIn" }); // SB 4000オールイン
    hand.applyAction(2, { kind: "allIn" }); // BB 残り600オールイン
    expect(hand.isHandComplete()).toBe(true);

    const state = hand.getPublicState();
    // メイン: ベット800×3 + アンテ200 = 2600(全員) / サイド1: (4000-800)×2 = 6400(BTNとSB)。
    // BTN単独の未コール分(10000-4000=6000)は表示から除外(返却扱い)。
    expect(state.pots.length).toBe(2);
    expect(state.pots[0]!.eligibleSeatIndexes).toEqual([0, 1, 2]);
    expect(state.pots[0]!.amount).toBe(2_600);
    expect(state.pots[1]!.eligibleSeatIndexes).toEqual([0, 1]);
    expect(state.pots[1]!.amount).toBe(6_400);
    expect(state.collectedPot).toBe(9_000);
  });

  it("awards the BB ante to the showdown winner (ante is dead money, not a BB-only layer)", () => {
    // 回帰テスト: 以前は全拠出のレイヤー分割によりBBアンテの非対称分が「BBだけが資格を持つ
    // レイヤー」になり、BBが負けたショーダウンでもアンテ200を取り戻していた。
    // デッキ注入で BTN=AA / BB=72o、ボードでBTNが必勝になる構成を作る。
    // 配札順: postflopOrder(SB,BB,BTN)へ1枚ずつ2周 → SB,BB,BTN,SB,BB,BTN、
    // その後バーン+フロップ3枚、バーン+ターン、バーン+リバー。
    const deck = fixedDeck("2c", "7d", "As", "3c", "2d", "Ah", "9s", "Kh", "Qs", "Jc", "8d", "4h", "5s", "6h");
    const hand = new HandEngine({
      seats: [
        { seatIndex: 0, playerId: "btn", stack: 10_000 },
        { seatIndex: 1, playerId: "sb", stack: 10_000 },
        { seatIndex: 2, playerId: "bb", stack: 10_000 },
      ],
      seatCount: 6,
      buttonFixedPos: 0,
      smallBlindSeat: 1,
      bigBlindSeat: 2,
      smallBlind: 100,
      bigBlind: 200,
      bbAnte: 200,
      deck,
    });

    hand.applyAction(0, { kind: "call", toAmount: 200 });
    hand.applyAction(1, { kind: "fold" });
    hand.applyAction(2, { kind: "check" });
    // フロップ以降は全てチェックでショーダウンへ
    hand.applyAction(2, { kind: "check" });
    hand.applyAction(0, { kind: "check" });
    hand.applyAction(2, { kind: "check" });
    hand.applyAction(0, { kind: "check" });
    hand.applyAction(2, { kind: "check" });
    hand.applyAction(0, { kind: "check" });
    expect(hand.isHandComplete()).toBe(true);

    const result = hand.getResult();
    // ポット総額 = BTN200 + SB100 + BB200 + アンテ200 = 700。勝者(BTN)が全額を獲得し、
    // BBはアンテを取り戻さない。
    expect(result.payouts.get("btn")).toBe(700);
    expect(result.payouts.get("bb") ?? 0).toBe(0);
  });

  it("exposes smallBlindSeat and bigBlindSeat in the public state", () => {
    const hand = makeHand([10_000, 10_000, 10_000]);
    const state = hand.getPublicState();
    expect(state.smallBlindSeat).toBe(1);
    expect(state.bigBlindSeat).toBe(2);
  });
});
