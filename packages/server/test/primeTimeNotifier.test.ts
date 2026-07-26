import { describe, expect, it } from "vitest";
import { jstDateKey, shouldNotifyAt } from "../src/primeTimeNotifier.js";

describe("prime time reminder timing", () => {
  it("fires only during the minute 10 minutes before 21:00 JST", () => {
    // JST 20:50 = UTC 11:50
    expect(shouldNotifyAt(new Date("2026-07-26T11:50:00Z"))).toBe(true);
    expect(shouldNotifyAt(new Date("2026-07-26T11:50:59Z"))).toBe(true);
    expect(shouldNotifyAt(new Date("2026-07-26T11:49:59Z"))).toBe(false);
    expect(shouldNotifyAt(new Date("2026-07-26T11:51:00Z"))).toBe(false);
    // プライムタイム開始時刻そのものでは送らない(10分前だけ)。
    expect(shouldNotifyAt(new Date("2026-07-26T12:00:00Z"))).toBe(false);
  });

  it("keys the once-a-day guard by the JST date, not UTC", () => {
    // UTC 15:00 は JST では翌日 0:00。日付キーは翌日側になる。
    expect(jstDateKey(new Date("2026-07-26T15:00:00Z"))).toBe("2026-07-27");
    expect(jstDateKey(new Date("2026-07-26T11:50:00Z"))).toBe("2026-07-26");
    // 同じ通知時刻なら同じキー(二重送信のガードが効く)。
    expect(jstDateKey(new Date("2026-07-26T11:50:10Z"))).toBe(jstDateKey(new Date("2026-07-26T11:50:50Z")));
  });
});
