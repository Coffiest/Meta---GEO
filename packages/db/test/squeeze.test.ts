import { describe, expect, it } from "vitest";
import { squeezeFacts } from "../src/reviewGto.js";

describe("スクイーズの判定材料(オープンレンジの上位半分)", () => {
  it("AA は上位半分、72o は入らない", () => {
    const aa = squeezeFacts({ openerPos: "CO", heroPos: "BB", handClass: "AA", effStackBb: 60 });
    const trash = squeezeFacts({ openerPos: "CO", heroPos: "BB", handClass: "72o", effStackBb: 60 });
    expect(aa?.inTopHalf).toBe(true);
    expect(trash?.inTopHalf).toBe(false);
  });
});
