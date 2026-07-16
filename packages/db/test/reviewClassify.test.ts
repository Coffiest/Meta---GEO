import { describe, expect, it } from "vitest";
import { classifyDecision, gtoAccuracyPct, type GtoActionEV } from "../src/reviewClassify.js";

const acts = (xs: Array<[string, number, number]>): GtoActionEV[] =>
  xs.map(([bucket, frequency, evBb]) => ({ bucket, frequency, evBb }));

describe("classifyDecision", () => {
  it("基準なしは null", () => {
    expect(classifyDecision({ gtoActions: [], chosenBucket: "fold", isPreflop: true })).toBeNull();
  });

  it("最善EVの手を選べば best (ポストフロップ)", () => {
    const r = classifyDecision({
      gtoActions: acts([["bet60-80", 0.5, 1.0], ["checkOrCall", 0.3, 0.9], ["fold", 0.2, 0.0]]),
      chosenBucket: "bet60-80",
      isPreflop: false,
    });
    expect(r?.classification).toBe("best");
    expect(r?.evLossBb).toBeCloseTo(0);
  });

  it("プリフロップの正着は全て 常識(book)(3段階仕様)", () => {
    const r = classifyDecision({
      gtoActions: acts([["raise3-4", 0.5, 1.0], ["call", 0.3, 0.9], ["fold", 0.2, 0.0]]),
      chosenBucket: "raise3-4",
      isPreflop: true,
    });
    expect(r?.classification).toBe("book");
    expect(r?.evLossBb).toBeCloseTo(0);
  });

  it("プリフロップで高頻度の標準手は Book", () => {
    const r = classifyDecision({
      gtoActions: acts([["fold", 0.85, 0.0], ["call", 0.15, -0.2]]),
      chosenBucket: "fold",
      isPreflop: true,
    });
    expect(r?.classification).toBe("book");
  });

  it("+EVが一択の局面で最善を選べば great (ポストフロップ)", () => {
    const r = classifyDecision({
      gtoActions: acts([["allIn", 0.6, 2.5], ["fold", 0.4, 0.0]]),
      chosenBucket: "allIn",
      isPreflop: false,
    });
    expect(r?.classification).toBe("great");
  });

  it("プリフロップは3段階(常識/悪手/大悪手)。EV損0.1bb以上は全て大悪手", () => {
    // 本来ほぼ最適の手を降りて僅かに損(0.05bb) → 悪手。
    const small = acts([["raise2-2.5", 1.0, 0.05], ["fold", 0.0, 0.0]]);
    expect(classifyDecision({ gtoActions: small, chosenBucket: "fold", isPreflop: true })?.classification).toBe("mistake");
    // EV損がちょうど0.1bb以上 → 大悪手。
    const mid = acts([["raise2-2.5", 1.0, 0.12], ["fold", 0.0, 0.0]]);
    expect(classifyDecision({ gtoActions: mid, chosenBucket: "fold", isPreflop: true })?.classification).toBe("blunder");
    // 本来+5bbのAAを降りる → 大悪手(降りて損したEVで判定)。
    const aaFold = acts([["raise2-2.5", 1.0, 5.0], ["fold", 0.0, 0.0]]);
    expect(classifyDecision({ gtoActions: aaFold, chosenBucket: "fold", isPreflop: true })?.classification).toBe("blunder");
    // 緩手はプリフロップでは付かない。
    expect(classifyDecision({ gtoActions: small, chosenBucket: "fold", isPreflop: true })?.classification).not.toBe("inaccuracy");
  });

  it("EV損に応じて緩手/悪手/大悪手", () => {
    const gto = acts([["raise3-4", 0.6, 1.0], ["call", 0.2, 0.4], ["fold", 0.2, -1.5]]);
    expect(classifyDecision({ gtoActions: gto, chosenBucket: "call", isPreflop: false })?.classification).toBe(
      "inaccuracy",
    ); // 損0.6
    expect(classifyDecision({ gtoActions: gto, chosenBucket: "fold", isPreflop: false })?.classification).toBe(
      "blunder",
    ); // 損2.5
  });

  it("難しい好手(低頻度・EV損ゼロ・対象種別)は artistic で上書き", () => {
    const r = classifyDecision({
      gtoActions: acts([["checkOrCall", 0.9, 0.5], ["bet100+", 0.1, 0.5]]),
      chosenBucket: "bet100+",
      isPreflop: false,
      difficultKind: "overbet",
    });
    expect(r?.classification).toBe("artistic");
  });

  it("対象種別でも高頻度なら artistic にしない", () => {
    const r = classifyDecision({
      gtoActions: acts([["checkOrCall", 0.3, 0.5], ["bet100+", 0.7, 0.5]]),
      chosenBucket: "bet100+",
      isPreflop: false,
      difficultKind: "overbet",
    });
    expect(r?.classification).not.toBe("artistic");
  });
});

describe("gtoAccuracyPct", () => {
  it("平均EV損0で100%", () => {
    expect(gtoAccuracyPct(0)).toBe(100);
  });
  it("損が増えると単調減少", () => {
    expect(gtoAccuracyPct(1)).toBeLessThan(100);
    expect(gtoAccuracyPct(3)).toBeLessThan(gtoAccuracyPct(1));
  });
});
