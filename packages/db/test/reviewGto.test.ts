import { describe, it, expect } from "vitest";
import { openGtoActions, defenseGtoActions, vsJamGtoActions, allInCallGtoActions } from "../src/reviewGto.js";

function evOf(actions: { bucket: string; evBb: number }[], bucket: string): number {
  const a = actions.find((x) => x.bucket === bucket);
  if (!a) throw new Error(`bucket ${bucket} not found in ${actions.map((x) => x.bucket).join(",")}`);
  return a.evBb;
}
function freqOf(actions: { bucket: string; frequency: number }[], bucket: string): number {
  return actions.find((x) => x.bucket === bucket)?.frequency ?? 0;
}

describe("vsJamGtoActions (Nash厳密EV)", () => {
  it("AA facing 10bb UTG jam: call EV is strongly positive and call freq ~1", () => {
    const a = vsJamGtoActions({ jammerPos: "UTG", heroPos: "BB", riskBb: 10, handClass: "AA" })!;
    expect(a).toBeTruthy();
    expect(evOf(a, "call")).toBeGreaterThan(3);
    expect(freqOf(a, "call")).toBeGreaterThan(0.9);
  });

  it("72o facing 10bb UTG jam: fold is best (call EV clearly negative)", () => {
    const a = vsJamGtoActions({ jammerPos: "UTG", heroPos: "BB", riskBb: 10, handClass: "72o" })!;
    expect(evOf(a, "call")).toBeLessThan(evOf(a, "fold"));
    expect(freqOf(a, "call")).toBeLessThan(0.1);
  });
});

describe("openGtoActions (転記レンジ+EVモデル)", () => {
  it("100bb UTG AA: open raise EV > fold EV, and AA is in-range (freq 1)", () => {
    const a = openGtoActions({ heroPos: "UTG", handClass: "AA", effStackBb: 100 })!;
    expect(a).toBeTruthy();
    const raiseBucket = a.find((x) => x.bucket.startsWith("raise"))!;
    expect(raiseBucket.evBb).toBeGreaterThan(evOf(a, "fold"));
    expect(raiseBucket.frequency).toBe(1);
  });

  it("100bb UTG 72o: fold is best; raise/jam are losing", () => {
    const a = openGtoActions({ heroPos: "UTG", handClass: "72o", effStackBb: 100 })!;
    const raiseBucket = a.find((x) => x.bucket.startsWith("raise"))!;
    expect(raiseBucket.evBb).toBeLessThan(evOf(a, "fold"));
    expect(evOf(a, "allIn")).toBeLessThan(evOf(a, "fold"));
    expect(raiseBucket.frequency).toBe(0);
  });

  it("100bb UTG: open-jamming AA is worse than raising (deep jam gets called only by QQ+/AK)", () => {
    const a = openGtoActions({ heroPos: "UTG", handClass: "AA", effStackBb: 100 })!;
    const raiseBucket = a.find((x) => x.bucket.startsWith("raise"))!;
    // AAはジャムも+EVだが、レイズの方が上(または同等以上)。
    expect(raiseBucket.evBb).toBeGreaterThanOrEqual(evOf(a, "allIn") - 0.5);
  });

  it("7bb BTN A5s: jam EV > fold (standard short-stack shove)", () => {
    const a = openGtoActions({ heroPos: "BTN", handClass: "A5s", effStackBb: 7 })!;
    expect(evOf(a, "allIn")).toBeGreaterThan(evOf(a, "fold"));
    expect(freqOf(a, "allIn")).toBe(1);
  });
});

describe("defenseGtoActions (計算済みディフェンス+EVモデル)", () => {
  it("100bb BB vs UTG open, AA: 3bet EV > call EV > fold EV", () => {
    const a = defenseGtoActions({ openerPos: "UTG", heroPos: "BB", handClass: "AA", effStackBb: 100 })!;
    expect(a).toBeTruthy();
    const threeBet = a.find((x) => x.bucket.startsWith("raise"))!;
    expect(threeBet.evBb).toBeGreaterThan(evOf(a, "call"));
    expect(evOf(a, "call")).toBeGreaterThan(evOf(a, "fold"));
  });

  it("100bb BB vs UTG open, 72o: fold is best", () => {
    const a = defenseGtoActions({ openerPos: "UTG", heroPos: "BB", handClass: "72o", effStackBb: 100 })!;
    expect(evOf(a, "fold")).toBeGreaterThanOrEqual(evOf(a, "call"));
    expect(freqOf(a, "call")).toBeLessThan(0.1);
  });

  it("20bb BB vs BTN open: no 3bet option (fold/call/allin only), suited connector defends", () => {
    const a = defenseGtoActions({ openerPos: "BTN", heroPos: "BB", handClass: "87s", effStackBb: 22 })!;
    expect(a.some((x) => x.bucket.startsWith("raise"))).toBe(false);
    expect(evOf(a, "call")).toBeGreaterThan(evOf(a, "fold"));
  });
});

describe("allInCallGtoActions (実ハンド同士の厳密equity)", () => {
  it("top set facing river all-in vs missed draw: call EV positive", () => {
    const a = allInCallGtoActions({
      heroCards: ["As", "Ah"],
      villainCards: ["7c", "6c"],
      boardSoFar: ["Ad", "Kd", "2h", "9s", "3s"],
      potBb: 20,
      callBb: 10,
    })!;
    expect(evOf(a, "checkOrCall")).toBeGreaterThan(9); // 100%勝ち: 30×1 − 10 = +20
    expect(evOf(a, "fold")).toBe(0);
  });

  it("air facing flop all-in vs overpair: call EV clearly negative", () => {
    const a = allInCallGtoActions({
      heroCards: ["Th", "9h"],
      villainCards: ["Ks", "Kd"],
      boardSoFar: ["2c", "7d", "Qs"],
      potBb: 10,
      callBb: 15,
    })!;
    expect(evOf(a, "checkOrCall")).toBeLessThan(-5);
  });
});
