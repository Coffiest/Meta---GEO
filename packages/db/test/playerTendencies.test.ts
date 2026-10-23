import { describe, expect, it } from "vitest";
import { computeTendencies, type TendencyHand } from "../src/playerTendencies.js";

const a = (seatIndex: number, street: string, kind: string) => ({ seatIndex, street, kind });

describe("computeTendencies", () => {
  it("BTN のスチール → C ベット → 相手が降りる", () => {
    // 席 0=UTG 1=CO 2=BTN 3=SB 4=BB。自分は BTN(2)。
    const me: TendencyHand = {
      seatIndex: 2, isSmallBlind: false, isBigBlind: false, resultStackDelta: 300,
      actions: [a(0, "preflop", "fold"), a(1, "preflop", "fold"), a(2, "preflop", "raise"), a(3, "preflop", "fold"), a(4, "preflop", "call"), a(4, "flop", "check"), a(2, "flop", "bet"), a(4, "flop", "fold")],
    };
    const t = computeTendencies([me], 1);
    expect(t.stealRate).toBe(1);
    expect(t.cbetRate).toBe(1);
    expect(t.wtsdRate).toBe(0);
    expect(t.titles).toBe(1);
    // 同じハンドを BB の側から見る: C ベットに降りた。
    const bb = computeTendencies([{ ...me, seatIndex: 4, isBigBlind: true, resultStackDelta: -300 }], 0);
    expect(bb.foldToCbetRate).toBe(1);
    expect(bb.stealRate).toBe(0);
  });

  it("オープン → 3ベットに降りる、UTG はスチールの機会にならない", () => {
    const h: TendencyHand = {
      seatIndex: 0, isSmallBlind: false, isBigBlind: false, resultStackDelta: -250,
      actions: [a(0, "preflop", "raise"), a(1, "preflop", "raise"), a(2, "preflop", "fold"), a(3, "preflop", "fold"), a(4, "preflop", "fold"), a(0, "preflop", "fold")],
    };
    const t = computeTendencies([h], 0);
    expect(t.foldTo3BetRate).toBe(1);
    expect(t.stealRate).toBe(0);
  });

  it("チェックレイズとショーダウンでの勝ち", () => {
    const h: TendencyHand = {
      seatIndex: 4, isSmallBlind: false, isBigBlind: true, resultStackDelta: 900,
      actions: [a(2, "preflop", "raise"), a(3, "preflop", "fold"), a(4, "preflop", "call"), a(4, "flop", "check"), a(2, "flop", "bet"), a(4, "flop", "raise"), a(2, "flop", "call"), a(4, "turn", "check"), a(2, "turn", "check"), a(4, "river", "check"), a(2, "river", "check")],
    };
    const t = computeTendencies([h], 0);
    expect(t.checkRaiseRate).toBe(1);
    expect(t.wtsdRate).toBe(1);
    expect(t.wsdRate).toBe(1);
  });
});
