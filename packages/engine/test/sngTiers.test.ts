import { describe, expect, it } from "vitest";
import { eliteFrameOf, qualifiesForTier, SNG_TIERS, sngPayouts } from "../src/sngTiers.js";

describe("SNG の階層", () => {
  it("初期スタックは BB 換算で 75BB / 100BB(レベル1の BB は 200)", () => {
    expect(SNG_TIERS.regular.startingStack / 200).toBe(75);
    expect(SNG_TIERS.highRoller.startingStack / 200).toBe(100);
    expect(SNG_TIERS.superHighRoller.startingStack / 200).toBe(100);
    expect(SNG_TIERS.regular.levelDurationMs).toBe(150_000);
    expect(SNG_TIERS.highRoller.levelDurationMs).toBe(240_000);
  });

  it("チャット・タイムバンクは High Roller / Super High Roller だけ。自動で卓が埋まるのは参加費1,000だけ", () => {
    expect(SNG_TIERS.regular).toMatchObject({ chat: false, timeBank: false, autoFill: true });
    expect(SNG_TIERS.highRoller).toMatchObject({ chat: true, timeBank: true, autoFill: false });
    expect(SNG_TIERS.superHighRoller).toMatchObject({ chat: true, timeBank: true, autoFill: false });
  });

  it("賞金は参加費×4 / ×2(6人ぶんの参加費をそのまま配る)", () => {
    expect(sngPayouts(1000)).toEqual([{ place: 1, amount: 4000 }, { place: 2, amount: 2000 }]);
    const total = sngPayouts(20_000).reduce((a, p) => a + p.amount, 0);
    expect(total).toBe(20_000 * 6);
  });

  it("資格の境界値", () => {
    expect(qualifiesForTier("regular", { profit: -1_000_000, rating: null, roiPct: null })).toBe(true);
    expect(qualifiesForTier("highRoller", { profit: 49_999, rating: 70, roiPct: 300 })).toBe(false);
    expect(qualifiesForTier("highRoller", { profit: 50_000, rating: null, roiPct: null })).toBe(true);
    const shr = { profit: 200_000, rating: 60, roiPct: 120 };
    expect(qualifiesForTier("superHighRoller", shr)).toBe(true);
    expect(qualifiesForTier("superHighRoller", { ...shr, rating: 59.99 })).toBe(false);
    expect(qualifiesForTier("superHighRoller", { ...shr, roiPct: 119.9 })).toBe(false);
    expect(qualifiesForTier("superHighRoller", { ...shr, profit: 199_999 })).toBe(false);
  });

  it("枠: SHR の資格者は金、HR の資格者は銀", () => {
    expect(eliteFrameOf({ profit: 10_000, rating: 80, roiPct: 500 })).toBeNull();
    expect(eliteFrameOf({ profit: 60_000, rating: 50, roiPct: 30 })).toBe("silver");
    expect(eliteFrameOf({ profit: 250_000, rating: 65, roiPct: 150 })).toBe("gold");
  });
});
