import { describe, expect, it } from "vitest";
import { readBarrelCheckSpots, readBetRoles, sizeClassOf, type RoleAction } from "../src/review/betRole.js";

/**
 * ベットの役割判定のテスト。
 *
 * 卓は6席・ボタン0。ポストフロップの行動順は SB(1) → BB(2) → UTG(3) → HJ(4) → CO(5) → BTN(0)。
 * 以下は主に BTN(0) が BB(2) とヘッズアップになる形で組む(BTN=IP / BB=OOP)。
 */
const TABLE = { buttonFixedPos: 0, seatCount: 6 };
const BTN = 0;
const BB = 2;

let seq = 0;
function act(seatIndex: number, street: string, kind: string, toAmount: number | null = null, potBefore = 100): RoleAction {
  seq += 1;
  return { sequenceNumber: seq, seatIndex, street, kind, toAmount, potBefore };
}

/** BTN がレイズ、BB がコール(SRP・BTN がオリジナル)。 */
function srpBtnOpens(): RoleAction[] {
  seq = 0;
  return [
    act(1, "preflop", "postBlind", 50, 0),
    act(BB, "preflop", "postBlind", 100, 50),
    act(3, "preflop", "fold"),
    act(4, "preflop", "fold"),
    act(5, "preflop", "fold"),
    act(BTN, "preflop", "raise", 250),
    act(1, "preflop", "fold"),
    act(BB, "preflop", "call", 250),
  ];
}

const roleOf = (infos: ReturnType<typeof readBetRoles>, seat: number, street: string) =>
  infos.find((i) => i.seatIndex === seat && i.street === street)?.role;

describe("CB / ディレイCB", () => {
  it("オリジナルがフロップで最初に打てば CB", () => {
    const a = [...srpBtnOpens(), act(BB, "flop", "check"), act(BTN, "flop", "bet", 33, 100)];
    const r = readBetRoles(a, TABLE);
    expect(roleOf(r, BTN, "flop")).toBe("cbet");
    expect(r[0]?.isOriginalRaiser).toBe(true);
    expect(r[0]?.position).toBe("IP");
  });

  it("フロップがチェックで流れ、ターンでオリジナルが打てば ディレイCB", () => {
    const a = [
      ...srpBtnOpens(),
      act(BB, "flop", "check"),
      act(BTN, "flop", "check"),
      act(BB, "turn", "check"),
      act(BTN, "turn", "bet", 50, 100),
    ];
    expect(roleOf(readBetRoles(a, TABLE), BTN, "turn")).toBe("delayedCbet");
  });

  it("フロップで CB を打っていたなら、ターンで打っても ディレイCB ではなくバレル", () => {
    const a = [
      ...srpBtnOpens(),
      act(BB, "flop", "check"),
      act(BTN, "flop", "bet", 33, 100),
      act(BB, "flop", "call", 33),
      act(BB, "turn", "check"),
      act(BTN, "turn", "bet", 60, 166),
    ];
    expect(roleOf(readBetRoles(a, TABLE), BTN, "turn")).toBe("turnBarrel");
  });
});

describe("ドンク", () => {
  it("オリジナルでない OOP が、オリジナルより先にフロップで打てば ドンク", () => {
    const a = [...srpBtnOpens(), act(BB, "flop", "bet", 30, 100)];
    const r = readBetRoles(a, TABLE);
    expect(roleOf(r, BB, "flop")).toBe("donk");
    expect(r[0]?.position).toBe("OOP");
    expect(r[0]?.leadAfterCall).toBe(false);
  });

  it("前のストリートでコールした人がターンで先に打てば ドンク(leadAfterCall)", () => {
    const a = [
      ...srpBtnOpens(),
      act(BB, "flop", "check"),
      act(BTN, "flop", "bet", 33, 100),
      act(BB, "flop", "call", 33),
      act(BB, "turn", "bet", 40, 166),
    ];
    const r = readBetRoles(a, TABLE);
    expect(roleOf(r, BB, "turn")).toBe("donk");
    expect(r.find((i) => i.street === "turn")?.leadAfterCall).toBe(true);
  });

  it("OOP のオリジナルが先に打つのは ドンクではなく CB", () => {
    // BB がオリジナル(3bet)になる形。
    seq = 0;
    const a = [
      act(1, "preflop", "postBlind", 50, 0),
      act(BB, "preflop", "postBlind", 100, 50),
      act(3, "preflop", "fold"),
      act(4, "preflop", "fold"),
      act(5, "preflop", "fold"),
      act(BTN, "preflop", "raise", 250),
      act(1, "preflop", "fold"),
      act(BB, "preflop", "raise", 800),
      act(BTN, "preflop", "call", 800),
      act(BB, "flop", "bet", 300, 1600),
    ];
    expect(roleOf(readBetRoles(a, TABLE), BB, "flop")).toBe("cbet");
  });

  it("リンプポット(オリジナル不在)では ドンクとは呼ばない", () => {
    seq = 0;
    const a = [
      act(1, "preflop", "postBlind", 50, 0),
      act(BB, "preflop", "postBlind", 100, 50),
      act(3, "preflop", "fold"),
      act(4, "preflop", "fold"),
      act(5, "preflop", "fold"),
      act(BTN, "preflop", "call", 100),
      act(1, "preflop", "fold"),
      act(BB, "preflop", "check"),
      act(BB, "flop", "bet", 50, 200),
    ];
    expect(roleOf(readBetRoles(a, TABLE), BB, "flop")).toBe("otherBet");
  });
});

describe("プローブ", () => {
  it("フロップでオリジナルがIPからチェックバック → ターンで OOP が打てば プローブ", () => {
    const a = [
      ...srpBtnOpens(),
      act(BB, "flop", "check"),
      act(BTN, "flop", "check"),
      act(BB, "turn", "bet", 40, 100),
    ];
    expect(roleOf(readBetRoles(a, TABLE), BB, "turn")).toBe("probe");
  });

  it("フロップにベットがあったなら プローブではない(ドンク)", () => {
    const a = [
      ...srpBtnOpens(),
      act(BB, "flop", "check"),
      act(BTN, "flop", "bet", 33, 100),
      act(BB, "flop", "call", 33),
      act(BB, "turn", "bet", 40, 166),
    ];
    expect(roleOf(readBetRoles(a, TABLE), BB, "turn")).toBe("donk");
  });
});

describe("バレル", () => {
  const cbetAndCall = () => [
    ...srpBtnOpens(),
    act(BB, "flop", "check"),
    act(BTN, "flop", "bet", 33, 100),
    act(BB, "flop", "call", 33),
  ];

  it("フロップとターンで打てばダブルバレル(streak 2)、リバーでも打てばトリプル(streak 3)", () => {
    const a = [
      ...cbetAndCall(),
      act(BB, "turn", "check"),
      act(BTN, "turn", "bet", 60, 166),
      act(BB, "turn", "call", 60),
      act(BB, "river", "check"),
      act(BTN, "river", "bet", 150, 286),
    ];
    const r = readBetRoles(a, TABLE);
    const turn = r.find((i) => i.street === "turn");
    const river = r.find((i) => i.street === "river");
    expect(turn?.role).toBe("turnBarrel");
    expect(turn?.streak).toBe(2);
    expect(river?.role).toBe("riverBarrel");
    expect(river?.streak).toBe(3);
  });

  it("ターンがチェックで流れた後のリバーベットは、バレルではない", () => {
    const a = [
      ...cbetAndCall(),
      act(BB, "turn", "check"),
      act(BTN, "turn", "check"),
      act(BB, "river", "check"),
      act(BTN, "river", "bet", 100, 166),
    ];
    expect(roleOf(readBetRoles(a, TABLE), BTN, "river")).toBe("otherBet");
  });
});

describe("チェックレイズ", () => {
  it("自分がチェックした後、相手のベットにレイズすれば チェックレイズ", () => {
    const a = [
      ...srpBtnOpens(),
      act(BB, "flop", "check"),
      act(BTN, "flop", "bet", 33, 100),
      act(BB, "flop", "raise", 110, 133),
    ];
    expect(roleOf(readBetRoles(a, TABLE), BB, "flop")).toBe("checkRaise");
  });

  it("最初から打って、相手に3betされたのは チェックレイズではない", () => {
    const a = [
      ...srpBtnOpens(),
      act(BB, "flop", "bet", 30, 100),
      act(BTN, "flop", "raise", 100, 130),
    ];
    expect(roleOf(readBetRoles(a, TABLE), BTN, "flop")).not.toBe("checkRaise");
  });
});

describe("サイズと位置", () => {
  it("ポット比でサイズ段が付く", () => {
    expect(sizeClassOf(0.33)).toBe("block");
    expect(sizeClassOf(0.5)).toBe("small");
    expect(sizeClassOf(0.75)).toBe("medium");
    expect(sizeClassOf(1)).toBe("large");
    expect(sizeClassOf(1.5)).toBe("overbet");
  });

  it("ベット額は累計拠出の差で求める(レイズ時に二重計上しない)", () => {
    const a = [
      ...srpBtnOpens(),
      act(BB, "flop", "bet", 30, 100),
      act(BTN, "flop", "raise", 100, 130),
    ];
    const raise = readBetRoles(a, TABLE).find((i) => i.seatIndex === BTN && i.street === "flop");
    // BTN はこのストリートで未拠出なので、額は 100 そのもの。
    expect(raise?.potFraction).toBeCloseTo(100 / 130, 5);
  });

  it("額の分からないオールインは potFraction が null", () => {
    const a = [...srpBtnOpens(), act(BB, "flop", "allIn", null, 100)];
    const r = readBetRoles(a, TABLE)[0];
    expect(r?.potFraction).toBeNull();
    expect(r?.sizeClass).toBeNull();
  });
});

describe("ダブル/トリプルバレルを打てた場面のチェック", () => {
  it("フロップで打った人がターンで先にチェック → ダブルバレルの場面", () => {
    const a = [
      ...srpBtnOpens(),
      act(BB, "flop", "check"),
      act(BTN, "flop", "bet", 33, 100),
      act(BB, "flop", "call", 33),
      act(BB, "turn", "check"),
      act(BTN, "turn", "check"),
    ];
    const spots = readBarrelCheckSpots(a);
    // BB のチェックは(フロップで打っていないので)場面ではない。BTN のチェックバックだけ。
    expect(spots).toEqual([{ sequenceNumber: a[a.length - 1]!.sequenceNumber, seatIndex: BTN, street: "turn" }]);
  });

  it("フロップ・ターンで打った人のリバーのチェック → トリプルバレルの場面。ターンで打っていなければ場面ではない", () => {
    const a = [
      ...srpBtnOpens(),
      act(BB, "flop", "check"),
      act(BTN, "flop", "bet", 33, 100),
      act(BB, "flop", "call", 33),
      act(BB, "turn", "check"),
      act(BTN, "turn", "bet", 100, 166),
      act(BB, "turn", "call", 100),
      act(BB, "river", "check"),
      act(BTN, "river", "check"),
    ];
    expect(readBarrelCheckSpots(a).map((s) => [s.seatIndex, s.street])).toEqual([[BTN, "river"]]);

    const b = [
      ...srpBtnOpens(),
      act(BB, "flop", "check"),
      act(BTN, "flop", "bet", 33, 100),
      act(BB, "flop", "call", 33),
      act(BB, "turn", "check"),
      act(BTN, "turn", "check"),
      act(BB, "river", "check"),
      act(BTN, "river", "check"),
    ];
    expect(readBarrelCheckSpots(b).map((s) => s.street)).toEqual(["turn"]);
  });

  it("相手に先に打たれたストリートはチェックの場面にならない(ドンクへのレイズもバレルの表の対象外)", () => {
    const a = [
      ...srpBtnOpens(),
      act(BB, "flop", "check"),
      act(BTN, "flop", "bet", 33, 100),
      act(BB, "flop", "call", 33),
      act(BB, "turn", "bet", 50, 166),
      act(BTN, "turn", "raise", 200),
    ];
    expect(readBarrelCheckSpots(a)).toEqual([]);
    const raise = readBetRoles(a, TABLE).find((r) => r.seatIndex === BTN && r.street === "turn");
    expect(raise?.firstOnStreet).toBe(false);
  });
});
