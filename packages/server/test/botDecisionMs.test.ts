import { describe, expect, it } from "vitest";
import { ACTION_CLOCK_MS, botDecisionMs } from "../src/gameServer.js";
import type { PlayerAction } from "@meta-geo/engine";

/**
 * 自動プレイヤーの「考える時間」の分布テスト。
 *
 * ここで固定したいのは体感テンポそのもの:
 *  - どのストリートでも待たされ過ぎない(ショットクロック20秒を普通は使い切らない)
 *  - タイムバンクまで使う長考は「ごく稀」であること
 *  - チェック/即降りは待ちが無いこと
 */

const CHECK: PlayerAction = { kind: "check" };
const FOLD: PlayerAction = { kind: "fold" };
const CALL: PlayerAction = { kind: "call" };

/** 決定時間の分布を実際に引いて調べる(乱数はMath.randomをそのまま使う)。 */
function sample(street: string, action: PlayerAction, n = 20_000): number[] {
  return Array.from({ length: n }, () => botDecisionMs(street, action));
}

describe("botDecisionMs: 待ち時間の上限", () => {
  it("checks almost instantly on every street", () => {
    for (const street of ["preflop", "flop", "turn", "river"]) {
      const values = sample(street, CHECK, 2_000);
      expect(Math.min(...values)).toBeGreaterThanOrEqual(150);
      expect(Math.max(...values)).toBeLessThanOrEqual(600);
    }
  });

  it("never keeps the table waiting more than 2.5s preflop or on the flop", () => {
    for (const action of [FOLD, CALL]) {
      expect(Math.max(...sample("preflop", action, 5_000))).toBeLessThanOrEqual(2_500);
      expect(Math.max(...sample("flop", action, 5_000))).toBeLessThanOrEqual(2_500);
    }
  });

  it("folds preflop with no perceptible delay about half the time", () => {
    const values = sample("preflop", FOLD, 20_000);
    const instant = values.filter((v) => v <= 250).length / values.length;
    expect(instant).toBeGreaterThan(0.4);
    expect(instant).toBeLessThan(0.6);
  });

  it("thinks at most 10s on turn/river when not using the time bank", () => {
    for (const street of ["turn", "river"]) {
      const withinClock = sample(street, CALL, 20_000).filter((v) => v <= ACTION_CLOCK_MS);
      expect(Math.max(...withinClock)).toBeLessThanOrEqual(10_000);
    }
  });
});

describe("botDecisionMs: タイムバンクはごく稀", () => {
  it("only ever reaches the time bank on turn/river", () => {
    for (const street of ["preflop", "flop"]) {
      for (const action of [CHECK, FOLD, CALL]) {
        expect(Math.max(...sample(street, action, 5_000))).toBeLessThanOrEqual(ACTION_CLOCK_MS);
      }
    }
  });

  it("uses the time bank in only a few percent of turn/river decisions", () => {
    const values = sample("turn", CALL, 40_000);
    const rate = values.filter((v) => v > ACTION_CLOCK_MS).length / values.length;
    // 「ごく稀」= 数%まで。以前は15%で、体感として頻繁に長考していた。
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(0.05);
  });

  it("never uses the time bank for a check, even on the river", () => {
    expect(Math.max(...sample("river", CHECK, 20_000))).toBeLessThanOrEqual(600);
  });
});

describe("botDecisionMs: 体感が以前の半分程度になっている", () => {
  /**
   * 「だいたい今の体感半分くらい」を、平均待ち時間で担保する。
   * 括弧内は変更前の平均値(乱数一様分布から算出)。
   */
  const CASES: { street: string; action: PlayerAction; before: number }[] = [
    { street: "preflop", action: CHECK, before: 550 }, // 200 + 700/2
    { street: "preflop", action: CALL, before: 2_900 }, // 800 + 4200/2
    { street: "flop", action: CALL, before: 2_500 }, // 5000/2
  ];

  for (const { street, action, before } of CASES) {
    it(`${street}/${action.kind} averages about half of what it used to`, () => {
      const values = sample(street, action, 20_000);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      // 半分±20%の範囲に収まっていること。
      expect(mean).toBeGreaterThan(before * 0.3);
      expect(mean).toBeLessThan(before * 0.7);
    });
  }

  it("turn/river averages well under half of the 20s shot clock", () => {
    const values = sample("river", CALL, 20_000);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    // 変更前は平均約11秒(2000 + 18000/2 に長考ぶんが乗る)。半分の6秒前後まで下げる。
    expect(mean).toBeLessThan(7_000);
  });
});
