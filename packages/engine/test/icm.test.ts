import { describe, expect, it } from "vitest";
import { computeIcm } from "../src/review/icm.js";

describe("ICM(Malmuth-Harville)", () => {
  it("優勝率はチップ比と一致する", () => {
    const r = computeIcm([5000, 3000, 2000], [7000, 3000]);
    expect(r.map((x) => x.win)).toEqual([0.5, 0.3, 0.2]);
  });

  it("2人・入賞2人なら全員インマネ率1、期待賞金は勝率で配分", () => {
    const r = computeIcm([6000, 4000], [4000, 2000]);
    expect(r[0]!.itm).toBeCloseTo(1, 10);
    expect(r[1]!.itm).toBeCloseTo(1, 10);
    expect(r[0]!.equity).toBeCloseTo(0.6 * 4000 + 0.4 * 2000, 6);
  });

  it("3人・入賞2人の厳密値(Harville)", () => {
    const r = computeIcm([5000, 3000, 2000], [7000, 3000]);
    // A が2位: B 1位(0.3)×A(5/7) + C 1位(0.2)×A(5/8)
    const a2 = 0.3 * (5 / 7) + 0.2 * (5 / 8);
    expect(r[0]!.itm).toBeCloseTo(0.5 + a2, 10);
    expect(r.reduce((s, x) => s + x.itm, 0)).toBeCloseTo(2, 10);
    expect(r.reduce((s, x) => s + x.equity, 0)).toBeCloseTo(10000, 6);
  });

  it("スタックが多いほどインマネ率が高い。0スタックは0", () => {
    const r = computeIcm([1000, 2000, 4000, 0], [10]);
    expect(r[2]!.itm).toBeGreaterThan(r[1]!.itm);
    expect(r[1]!.itm).toBeGreaterThan(r[0]!.itm);
    expect(r[3]).toEqual({ win: 0, itm: 0, equity: 0 });
  });

  it("24人・入賞4人でも計算でき、インマネ率の合計は入賞人数", () => {
    const stacks = Array.from({ length: 24 }, (_, i) => 1000 + i * 100);
    const r = computeIcm(stacks, [100, 60, 40, 20]);
    expect(r.reduce((s, x) => s + x.itm, 0)).toBeCloseTo(4, 6);
  });
});
