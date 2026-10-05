import { describe, expect, it } from "vitest";
import { ACTION_CLOCK_MS, botDecisionMs } from "../src/gameServer.js";
import type { PlayerAction } from "@meta-geo/engine";

/**
 * 自動プレイヤーの「考える時間」の分布テスト(オーナー指示の仕様):
 *  - チェック・コール・フォールドは 0.5〜1.5秒でランダム
 *  - ベット・レイズ・オールインは 2〜4秒でランダム
 *  - タイムバンクまで使う長考は、ターン/リバーのチェック以外でごく稀(200回に1回ほど)
 */

const CHECK: PlayerAction = { kind: "check" };
const FOLD: PlayerAction = { kind: "fold" };
const CALL: PlayerAction = { kind: "call" };
const BET: PlayerAction = { kind: "bet", toAmount: 400 };
const RAISE: PlayerAction = { kind: "raise", toAmount: 800 };
const ALL_IN: PlayerAction = { kind: "allIn" };

const STREETS = ["preflop", "flop", "turn", "river"];
const PASSIVE = [CHECK, CALL, FOLD];
const AGGRESSIVE = [BET, RAISE, ALL_IN];

/** 決定時間の分布を実際に引いて調べる(乱数はMath.randomをそのまま使う)。 */
function sample(street: string, action: PlayerAction, n = 20_000, timeBank = true): number[] {
  return Array.from({ length: n }, () => botDecisionMs(street, action, Math.random, timeBank));
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("botDecisionMs: アクションの種類ごとの時間", () => {
  it("チェック・コール・フォールドは、どのストリートでも 0.5〜1.5秒", () => {
    for (const street of STREETS) {
      for (const action of PASSIVE) {
        // タイムバンクの長考(ターン/リバーのごく稀な外れ値)は別のテストで見る。
        const values = sample(street, action, 5_000).filter((v) => v <= ACTION_CLOCK_MS);
        expect(Math.min(...values)).toBeGreaterThanOrEqual(500);
        expect(Math.max(...values)).toBeLessThanOrEqual(1_500);
      }
    }
  });

  it("ベット・レイズ・オールインは、どのストリートでも 2〜4秒", () => {
    for (const street of STREETS) {
      for (const action of AGGRESSIVE) {
        const values = sample(street, action, 5_000).filter((v) => v <= ACTION_CLOCK_MS);
        expect(Math.min(...values)).toBeGreaterThanOrEqual(2_000);
        expect(Math.max(...values)).toBeLessThanOrEqual(4_000);
      }
    }
  });

  it("範囲の中で偏らずにばらける(平均が真ん中あたり)", () => {
    expect(mean(sample("flop", CALL))).toBeGreaterThan(900);
    expect(mean(sample("flop", CALL))).toBeLessThan(1_100);
    expect(mean(sample("flop", BET))).toBeGreaterThan(2_800);
    expect(mean(sample("flop", BET))).toBeLessThan(3_200);
  });
});

describe("botDecisionMs: タイムバンクはごく稀", () => {
  it("プリフロップとフロップでは使わない", () => {
    for (const street of ["preflop", "flop"]) {
      for (const action of [...PASSIVE, ...AGGRESSIVE]) {
        expect(Math.max(...sample(street, action, 5_000))).toBeLessThanOrEqual(ACTION_CLOCK_MS);
      }
    }
  });

  it("チェックでは使わない(リバーでも)", () => {
    expect(Math.max(...sample("river", CHECK, 20_000))).toBeLessThanOrEqual(1_500);
  });

  it("タイムバンクの無い卓では使わない", () => {
    for (const action of [CALL, BET]) {
      expect(Math.max(...sample("river", action, 20_000, false))).toBeLessThanOrEqual(ACTION_CLOCK_MS);
    }
  });

  it("ターン/リバーでも 1.5% 未満(以前は 2%)", () => {
    const values = sample("turn", CALL, 40_000);
    const rate = values.filter((v) => v > ACTION_CLOCK_MS).length / values.length;
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(0.015);
  });
});
