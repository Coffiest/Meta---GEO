import { describe, expect, it } from "vitest";
import { decayRd, glickoUpdate } from "../src/chessRating";

describe("レート(Glicko)", () => {
  it("Glickman の論文の例と同じ向き: 勝てば上がり、負ければ下がる。RD は小さくなる", () => {
    const me = { rating: 1500, rd: 200 };
    const win = glickoUpdate(me, { rating: 1400, rd: 30 }, 1);
    const loss = glickoUpdate(me, { rating: 1400, rd: 30 }, 0);
    expect(win.rating).toBeGreaterThan(1500);
    expect(loss.rating).toBeLessThan(1500);
    expect(win.rd).toBeLessThan(200);
  });

  it("新しい人(RD 350)は大きく動き、慣れた人(RD 50)は小さく動く", () => {
    const opp = { rating: 1200, rd: 100 };
    const fresh = glickoUpdate({ rating: 1200, rd: 350 }, opp, 1).rating - 1200;
    const settled = glickoUpdate({ rating: 1200, rd: 50 }, opp, 1).rating - 1200;
    expect(fresh).toBeGreaterThan(settled * 3);
    expect(settled).toBeGreaterThan(3);
    expect(settled).toBeLessThan(20);
  });

  it("遊ばない日が続くと RD が戻る(上限 350)", () => {
    const ago = new Date(Date.now() - 365 * 86_400_000);
    expect(decayRd(50, ago)).toBeCloseTo(350, 0);
    expect(decayRd(50, null)).toBe(50);
  });
});
