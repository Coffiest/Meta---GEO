import { test, expect } from "vitest";
import { HandEngine } from "@meta-geo/engine/src/handEngine.js";
import { decideBotAction } from "@meta-geo/engine/src/autoPlayer.js";
import { parseCard } from "@meta-geo/engine/src/types/card.js";
import { RULES_STEPS } from "../src/data/lessonRules";

test("guided", () => {
  const e = new HandEngine({ seats: [{ seatIndex: 0, playerId: "y", stack: 10000 }, { seatIndex: 3, playerId: "b", stack: 10000 }], seatCount: 6, buttonFixedPos: 0, smallBlindSeat: 0, bigBlindSeat: 3, smallBlind: 50, bigBlind: 100, bbAnte: 100 });
  const hero = [{ kind: "call" }, { kind: "check" }, null, { kind: "allIn" }] as const;
  let h = 0, b = 0;
  while (!e.isHandComplete()) {
    const s = e.getPublicState();
    if (s.actingSeatIndex === 0) {
      const me = s.seats.find((x) => x.seatIndex === 0)!;
      if (h === 2) e.applyAction(0, { kind: "raise", toAmount: 900 });
      else if (h === 3) e.applyAction(0, { kind: "raise", toAmount: me.streetContribution + me.stack });
      else e.applyAction(0, hero[h] as never);
      h++;
    } else {
      const me = s.seats.find((x) => x.seatIndex === 3)!;
      const toCall = s.currentBetToMatch - me.streetContribution;
      const t = b++;
      e.applyAction(3, t === 2 ? { kind: "bet", toAmount: 300 } : t === 5 ? { kind: "fold" } : toCall > 0 ? { kind: "call" } : { kind: "check" });
    }
  }
  expect(h).toBe(4);
  expect(b).toBe(6);
  expect(e.getResult().wonByFold).toBe(true);
});

test("cards parse", () => {
  for (const st of RULES_STEPS) {
    const lists: string[][] = [];
    if (st.kind === "talk") for (const p of st.pages) if (p.scene) lists.push(p.scene.hero ?? [], p.scene.board ?? [], p.scene.bally ?? []);
    if (st.kind === "flip") lists.push(st.hero, st.bally, st.board);
    for (const l of lists) for (const c of l) expect(parseCard(c), c).not.toBeNull();
  }
});

test("practice autoplay", () => {
  for (let n = 0; n < 30; n++) {
    const e = new HandEngine({ seats: [0,1,2,3,4,5].map((i) => ({ seatIndex: i, playerId: `p${i}`, stack: 10000 })), seatCount: 6, buttonFixedPos: n % 6, smallBlindSeat: (n + 1) % 6, bigBlindSeat: (n + 2) % 6, smallBlind: 50, bigBlind: 100, bbAnte: 100 });
    let guard = 0;
    while (!e.isHandComplete() && guard++ < 200) {
      const s = e.getPublicState();
      const i = s.actingSeatIndex!;
      const seat = s.seats.find((x) => x.seatIndex === i)!;
      const a = decideBotAction({ street: s.street, holeCards: e.getSeatHoleCards(i) as never, board: s.board, currentBetToMatch: s.currentBetToMatch, streetContribution: seat.streetContribution, minRaiseToAmount: e.getMinRaiseToAmount(), potBefore: s.potTotal, stack: seat.stack, canRaise: !seat.hasActedThisStreet, activeOpponentCount: 2, bigBlind: 100 });
      try { e.applyAction(i, a); } catch { e.applyAction(i, s.currentBetToMatch - seat.streetContribution > 0 ? { kind: "fold" } : { kind: "check" }); }
    }
    expect(e.isHandComplete()).toBe(true);
  }
});
