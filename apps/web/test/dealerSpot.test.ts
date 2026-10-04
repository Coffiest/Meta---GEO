import { describe, expect, it } from "vitest";
import { findDealerSpot } from "../src/components/PokerTable";

const R = 14;
const bounds = { width: 448, height: 597 };
const center = { x: 224, y: 298 };
const hit = (p: { x: number; y: number }, b: { left: number; top: number; right: number; bottom: number }) =>
  p.x + R > b.left && p.x - R < b.right && p.y + R > b.top && p.y - R < b.bottom;

describe("findDealerSpot: ディーラーボタンは席・手札・表示に絶対に重ならない", () => {
  it("BTN の席から卓の中心へ向かい、どの邪魔ものにも重ならない最初の点に置く", () => {
    const seat = { left: 0, top: 280, right: 96, bottom: 360 };
    const pot = { left: 160, top: 180, right: 290, bottom: 205 };
    const spot = findDealerSpot({ anchor: seat, obstacles: [seat, pot], center, radius: R, bounds })!;
    expect(spot).not.toBeNull();
    expect(hit(spot, seat)).toBe(false);
    expect(hit(spot, pot)).toBe(false);
    // 席のすぐ前(卓の中心寄り)に置かれる。
    expect(spot.x).toBeGreaterThan(96);
    expect(spot.x).toBeLessThan(140);
  });

  it("正面がふさがっていれば、横にずらした直線で空きを探す", () => {
    const seat = { left: 0, top: 280, right: 96, bottom: 360 };
    // 席の正面から卓の中心まで一直線にふさぐ帯。
    const wall = { left: 96, top: 296, right: 300, bottom: 344 };
    const spot = findDealerSpot({ anchor: seat, obstacles: [seat, wall], center, radius: R, bounds })!;
    expect(spot).not.toBeNull();
    expect(hit(spot, wall)).toBe(false);
    expect(hit(spot, seat)).toBe(false);
  });

  it("置ける場所が無ければ null(重ねて置くことはしない)", () => {
    const seat = { left: 0, top: 0, right: 448, bottom: 597 };
    expect(findDealerSpot({ anchor: seat, obstacles: [seat], center, radius: R, bounds })).toBeNull();
  });
});
