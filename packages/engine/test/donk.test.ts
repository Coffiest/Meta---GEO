import { describe, expect, it } from "vitest";
import { judgeDonk, readDonkReason } from "../src/review/spotPlans.js";

describe("ドンク(オーナー基準)", () => {
  it("フロップはローコネクトボードだけ", () => {
    expect(readDonkReason("flop", ["7h", "6d", "4c"])).toBe("connectBoard");
    expect(readDonkReason("flop", ["8h", "4d", "2c"])).toBeNull();
    expect(readDonkReason("flop", ["Kh", "Qd", "Jc"])).toBeNull();
  });

  it("ターンリピートでコールしていたペアがトリップスになったら、ドンクを打つ場面(チェックは緩手)", () => {
    const v = judgeDonk("turn", ["9s", "8c"], ["Kh", "9d", "3c", "9h"], "srp", null)!;
    expect(v.reason).toBe("turnRepeat");
    expect(v.fit).toBe("nutClass");
    expect(v.grade).toBe("inaccuracy");
  });

  it("理由の無い場面で打ったら悪手、チェックなら最善", () => {
    expect(judgeDonk("turn", ["Ts", "8c"], ["Kh", "9d", "3c", "2h"], "srp", { size: "small" })!.grade).toBe("mistake");
    expect(judgeDonk("turn", ["Ts", "8c"], ["Kh", "9d", "3c", "2h"], "srp", null)!.grade).toBe("best");
  });
});
