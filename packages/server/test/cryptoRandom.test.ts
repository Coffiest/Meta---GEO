import { describe, expect, it } from "vitest";
import { cryptoRandom } from "../src/gameServer.js";

describe("フレンド対戦の席とボタンを決める乱数", () => {
  it("例外を出さず、0以上1未満の値を返す", () => {
    for (let i = 0; i < 10_000; i++) {
      const r = cryptoRandom();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });
});
