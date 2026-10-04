import { describe, expect, it } from "vitest";
import { DESIGN_HEIGHT, DESIGN_WIDTH, tableLayout } from "../src/components/table3d/geometry";

/**
 * 3D の卓の投影。DOM の席・ボード・ポットは、3D と同じカメラで基準点を投影した位置に置く。
 * カメラや卓の寸法を変えたときに、席が画面の外へ出たり重なったりしないことを確かめる。
 */
describe("tableLayout", () => {
  const l = tableLayout();

  it("卓の外周は設計枠の中に収まる", () => {
    expect(l.bounds.left).toBeGreaterThanOrEqual(0);
    expect(l.bounds.right).toBeLessThanOrEqual(DESIGN_WIDTH);
    expect(l.bounds.top).toBeGreaterThanOrEqual(0);
    expect(l.bounds.bottom).toBeLessThanOrEqual(DESIGN_HEIGHT);
  });

  it("相手の席は設計枠の中にあり、席同士が重ならない(中心どうしが席ブロック1つぶん以上離れる)", () => {
    const seats = [1, 2, 3, 4, 5].map((s) => l.seats[s]!);
    for (const p of seats) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(DESIGN_WIDTH);
      expect(p.y).toBeGreaterThan(40); // 奥の席の手札(席の上に出る)が枠の上で切れない
      expect(p.y).toBeLessThan(DESIGN_HEIGHT * 0.75); // 自席のブロックとぶつからない
    }
    for (let i = 0; i < seats.length; i++) {
      for (let j = i + 1; j < seats.length; j++) {
        const a = seats[i]!;
        const b = seats[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(110);
      }
    }
  });

  it("奥ほど小さく、左右は対称", () => {
    expect(l.seats[3]!.depthScale).toBeLessThan(l.seats[1]!.depthScale);
    expect(l.seats[0]!.depthScale).toBeCloseTo(1, 5);
    expect(l.seats[1]!.x + l.seats[5]!.x).toBeCloseTo(DESIGN_WIDTH, 3);
    expect(l.seats[2]!.y).toBeCloseTo(l.seats[4]!.y, 3);
  });

  it("ポットはボードより奥(画面の上)、ボードは卓の中ほど", () => {
    expect(l.pot.y).toBeLessThan(l.board.y);
    expect(l.board.y).toBeGreaterThan(DESIGN_HEIGHT * 0.35);
    expect(l.board.y).toBeLessThan(DESIGN_HEIGHT * 0.6);
    expect(l.boardTiltDeg).toBeGreaterThan(0);
    expect(l.boardTiltDeg).toBeLessThan(60);
  });
});
