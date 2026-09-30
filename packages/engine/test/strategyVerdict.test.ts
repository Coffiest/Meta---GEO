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
    expect(v.grade).toBe("artistic");
  });

  it("IP なら大きめ(〜85%)でもシンバリュー", () => {
    const v = judgeBet(info({ potFraction: 0.75, position: "IP" }), ["Ah", "Qd"], DRY);
    expect(v.tag).toBe("thinValue");
  });

  it("ミドルペアの安いベットもシンバリュー(セカンドヒットの激安ベット)", () => {
    // ボードの最高は K、2番目の J にヒット = ミドルペア。
    const v = judgeBet(info({ potFraction: 0.33, position: "OOP" }), ["Jd", "9h"], ["7d", "Ks", "2c", "Jh", "3s"]);
    expect(v.tag).toBe("thinValue");
    expect(v.grade).toBe("artistic");
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
    expect(v.grade).toBe("blunder");
  });

  it("ボトムペアでも、ブロックサイズなら咎めない", () => {
    const v = judgeBet(info({ potFraction: 0.33 }), ["2h", "9c"], DRY);
    expect(v.tag).toBeNull();
    expect(v.grade).toBeNull();
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
    expect(v.grade).toBeNull();
  });

  it("額の分からないオールインは、サイズ由来の判定をしない", () => {
    const v = judgeBet(info({ potFraction: null, sizeClass: null }), ["2h", "9c"], DRY);
    expect(v.grade).toBeNull();
  });
});

describe("リバーのフラドロミス・ブラフ → 悪手", () => {
  // ターンで J♠T♠ + 9♠8♠ = フラドロ(かつOESD)。リバーは 3♥ でブランク。
  const BOARD = ["9s", "8s", "2d", "Kc", "3h"];

  it("フラドロが外れて役なしのまま打てば悪手", () => {
    const v = judgeBet(info({ potFraction: 0.75, position: "IP" }), ["Js", "Ts"], BOARD);
    expect(v.tag).toBe("flushDrawMissBluff");
    expect(v.grade).toBe("mistake");
  });

  it("フラッシュが完成した(役がある)なら、それはバリューで悪手ではない", () => {
    const v = judgeBet(info({ potFraction: 0.75, position: "IP" }), ["Js", "Ts"], ["9s", "8s", "2d", "Kc", "3s"]);
    expect(v.tag).not.toBe("flushDrawMissBluff");
    expect(v.grade).toBeNull();
  });

  it("フラドロではない役なしのブラフは、この判定の対象外", () => {
    const v = judgeBet(info({ potFraction: 0.75, position: "IP" }), ["Ah", "Qd"], ["9s", "8s", "2d", "Kc", "3h"]);
    expect(v.tag).not.toBe("flushDrawMissBluff");
  });

  it("OOP の先打ち(ドンク)でも、フラドロ外しのブラフは悪手のまま", () => {
    const v = judgeBet(info({ role: "donk", potFraction: 0.5, position: "OOP" }), ["Js", "Ts"], BOARD);
    expect(v.tag).toBe("flushDrawMissBluff");
    expect(v.grade).toBe("mistake");
  });

  it("ペアが出来ていれば、フラドロ外れでもこの判定にはならない", () => {
    const v = judgeBet(info({ potFraction: 0.75, position: "IP" }), ["Js", "9d"], BOARD);
    expect(v.tag).not.toBe("flushDrawMissBluff");
  });
});

describe("ドンクの良し悪し(成立=良手 / 不成立=悪手)", () => {
  it("ターンのリピート(ペアが乗る)は良いドンク", () => {
    const v = judgeBet(info({ role: "donk", street: "turn" }), ["Ah", "Qd"], ["Ks", "8h", "2d", "8c", "3s"]);
    expect(v.tag).toBe("goodDonk");
    expect(v.reason).toBe("donkTurnRepeat");
    expect(v.grade).toBe("excellent");
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
    expect(v.grade).toBe("mistake");
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

describe("フロップのジャム", () => {
  it("OOP・SPR2以下・オーバーペアでオールインは Great", () => {
    const v = judgeBet(info({ street: "flop", role: "otherBet", position: "OOP", potFraction: null, sizeClass: null }),
      ["Jh", "Jd"], ["9s", "6h", "2d", "Kc", "3s"], { isAllIn: true, spr: 1.8 });
    expect(v.reason).toBe("overpairJamLowSpr");
    expect(v.grade).toBe("great");
  });

  it("SPR が深ければ当たらない", () => {
    const v = judgeBet(info({ street: "flop", role: "otherBet", position: "OOP", potFraction: null, sizeClass: null }),
      ["Jh", "Jd"], ["9s", "6h", "2d", "Kc", "3s"], { isAllIn: true, spr: 6 });
    expect(v.reason).not.toBe("overpairJamLowSpr");
  });
});

describe("CB(ボード別の推奨サイズ)", () => {
  const cb = (f: number) => info({ street: "flop", role: "cbet", position: "IP", potFraction: f, sizeClass: sizeClassOf(f) });

  it("3betPot でオーバーベットは悪手、小さめは最善", () => {
    const board = ["Ks", "8h", "3d", "2c", "4s"];
    expect(judgeBet(cb(1.3), ["Ah", "Kd"], board, { potType: "threeBet" }).grade).toBe("mistake");
    const small = judgeBet(cb(0.3), ["Ah", "Kd"], board, { potType: "threeBet" });
    expect(small.reason).toBe("cb3bet");
    expect(small.grade).toBe("best");
  });

  it("A-M-L でミドルヒットを33%は最善(A82r型のプロテクション)", () => {
    const v = judgeBet(cb(0.33), ["8c", "7d"], ["As", "8h", "2d", "Kc", "3s"], { potType: "srp" });
    expect(v.reason).toBe("cbAmlMiddleHit");
    expect(v.grade).toBe("best");
  });

  it("A-M-L 以外でミドルヒットを打つのは緩手(ベット頻度が超低い手)", () => {
    const v = judgeBet(cb(0.33), ["9c", "8d"], ["Ks", "9h", "3d", "2c", "4s"], { potType: "srp" });
    expect(v.reason).toBe("cbLowFreqHand");
    expect(v.grade).toBe("inaccuracy");
  });

  it("A-H-x は 125% が最善、中サイズは緩手", () => {
    const board = ["As", "Qh", "5d", "2c", "4s"];
    expect(judgeBet(cb(1.25), ["Kh", "Kd"], board).grade).toBe("best");
    const mid = judgeBet(cb(0.7), ["Kh", "Kd"], board);
    expect(mid.reason).toBe("cbAceHighBroadway");
    expect(mid.grade).toBe("inaccuracy");
  });

  it("ペアボードは 1/3 か 150% が最善、中サイズは緩手", () => {
    const board = ["Ks", "6h", "6d", "2c", "4s"];
    expect(judgeBet(cb(0.33), ["Ah", "Qd"], board).grade).toBe("best");
    expect(judgeBet(cb(1.5), ["Ah", "Qd"], board).grade).toBe("best");
    expect(judgeBet(cb(0.7), ["Ah", "Qd"], board).grade).toBe("inaccuracy");
  });

  it("ローボードでミドルオーバーペアのオールインは最善", () => {
    const v = judgeBet(cb(0.4), ["Th", "Td"], ["8s", "5h", "3d", "Kc", "2s"], { isAllIn: true });
    expect(v.reason).toBe("cbLowBoard");
    expect(v.grade).toBe("best");
  });

  it("ドライなKハイは33%が最善、Qハイなら50%も最善", () => {
    expect(judgeBet(cb(0.33), ["Ah", "Kd"], ["Ks", "7h", "2d", "Jc", "3s"]).grade).toBe("best");
    expect(judgeBet(cb(0.5), ["Ah", "Qd"], ["Qs", "7h", "2d", "Jc", "3s"]).grade).toBe("best");
    expect(judgeBet(cb(0.5), ["Ah", "Kd"], ["Ks", "7h", "2d", "Jc", "3s"]).grade).toBe("good");
  });

  it("ボードに推奨が無い CB は評価しない(GTOのまま)", () => {
    // J-T-7 のレインボーは「普通」のドロー量で、ノートに推奨サイズが無い。
    const v = judgeBet(cb(0.5), ["Ah", "Ad"], ["Js", "Th", "7c", "2d", "3h"]);
    expect(v.grade).toBeNull();
  });
});

describe("ディレイCB・バレル", () => {
  it("ディレイCBは CB より少し大きめ(中〜大)が最善、ブロックは緩手", () => {
    const board = ["Ks", "7h", "2d", "5c", "3s"];
    const d = (f: number) => info({ street: "turn", role: "delayedCbet", position: "IP", potFraction: f, sizeClass: sizeClassOf(f) });
    expect(judgeBet(d(0.75), ["Ah", "Kd"], board).grade).toBe("best");
    expect(judgeBet(d(0.3), ["Ah", "Kd"], board).grade).toBe("inaccuracy");
  });

  it("ターンバレルはポラライズした手で大きめが最善、微妙な手は緩手", () => {
    const board = ["Ks", "7h", "2d", "Ac", "3s"];
    const b = (f: number) => info({ street: "turn", role: "turnBarrel", position: "IP", potFraction: f, sizeClass: sizeClassOf(f), streak: 2 });
    expect(judgeBet(b(0.75), ["Ah", "Kd"], board).grade).toBe("best"); // 2P
    expect(judgeBet(b(0.75), ["Qh", "Jd"], board).grade).toBe("best"); // エア
    const mid = judgeBet(b(0.75), ["7c", "6d"], board); // ミドルペア
    expect(mid.reason).toBe("barrelMarginal");
    expect(mid.grade).toBe("inaccuracy");
  });
});

describe("チェックレイズ", () => {
  const cr = (f: number) => info({ street: "flop", role: "checkRaise", position: "OOP", potFraction: f, sizeClass: sizeClassOf(f) });

  it("ドライなJTハイのセットは良手", () => {
    const v = judgeBet(cr(0.8), ["3h", "3d"], ["Js", "Th", "3c", "2d", "5s"]);
    expect(v.reason).toBe("checkRaiseDryBroadway");
    expect(v.grade).toBe("excellent");
  });

  it("ドローを混ぜたチェックレイズは良手", () => {
    const v = judgeBet(cr(0.8), ["Js", "Ts"], ["9s", "8s", "2d", "Kc", "3h"]);
    expect(v.reason).toBe("checkRaiseDraw");
    expect(v.grade).toBe("excellent");
  });

  it("ドライなK/Qハイ以外で大きすぎるレイズは緩手", () => {
    const v = judgeBet(cr(1.5), ["Js", "Ts"], ["9s", "8s", "2d", "Kc", "3h"]);
    expect(v.reason).toBe("checkRaiseTooBig");
    expect(v.grade).toBe("inaccuracy");
  });
});

describe("評価しない手", () => {
  it("プローブは Notion に中身が無いので評価しない", () => {
    const v = judgeBet(info({ street: "turn", role: "probe", potFraction: 0.5, sizeClass: "small" }), ["Ah", "Qd"], ["Ks", "7h", "2d", "5c", "3s"]);
    expect(v.grade).toBeNull();
  });

  it("リバーのナッツ級を OOP から安く打つのは好手(ブロックにナッツを混ぜる)", () => {
    const v = judgeBet(info({ potFraction: 0.3, position: "OOP" }), ["Ah", "Kd"], DRY);
    expect(v.reason).toBe("riverBlockStrong");
    expect(v.grade).toBe("good");
  });
});
