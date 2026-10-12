import { describe, expect, it } from "vitest";
import { mergePositionStats } from "../src/geoTree.js";

/**
 * 管理者画面の「ポジション別の集まり具合」の統合後の表(オーナー指示 2026-10-12)。
 * 後ろに残る人数が同じポジションは同じスポット: 6人卓の CO = 5人卓の CO = 4人卓の UTG(後ろが BTN・SB・BB)。
 */
describe("mergePositionStats", () => {
  it("後ろに残る人数が同じポジションを足し合わせ、6人卓の名前の順に並べる", () => {
    const merged = mergePositionStats([
      { position: "CO", playerCount: 6, decisions: 30, hands: 20 },
      { position: "UTG", playerCount: 4, decisions: 12, hands: 10 },
      { position: "CO", playerCount: 5, decisions: 8, hands: 5 },
      { position: "UTG", playerCount: 5, decisions: 7, hands: 4 },
      { position: "UTG", playerCount: 6, decisions: 9, hands: 6 },
      { position: "BB", playerCount: 2, decisions: 3, hands: 3 },
      { position: "BB", playerCount: 6, decisions: 5, hands: 5 },
    ]);
    expect(merged.map((m) => [m.position, m.hands])).toEqual([
      ["UTG", 6],
      ["HJ", 4],
      ["CO", 35],
      ["BB", 8],
    ]);
    const co = merged.find((m) => m.position === "CO")!;
    expect(co.decisions).toBe(50);
    expect(co.byPlayerCount).toEqual([
      { playerCount: 6, rawPosition: "CO", hands: 20 },
      { playerCount: 5, rawPosition: "CO", hands: 5 },
      { playerCount: 4, rawPosition: "UTG", hands: 10 },
    ]);
  });
});
