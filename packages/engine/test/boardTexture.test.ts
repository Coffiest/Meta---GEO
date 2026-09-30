import { describe, expect, it } from "vitest";
import { bandOf, readBoardTexture } from "../src/review/boardTexture";

/**
 * ボード質感の判定。ここが狂うと、解説がまるで関係ない局面に出る(あるいは一生出ない)。
 * オーナーのノートに実例として出てくるボードで校正してある。
 */

const tex = (cards: string[]) => {
  const t = readBoardTexture(cards);
  if (!t) throw new Error("読めないボード");
  return t;
};

describe("bandOf", () => {
  it("オーナー確定の帯: L=2〜4 / M=5〜9 / H=T〜A", () => {
    expect([2, 3, 4].map(bandOf)).toEqual(["L", "L", "L"]);
    expect([5, 9].map(bandOf)).toEqual(["M", "M"]);
    expect([10, 11, 12, 13, 14].map(bandOf)).toEqual(["H", "H", "H", "H", "H"]);
  });
});

describe("readBoardTexture", () => {
  it("読めるカードが無ければ null", () => {
    expect(readBoardTexture([])).toBeNull();
    expect(readBoardTexture(["??", "xx"])).toBeNull();
  });

  it("高い順に並べ、帯の形を出す", () => {
    const t = tex(["5c", "As", "3d"]);
    expect(t.ranks).toEqual([14, 5, 3]);
    expect(t.shape).toBe("H-M-L");
    expect(t.isAceHigh).toBe(true);
    expect(t.broadwayCount).toBe(1);
  });

  it("A53 は A-M-L(L=2〜4 に揃えたので 5 はミドル)", () => {
    // ノートには「A-L-L(5以下)」と書かれた箇所もあるが、帯の定義は
    // 【ミドルペアボード】側(L=2〜4)に揃える、とオーナーが決めた。
    expect(tex(["As", "5h", "3d"]).shape).toBe("H-M-L");
    expect(tex(["As", "4h", "3d"]).shape).toBe("H-L-L");
  });

  it("ペアとトリップスを見分ける", () => {
    const pair = tex(["6s", "6h", "Ad"]);
    expect(pair.isPaired).toBe(true);
    expect(pair.pairBand).toBe("M");
    expect(pair.isTrips).toBe(false);

    const lowPair = tex(["3s", "3h", "Ad"]);
    expect(lowPair.pairBand).toBe("L");

    const trips = tex(["7s", "7h", "7d"]);
    expect(trips.isTrips).toBe(true);
    expect(trips.isPaired).toBe(true);
  });

  it("スートの散り方", () => {
    expect(tex(["As", "7s", "5s"]).suit).toBe("monotone");
    expect(tex(["As", "7s", "5h"]).suit).toBe("twotone");
    expect(tex(["As", "7h", "5d"]).suit).toBe("rainbow");
  });

  it("HMギャップは最高ランクと2番目の差", () => {
    expect(tex(["Qs", "7h", "5d"]).hmGap).toBe(5); // Q(12) - 7
    expect(tex(["Ks", "Qh", "5d"]).hmGap).toBe(1);
  });

  it("ブロードウェイの枚数(ノートの「2BW」)", () => {
    expect(tex(["Ks", "Qh", "5d"]).broadwayCount).toBe(2);
    expect(tex(["As", "Kh", "Qd"]).broadwayCount).toBe(3);
    expect(tex(["9s", "7h", "5d"]).broadwayCount).toBe(0);
  });

  describe("ドローの多寡(ノートの実例で校正)", () => {
    it("Q75r はドライ", () => {
      // 【🎈A〜Jhi HMnSD】に「ドライなA~Jハイボード。Q75rなど。」とある。
      const t = tex(["Qs", "7h", "5d"]);
      expect(t.draws).toBe("dry");
    });

    it("A82r はドライ", () => {
      // 【プロテクションについて】のプロテクションが成り立つ例。
      expect(tex(["As", "8h", "2d"]).draws).toBe("dry");
    });

    it("JT9 のツートーンはドローヘビー", () => {
      const t = tex(["Js", "Ts", "9h"]);
      expect(t.draws).toBe("drawHeavy");
      expect(t.hasStraightDraw).toBe(true);
    });

    it("モノトーンでもフラッシュドローは1本としか数えない", () => {
      // 3枚同じスートでも2本に増やさない(増やすと全モノトーンがドローヘビーに倒れる)。
      const mono = tex(["As", "8s", "2s"]);
      const two = tex(["As", "8s", "2h"]);
      expect(mono.drawCount).toBe(two.drawCount);
      expect(mono.suit).toBe("monotone");
    });

    it("エースは高低どちらでも数える(ホイール方向を拾う)", () => {
      // A-3 は A を 1 と見れば差 2 なので、ストレート方向の組として数える。
      expect(tex(["As", "3h", "9d"]).hasStraightDraw).toBe(true);
    });
  });

  it("ターン・リバーでも判定できる", () => {
    const turn = tex(["As", "8h", "2d", "8c"]);
    expect(turn.cardCount).toBe(4);
    expect(turn.isPaired).toBe(true);
    const river = tex(["As", "8h", "2d", "8c", "Kh"]);
    expect(river.cardCount).toBe(5);
    expect(river.broadwayCount).toBe(2);
  });
});

describe("フラッシュが成立しうるか", () => {
  it("同じスートが3枚以上あるときだけ true", () => {
    expect(tex(["As", "8s", "2s"]).flushPossible).toBe(true);
    expect(tex(["As", "8s", "2d"]).flushPossible).toBe(false);
  });

  it("5枚のボードでは twotone がほぼ常に真になるので、そちらでは締められない", () => {
    const t = tex(["As", "8h", "2d", "Kc", "3s"]);
    expect(t.suit).toBe("twotone"); // スペード2枚
    expect(t.flushPossible).toBe(false); // でもフラッシュは無い
    expect(t.maxSuitCount).toBe(2);
  });
});
