import { describe, expect, it } from "vitest";
import { readHandStrength } from "../src/lib/handStrength";

/**
 * 自分の手がボードにどう当たっているかの判定。
 * オーナーの戦略ノートは TPGK / ミドルヒット / ナッツフラドロ / バックドア といった
 * 粒度で条件を書いているので、ここがずれると解説が的外れな局面に出る。
 */

const hs = (hole: string[], board: string[]) => {
  const r = readHandStrength(hole, board);
  if (!r) throw new Error("判定できない");
  return r;
};

describe("readHandStrength", () => {
  it("手札が2枚揃っていなければ null", () => {
    expect(readHandStrength([null, null], ["As", "7h", "2d"])).toBeNull();
    expect(readHandStrength(["As"], ["As", "7h", "2d"])).toBeNull();
  });

  describe("ペアの当たり方", () => {
    it("TPTK / TPGK / TPLK をキッカーで分ける", () => {
      expect(hs(["Ah", "Kd"], ["As", "7h", "2d"])).toMatchObject({ made: "topPair", kicker: "good" });
      expect(hs(["Kh", "Ad"], ["Ks", "7h", "2d"])).toMatchObject({ made: "topPair", kicker: "top" });
      expect(hs(["Kh", "5d"], ["Ks", "7h", "2d"])).toMatchObject({ made: "topPair", kicker: "low" });
    });

    it("ミドルヒットとボトムヒット", () => {
      expect(hs(["7c", "3d"], ["As", "7h", "2d"]).made).toBe("middlePair");
      expect(hs(["2c", "9d"], ["As", "7h", "2d"]).made).toBe("bottomPair");
    });

    it("オーバーペアと、届いていないポケット", () => {
      expect(hs(["Qc", "Qd"], ["9s", "7h", "2d"]).made).toBe("overPair");
      expect(hs(["5c", "5d"], ["9s", "7h", "2d"]).made).toBe("pocketPairBelow");
    });

    it("セットとツーペア", () => {
      expect(hs(["7c", "7d"], ["As", "7h", "2d"]).made).toBe("trips");
      expect(hs(["Ac", "7d"], ["As", "7h", "2d"]).made).toBe("twoPair");
    });

    it("ボードのペアに絡んでいなければトリップス扱いにしない", () => {
      // ボードが 77 でも、手札が絡んでいなければ自分の役ではない。
      expect(hs(["Kc", "Qd"], ["7s", "7h", "2d"]).made).toBe("highCard");
    });
  });

  describe("完成役", () => {
    it("ストレートとフラッシュ", () => {
      expect(hs(["9c", "8d"], ["7s", "6h", "5d"]).made).toBe("straight");
      expect(hs(["As", "2s"], ["7s", "6s", "5d", "9s"]).made).toBe("flush");
    });

    it("ホイール(A2345)もストレート", () => {
      expect(hs(["Ac", "2d"], ["3s", "4h", "5d"]).made).toBe("straight");
    });

    it("フルハウスとクワッズ", () => {
      expect(hs(["7c", "7d"], ["7s", "2h", "2d"]).made).toBe("fullHouse");
      expect(hs(["7c", "7d"], ["7s", "7h", "2d"]).made).toBe("quads");
    });

    it("手札が絡まないフラッシュは自分のものにしない", () => {
      // ボードが4枚同色でも、手札にその色が無ければフラッシュではない。
      expect(hs(["Kc", "Qd"], ["7s", "6s", "5s", "9s"]).made).not.toBe("flush");
    });
  });

  describe("ドロー", () => {
    it("フラッシュドローとナッツフラッシュドロー", () => {
      expect(hs(["Ks", "4s"], ["7s", "6s", "2d"]).draws).toMatchObject({ flushDraw: true, nutFlushDraw: false });
      expect(hs(["As", "4s"], ["7s", "6s", "2d"]).draws).toMatchObject({ flushDraw: true, nutFlushDraw: true });
    });

    it("バックドアフラドロは3枚のときだけ", () => {
      expect(hs(["As", "4h"], ["7s", "6d", "2s"]).draws.backdoorFlushDraw).toBe(true);
      // 4枚あるならバックドアではなく本物のフラドロ。
      expect(hs(["As", "4s"], ["7s", "6s", "2d"]).draws.backdoorFlushDraw).toBe(false);
    });

    it("オープンエンドとガットショット", () => {
      expect(hs(["9c", "8d"], ["7s", "6h", "2d"]).draws).toMatchObject({ openEnded: true, gutshot: false });
      expect(hs(["9c", "8d"], ["7s", "5h", "2d"]).draws).toMatchObject({ openEnded: false, gutshot: true });
    });

    it("完成していたらドローとは言わない", () => {
      const made = hs(["9c", "8d"], ["7s", "6h", "5d"]);
      expect(made.made).toBe("straight");
      expect(made.draws.openEnded).toBe(false);
      expect(made.draws.gutshot).toBe(false);
    });

    it("2オーバー", () => {
      expect(hs(["Ac", "Kd"], ["9s", "7h", "2d"]).draws.twoOverCards).toBe(true);
      expect(hs(["Ac", "5d"], ["9s", "7h", "2d"]).draws.twoOverCards).toBe(false);
      // ポケットは2オーバーとは呼ばない(オーバーペアとして扱う)。
      expect(hs(["Kc", "Kd"], ["9s", "7h", "2d"]).draws.twoOverCards).toBe(false);
    });

    it("hasAnyDraw はドローが1つでもあれば true", () => {
      expect(hs(["As", "4s"], ["7s", "6s", "2d"]).hasAnyDraw).toBe(true);
      expect(hs(["Ac", "Kd"], ["9s", "7h", "2d"]).hasAnyDraw).toBe(false);
    });
  });
});
