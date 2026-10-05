import { describe, expect, it } from "vitest";
import { DESIGN_HEIGHT, DESIGN_WIDTH, designHeightFor, tableLayout } from "../src/components/table3d/geometry";

/**
 * 3D の卓の投影。DOM の席・ボード・ポット・ディーラーボタンは、3D と同じカメラで基準点を投影した位置に置く。
 * 設計枠の高さは端末の縦横比で変わる(597〜860)。どの高さでも卓が枠に収まり、席が重ならないことを確かめる。
 */
const HEIGHTS = [597, 680, 760, 860];

describe("designHeightFor", () => {
  it("縦長の画面ほど枠を高くする(597〜860、10px 刻み)", () => {
    expect(designHeightFor(386, 520)).toBe(600);
    expect(designHeightFor(386, 620)).toBe(720);
    expect(designHeightFor(386, 2000)).toBe(860);
    expect(designHeightFor(800, 500)).toBe(DESIGN_HEIGHT);
  });
});

describe.each(HEIGHTS)("tableLayout(%i)", (H) => {
  const l = tableLayout(H);

  it("卓の外周は設計枠の中に収まり、上下の余白は奥の席の手札と自席のブロックのぶんだけ", () => {
    expect(l.bounds.left).toBeGreaterThanOrEqual(0);
    expect(l.bounds.right).toBeLessThanOrEqual(DESIGN_WIDTH);
    expect(l.bounds.top).toBeGreaterThanOrEqual(74);
    expect(l.bounds.bottom).toBeLessThanOrEqual(H - 50);
    // 卓が枠の縦を使い切っている(上下に帯を余らせない)。
    expect(l.bounds.bottom - l.bounds.top).toBeGreaterThan(H - 140);
  });

  it("相手の席は枠の中にあり、重ならない", () => {
    const seats = [1, 2, 3, 4, 5].map((s) => l.seats[s]!);
    for (const p of seats) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(DESIGN_WIDTH);
      expect(p.y).toBeGreaterThan(40);
      expect(p.y).toBeLessThan(H * 0.75);
    }
    for (let i = 0; i < seats.length; i++) {
      for (let j = i + 1; j < seats.length; j++) {
        expect(Math.hypot(seats[i]!.x - seats[j]!.x, seats[i]!.y - seats[j]!.y)).toBeGreaterThan(110);
      }
    }
  });

  it("ディーラーボタンは、その席に一番近い(誰のボタンか一目で分かる)", () => {
    for (const slot of [0, 1, 2, 3, 4, 5]) {
      const d = l.dealer[slot]!;
      const dist = (s: number) => Math.hypot(l.seats[s]!.x - d.x, l.seats[s]!.y - d.y);
      for (const other of [0, 1, 2, 3, 4, 5]) {
        if (other !== slot) expect(dist(slot), `slot ${slot} vs ${other}`).toBeLessThan(dist(other));
      }
      // 席の中心(名前の板)とは重ならない距離にある。
      expect(dist(slot)).toBeGreaterThan(40);
      // ボードの帯とは重ならない。
      expect(Math.abs(d.y - l.board.y) > 45 || Math.abs(d.x - l.board.x) > 140).toBe(true);
    }
  });

  it("奥ほど小さく、左右は対称。ポットはボードより奥", () => {
    expect(l.seats[3]!.depthScale).toBeLessThan(l.seats[1]!.depthScale);
    expect(l.seats[1]!.x + l.seats[5]!.x).toBeCloseTo(DESIGN_WIDTH, 3);
    expect(l.pot.y).toBeLessThan(l.board.y);
    expect(l.boardTiltDeg).toBeGreaterThan(0);
    expect(l.boardTiltDeg).toBeLessThan(60);
  });
});
