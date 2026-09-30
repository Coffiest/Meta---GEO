import { describe, expect, it } from "vitest";
import { sizeClassOf, type BetRoleInfo } from "../src/review/betRole.js";
import { judgeBet, readBoardChange } from "../src/review/strategyVerdict.js";

/**
 * 戦略判定のテスト。「付くべき所に付く」と同じくらい「付いてはいけない所に付かない」を固める
 * (バッジを上書きするので、誤爆すると正しい手に大悪手が付く)。
 */

function info(over: Partial<BetRoleInfo> = {}): BetRoleInfo {
  const potFraction = over.potFraction ?? 0.4;
  return {
    sequenceNumber: 1,
    seatIndex: 2,
    street: "river",
    role: "otherBet",
    isOriginalRaiser: false,
    position: "OOP",
    potFraction,
    sizeClass: sizeClassOf(potFraction),
    streak: 1,
    leadAfterCall: false,
    ...over,
  };
}

// ドライなボード(リバー時点でスートは2枚まで・ドローなし)。
const DRY = ["As", "7h", "2d", "Kc", "3s"];
// 同スート3枚(フラッシュ完成)のリバー。
const FLUSH = ["9s", "8s", "2d", "Kc", "3s"];

describe("シンバリューベット → 絶妙手", () => {
  it("トップペア・グッドキッカーで、OOP から小さく打てばシンバリュー", () => {
    const v = judgeBet(info({ potFraction: 0.4, position: "OOP" }), ["Ah", "Qd"], DRY);
    expect(v.tag).toBe("thinValue");
    expect(v.override).toBe("artistic");
  });

  it("IP なら大きめ(〜85%)でもシンバリュー", () => {
    const v = judgeBet(info({ potFraction: 0.75, position: "IP" }), ["Ah", "Qd"], DRY);
    expect(v.tag).toBe("thinValue");
  });

  it("ミドルペアの安いベットもシンバリュー(セカンドヒットの激安ベット)", () => {
    // ボードの最高は K、2番目の J にヒット = ミドルペア。
    const v = judgeBet(info({ potFraction: 0.33, position: "OOP" }), ["Jd", "9h"], ["7d", "Ks", "2c", "Jh", "3s"]);
    expect(v.tag).toBe("thinValue");
    expect(v.override).toBe("artistic");
  });

  it("フラッシュが完成しうるボードではシンバリューにしない", () => {
    const v = judgeBet(info({ potFraction: 0.3, position: "OOP" }), ["Kh", "Qd"], FLUSH);
    expect(v.tag).not.toBe("thinValue");
  });
});

describe("マージナルベット → 大悪手", () => {
  it("ボトムペアで、ブロックより大きく打てばマージナル", () => {
    // 2 にヒット = ボードの最下位ランクにヒット。
    const v = judgeBet(info({ potFraction: 0.6 }), ["2h", "9c"], DRY);
    expect(v.tag).toBe("marginalBet");
    expect(v.reason).toBe("marginalWeakHand");
    expect(v.override).toBe("blunder");
  });

  it("ボトムペアでも、ブロックサイズなら咎めない", () => {
    const v = judgeBet(info({ potFraction: 0.33 }), ["2h", "9c"], DRY);
    expect(v.tag).toBeNull();
    expect(v.override).toBeNull();
  });

  it("トップペアでポットサイズを打てば、より強い手しかコールしない → マージナル", () => {
    const v = judgeBet(info({ potFraction: 1.0, position: "IP" }), ["Ah", "Qd"], DRY);
    expect(v.tag).toBe("marginalBet");
    expect(v.reason).toBe("marginalSizeTooBig");
  });

  it("OOP のトップペアが中サイズ(60%超)を打つのはマージナル", () => {
    const v = judgeBet(info({ potFraction: 0.7, position: "OOP" }), ["Ah", "Qd"], DRY);
    expect(v.tag).toBe("marginalBet");
  });

  it("フラッシュ完成ボードで、ペア止まりの手が小さくなく打てばマージナル", () => {
    const v = judgeBet(info({ potFraction: 0.6, position: "IP" }), ["Kh", "Qd"], FLUSH);
    expect(v.tag).toBe("marginalBet");
    expect(v.reason).toBe("marginalFlushBoard");
  });

  it("オーバーペアは、大きく打ってもサイズでは咎めない(強めのバリューハンド)", () => {
    const v = judgeBet(info({ potFraction: 1.0, position: "IP" }), ["Qh", "Qd"], ["Js", "7h", "2d", "9c", "3s"]);
    expect(v.tag).not.toBe("marginalBet");
  });

  it("ツーペア以上は、大きく打ってもマージナルではない", () => {
    const v = judgeBet(info({ potFraction: 1.2, position: "IP" }), ["Ah", "Kd"], DRY);
    expect(v.tag).toBeNull();
    expect(v.override).toBeNull();
  });

  it("額の分からないオールインは、サイズ由来の判定をしない", () => {
    const v = judgeBet(info({ potFraction: null, sizeClass: null }), ["2h", "9c"], DRY);
    expect(v.override).toBeNull();
  });
});

describe("リバーのフラドロミス・ブラフ → 悪手", () => {
  // ターンで J♠T♠ + 9♠8♠ = フラドロ(かつOESD)。リバーは 3♥ でブランク。
  const BOARD = ["9s", "8s", "2d", "Kc", "3h"];

  it("フラドロが外れて役なしのまま打てば悪手", () => {
    const v = judgeBet(info({ potFraction: 0.75, position: "IP" }), ["Js", "Ts"], BOARD);
    expect(v.tag).toBe("flushDrawMissBluff");
    expect(v.override).toBe("mistake");
  });

  it("フラッシュが完成した(役がある)なら、それはバリューで悪手ではない", () => {
    const v = judgeBet(info({ potFraction: 0.75, position: "IP" }), ["Js", "Ts"], ["9s", "8s", "2d", "Kc", "3s"]);
    expect(v.tag).not.toBe("flushDrawMissBluff");
    expect(v.override).toBeNull();
  });

  it("フラドロではない役なしのブラフは、この判定の対象外", () => {
    const v = judgeBet(info({ potFraction: 0.75, position: "IP" }), ["Ah", "Qd"], ["9s", "8s", "2d", "Kc", "3h"]);
    expect(v.tag).not.toBe("flushDrawMissBluff");
  });

  it("OOP の先打ち(ドンク)でも、フラドロ外しのブラフは悪手のまま", () => {
    const v = judgeBet(info({ role: "donk", potFraction: 0.5, position: "OOP" }), ["Js", "Ts"], BOARD);
    expect(v.tag).toBe("flushDrawMissBluff");
    expect(v.override).toBe("mistake");
  });

  it("ペアが出来ていれば、フラドロ外れでもこの判定にはならない", () => {
    const v = judgeBet(info({ potFraction: 0.75, position: "IP" }), ["Js", "9d"], BOARD);
    expect(v.tag).not.toBe("flushDrawMissBluff");
  });
});

describe("ドンクの良し悪し(上書きしない)", () => {
  it("ターンのリピート(ペアが乗る)は良いドンク", () => {
    const v = judgeBet(info({ role: "donk", street: "turn" }), ["Ah", "Qd"], ["Ks", "8h", "2d", "8c", "3s"]);
    expect(v.tag).toBe("goodDonk");
    expect(v.reason).toBe("donkTurnRepeat");
    expect(v.override).toBeNull();
  });

  it("リバーでフラッシュが完成した局面のドンクは良い(レンジがOOPに移った)", () => {
    const v = judgeBet(info({ role: "donk", street: "river" }), ["Ah", "Qd"], ["9s", "8s", "2d", "Kc", "3s"]);
    expect(v.tag).toBe("goodDonk");
    expect(v.reason).toBe("donkFlushCompleted");
  });

  it("何も変わっていないリバーの純粋なドンクは悪い", () => {
    const v = judgeBet(info({ role: "donk", street: "river" }), ["Ah", "Qd"], DRY);
    expect(v.tag).toBe("badDonk");
    expect(v.reason).toBe("donkNoReason");
    expect(v.override).toBeNull();
  });

  it("フロップのローボードでのドンクは良い", () => {
    const v = judgeBet(info({ role: "donk", street: "flop" }), ["Ah", "Qd"], ["6s", "4h", "3d", "Kc", "9s"]);
    expect(v.tag).toBe("goodDonk");
    expect(v.reason).toBe("donkLowBoard");
  });
});

describe("盤面の変化", () => {
  it("フロップには比べる相手がいない", () => {
    expect(readBoardChange("flop", DRY)).toBeNull();
  });

  it("同スートが3枚になったら フラッシュ完成", () => {
    expect(readBoardChange("river", FLUSH)).toBe("flushCompleted");
  });

  it("ペアが乗ったら paired", () => {
    expect(readBoardChange("turn", ["Ks", "8h", "2d", "8c", "3s"])).toBe("paired");
  });

  it("何も起きなければ blank", () => {
    expect(readBoardChange("river", ["As", "7h", "2d", "5c", "3s"])).toBe("blank");
  });
});
