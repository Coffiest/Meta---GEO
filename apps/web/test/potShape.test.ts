import { describe, expect, it } from "vitest";
import { blindSeatsOf, readPotShape } from "../src/lib/potShape";

/**
 * ポットの形(SRP / 3betPot / リンプ / BvB)の判定。
 * オーナーの戦略ノートはこの区別で書かれているので、ここがずれると
 * 3betPot 向けの解説がリンプポットに出る、といったことが起きる。
 */

const T = { buttonFixedPos: 0, seatCount: 6 };
const a = (seatIndex: number, kind: string, street = "preflop") => ({ seatIndex, street, kind });

describe("blindSeatsOf", () => {
  it("ボタンの1つ次がSB、2つ次がBB", () => {
    expect(blindSeatsOf(0, 6)).toEqual({ smallBlind: 1, bigBlind: 2 });
    expect(blindSeatsOf(5, 6)).toEqual({ smallBlind: 0, bigBlind: 1 });
  });
});

describe("readPotShape", () => {
  it("ブラインドとアンティは意思ではないのでレイズに数えない", () => {
    const got = readPotShape([a(1, "postBlind"), a(2, "postBlind"), a(3, "postAnte"), a(3, "fold")], T);
    expect(got).toMatchObject({ type: "limped", raiseCount: 0 });
  });

  it("誰もレイズしなければリンプポット", () => {
    expect(readPotShape([a(3, "call"), a(1, "call"), a(2, "check")], T).type).toBe("limped");
  });

  it("レイズ1回で SRP", () => {
    expect(readPotShape([a(3, "raise"), a(2, "call")], T).type).toBe("srp");
  });

  it("レイズ2回で 3betPot", () => {
    expect(readPotShape([a(3, "raise"), a(5, "raise"), a(3, "call")], T).type).toBe("threeBet");
  });

  it("レイズ3回以上で 4bet以上", () => {
    expect(readPotShape([a(3, "raise"), a(5, "raise"), a(3, "raise"), a(5, "call")], T).type).toBe("fourBetPlus");
  });

  it("オールインもレイズとして数える", () => {
    expect(readPotShape([a(3, "raise"), a(5, "allIn"), a(3, "call")], T).type).toBe("threeBet");
  });

  it("プリフロップ以外のアクションは無視する", () => {
    const got = readPotShape([a(3, "raise"), a(2, "call"), a(2, "raise", "flop"), a(3, "raise", "flop")], T);
    expect(got.type).toBe("srp");
  });

  describe("BvB", () => {
    it("SBとBBだけが残ればBvB", () => {
      const got = readPotShape([a(3, "fold"), a(4, "fold"), a(5, "fold"), a(0, "fold"), a(1, "raise"), a(2, "call")], T);
      expect(got.isBlindVsBlind).toBe(true);
    });

    it("ブラインド以外が残っていればBvBではない", () => {
      const got = readPotShape([a(3, "raise"), a(4, "fold"), a(5, "fold"), a(0, "fold"), a(1, "fold"), a(2, "call")], T);
      expect(got.isBlindVsBlind).toBe(false);
    });

    it("3人残ればBvBではない", () => {
      const got = readPotShape([a(3, "call"), a(4, "fold"), a(5, "fold"), a(0, "fold"), a(1, "call"), a(2, "check")], T);
      expect(got.isBlindVsBlind).toBe(false);
    });
  });
});
