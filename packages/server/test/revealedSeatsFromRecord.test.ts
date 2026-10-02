import { describe, expect, it } from "vitest";
import { revealedSeatsFromRecord } from "../src/showdown.js";

/**
 * プレイ中のハンド履歴で相手の手札を伏せる判定。見せ過ぎは不正に直結するため、
 * 「公開しない」側へ倒れていることを重点的に確かめる。
 */
const seats = (deltas: Record<number, number>) =>
  Object.entries(deltas).map(([seatIndex, resultStackDelta]) => ({
    seatIndex: Number(seatIndex),
    resultStackDelta,
  }));

const act = (seatIndex: number, street: string, kind: string) => ({ seatIndex, street, kind });

describe("revealedSeatsFromRecord", () => {
  it("フォールドで決着したハンドは誰も公開しない", () => {
    const revealed = revealedSeatsFromRecord({
      buttonFixedPos: 0,
      seats: seats({ 0: 10, 1: -10, 2: 0 }),
      actions: [act(1, "preflop", "raise"), act(2, "preflop", "fold"), act(0, "preflop", "raise"), act(1, "preflop", "fold")],
    });
    expect([...revealed]).toEqual([]);
  });

  it("オールインで決着したショウダウンは残存者全員を公開する", () => {
    const revealed = revealedSeatsFromRecord({
      buttonFixedPos: 0,
      seats: seats({ 0: 100, 1: -100, 2: 0 }),
      actions: [act(2, "preflop", "fold"), act(0, "preflop", "allIn"), act(1, "preflop", "call")],
    });
    expect([...revealed].sort()).toEqual([0, 1]);
  });

  it("通常のショウダウンはリバーの最終アグレッサーと勝者だけを公開する(降りた席は伏せる)", () => {
    const revealed = revealedSeatsFromRecord({
      buttonFixedPos: 0,
      seats: seats({ 0: -50, 1: 50, 2: 0 }),
      actions: [
        act(2, "preflop", "fold"),
        act(0, "preflop", "raise"),
        act(1, "preflop", "call"),
        act(0, "river", "bet"),
        act(1, "river", "call"),
      ],
    });
    // 0=リバーの最終アグレッサー、1=ポット獲得者。降りた2は含まれない。
    expect([...revealed].sort()).toEqual([0, 1]);
    expect(revealed.has(2)).toBe(false);
  });

  it("リバーにアグレッションが無ければボタンの左隣から最初の残存者が公開する", () => {
    const revealed = revealedSeatsFromRecord({
      buttonFixedPos: 0,
      seats: seats({ 0: -20, 1: 20, 2: 0 }),
      actions: [
        act(2, "preflop", "fold"),
        act(1, "preflop", "call"),
        act(0, "river", "check"),
        act(1, "river", "check"),
      ],
    });
    // ボタン(0)の左隣=1が最初の公開者。勝者も1なので、負けた0は伏せたまま。
    expect([...revealed]).toEqual([1]);
    expect(revealed.has(0)).toBe(false);
  });
});
