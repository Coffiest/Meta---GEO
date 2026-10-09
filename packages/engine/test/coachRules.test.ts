import { describe, expect, it } from "vitest";
import { blockedExamples, judgeCoach, nutExamples, type CoachAction, type CoachHand } from "../src/review/coachRules.js";

/**
 * 6人卓、ボタン = 席0、SB = 席1、BB = 席2、UTG = 3、HJ = 4、CO = 5。
 * act() で順に足していくと、potBefore を自動で数える。
 */
function builder(stacks: number[], hole: Record<number, string[]>, board: string[], bb = 100, ante = 0) {
  const actions: CoachAction[] = [];
  let seq = 0;
  let pot = 0;
  const streetC = new Map<number, number>();
  let street = "preflop";
  const push = (seatIndex: number, kind: string, toAmount: number | null) => {
    const a: CoachAction = { sequenceNumber: seq++, seatIndex, street, kind, toAmount, potBefore: pot };
    actions.push(a);
    if (kind === "postAnte") pot += toAmount ?? 0;
    else if (toAmount !== null) {
      pot += toAmount - (streetC.get(seatIndex) ?? 0);
      streetC.set(seatIndex, toAmount);
    }
    return a.sequenceNumber;
  };
  if (ante > 0) push(2, "postAnte", ante);
  push(1, "postBlind", bb / 2);
  push(2, "postBlind", bb);
  const hand: CoachHand = {
    buttonFixedPos: 0,
    seatCount: 6,
    bigBlind: bb,
    board,
    seats: stacks.map((s, i) => ({ seatIndex: i, startingStack: s, holeCards: hole[i] ?? ["2c", "3d"] })),
    actions,
  };
  return {
    hand,
    act: push,
    street(s: string) {
      street = s;
      streetC.clear();
    },
  };
}

describe("コーチのルール", () => {
  it("2. 5bb で 2.25bb のオープン(残りでオールインにコールするしかない)はコミット → 大悪手", () => {
    const b = builder([4000, 4000, 4000, 4000, 4000, 500], { 5: ["Kh", "Td"] }, [], 100, 100);
    b.act(3, "fold", null);
    b.act(4, "fold", null);
    const seq = b.act(5, "raise", 225);
    const v = judgeCoach(b.hand, seq)!;
    expect(v.id).toBe("commit");
    expect(v.grade).toBe("blunder");
    expect(v.requiredEquity!).toBeLessThanOrEqual(0.25);
  });

  it("8. A5s の 3bet(コミットしていない)は絶妙手", () => {
    const b = builder([4000, 4000, 4000, 4000, 4000, 4000], { 0: ["Ah", "5h"] }, []);
    b.act(3, "fold", null);
    b.act(4, "fold", null);
    b.act(5, "raise", 250);
    const v = judgeCoach(b.hand, b.act(0, "raise", 800))!;
    expect(v.id).toBe("lightAce");
    expect(v.grade).toBe("artistic");
    expect(v.raiseLevel).toBe(3);
  });

  it("7-2. SRP の OOP レイザー: ドライな K ハイは 33% CB が最善、A ハイはチェックが最善", () => {
    for (const [board, kind, size, grade] of [
      [["Kh", "7d", "2c"], "bet", 160, "best"],
      [["Kh", "7d", "2c"], "check", null, "inaccuracy"],
      [["Ah", "8d", "3c"], "check", null, "best"],
      [["Ah", "8d", "3c"], "bet", 160, "mistake"],
    ] as const) {
      // UTG(席3)オープン → BTN(席0)コール。
      const b = builder([4000, 4000, 4000, 4000, 4000, 4000], { 3: ["Qs", "Qc"] }, [...board, "9c", "4h"]);
      b.act(3, "raise", 250);
      b.act(4, "fold", null);
      b.act(5, "fold", null);
      b.act(0, "call", 250);
      b.act(1, "fold", null);
      b.act(2, "fold", null);
      b.street("flop");
      const v = judgeCoach(b.hand, b.act(3, kind, size))!;
      expect(v.id).toBe("oopKingCb");
      expect(v.grade).toBe(grade);
    }
  });

  it("マルチウェイでも、ベットへのコールはヘッズアップと同じオッズの判定", () => {
    const b = builder([4000, 4000, 4000, 4000, 4000, 4000], { 2: ["6d", "3c"] }, ["Kh", "Qh", "Jc", "4d", "9s"]);
    b.act(3, "fold", null);
    b.act(4, "fold", null);
    b.act(5, "raise", 250);
    b.act(0, "call", 250);
    b.act(1, "fold", null);
    b.act(2, "call", 250);
    b.street("flop");
    b.act(2, "check", null);
    b.act(5, "bet", 500);
    b.act(0, "call", 500);
    const v = judgeCoach(b.hand, b.act(2, "call", 500))!;
    expect(v.id).toBe("oddsCall");
    expect(["mistake", "blunder"]).toContain(v.grade);
  });

  it("5-3. リバー: ナッツ級をブロックしない弱い手で降りるのは、MDF の外なら最善", () => {
    const b = srp({ 2: ["3d", "2c"] }, ["Kh", "Qh", "Jc", "8d", "7s"]);
    b.act(2, "check", null);
    b.act(0, "check", null);
    b.street("turn");
    b.act(2, "check", null);
    b.act(0, "check", null);
    b.street("river");
    b.act(2, "check", null);
    b.act(0, "bet", 400);
    const v = judgeCoach(b.hand, b.act(2, "fold", null))!;
    expect(v.id).toBe("riverFoldOk");
    expect(v.grade).toBe("best");
  });

  it("4-3. IP のリバー: トップペアでチェックされたら、コールされても勝てるので 50% ベットは最善", () => {
    const b = srp({ 0: ["Kd", "Js"] }, ["Kh", "8c", "4d", "2s", "7h"]);
    b.act(2, "check", null);
    b.act(0, "check", null);
    b.street("turn");
    b.act(2, "check", null);
    b.act(0, "check", null);
    b.street("river");
    b.act(2, "check", null);
    const v = judgeCoach(b.hand, b.act(0, "bet", 275))!;
    expect(v.id).toBe("thinValue");
    expect(v.equity!).toBeGreaterThanOrEqual(0.5);
    expect(v.grade).toBe("best");
  });

  it("2. 40bb の普通のオープンはコミットではない", () => {
    const b = builder([4000, 4000, 4000, 4000, 4000, 4000], { 5: ["Kh", "Td"] }, []);
    b.act(3, "fold", null);
    b.act(4, "fold", null);
    const seq = b.act(5, "raise", 250);
    expect(judgeCoach(b.hand, seq)).toBeNull();
  });

  /** BTN(席0)オープン → BB(席2)コール → フロップ。 */
  function srp(hole: Record<number, string[]>, board: string[], stack = 4000) {
    const b = builder([stack, stack, stack, stack, stack, stack], hole, board);
    b.act(3, "fold", null);
    b.act(4, "fold", null);
    b.act(5, "fold", null);
    b.act(0, "raise", 250);
    b.act(1, "fold", null);
    b.act(2, "call", 250);
    b.street("flop");
    return b;
  }

  it("4-2. IP のダブルバレルが 33% → 大悪手(ポラライズ)", () => {
    const b = srp({ 0: ["As", "5s"] }, ["Kd", "8c", "3h", "2s", "9d"]);
    b.act(2, "check", null);
    b.act(0, "bet", 180);
    b.act(2, "call", 180);
    b.street("turn");
    b.act(2, "check", null);
    const seq = b.act(0, "bet", 290); // ポット 890 の 33%
    const v = judgeCoach(b.hand, seq)!;
    expect(v.id).toBe("polarize");
    expect(v.grade).toBe("blunder");
  });

  it("4-2. IP のダブルバレルが 75% なら当たらない", () => {
    const b = srp({ 0: ["As", "5s"] }, ["Kd", "8c", "3h", "2s", "9d"]);
    b.act(2, "check", null);
    b.act(0, "bet", 180);
    b.act(2, "call", 180);
    b.street("turn");
    b.act(2, "check", null);
    const seq = b.act(0, "bet", 670);
    expect(judgeCoach(b.hand, seq)?.id).not.toBe("polarize");
  });

  it("4-1. BMCB: ハイボード(K62)のローポケは、80% の大きい BMCB で最善(スライド)", () => {
    // CO(席5)オープン → BTN(席0)コール → ブラインドは降りる。
    const b = builder([4000, 4000, 4000, 4000, 4000, 4000], { 0: ["7d", "7c"] }, ["Kh", "6s", "2d", "9c", "3h"]);
    b.act(3, "fold", null);
    b.act(4, "fold", null);
    b.act(5, "raise", 250);
    b.act(0, "call", 250);
    b.act(1, "fold", null);
    b.act(2, "fold", null);
    b.street("flop");
    b.act(5, "check", null);
    const seq = b.act(0, "bet", 520);
    const v = judgeCoach(b.hand, seq)!;
    expect(v.id).toBe("bmcb");
    expect(v.bmcb).toEqual({ board: "high", hand: "bluff", correct: "bigBet" });
    expect(v.grade).toBe("best");
  });

  it("5-3. リバーでベットに直面し、ナッツ級をブロックしてコール → 絶妙手。MDF を出す", () => {
    // 席2(BB)がヒーロー。A♥ を持ち、ハートのフラッシュボード。
    const board = ["Kh", "9h", "5c", "2h", "Qd"];
    const b = srp({ 2: ["Ah", "Ts"] }, board);
    b.act(2, "check", null);
    b.act(0, "check", null);
    b.street("turn");
    b.act(2, "check", null);
    b.act(0, "check", null);
    b.street("river");
    b.act(2, "check", null);
    b.act(0, "bet", 400);
    const seq = b.act(2, "call", 400);
    const v = judgeCoach(b.hand, seq)!;
    expect(v.id).toBe("riverCatch");
    expect(v.grade).toBe("artistic");
    expect(v.mdf!).toBeCloseTo(550 / 950, 3);
    expect(v.blocked).toContain("Ah");
  });

  it("5-3b. リバーでナッツ級を1つも抑えずにコール → MDF とブロッカーの解説(オッズではない)", () => {
    const board = ["Kh", "9h", "5c", "2h", "Qd"];
    const b = srp({ 2: ["7c", "7d"] }, board);
    b.act(2, "check", null);
    b.act(0, "check", null);
    b.street("turn");
    b.act(2, "check", null);
    b.act(0, "check", null);
    b.street("river");
    b.act(2, "check", null);
    b.act(0, "bet", 400);
    const seq = b.act(2, "call", 400);
    const v = judgeCoach(b.hand, seq)!;
    expect(v.id).toBe("riverCallNoBlock");
    expect(v.blocked).toEqual([]);
    expect(v.nutExamples!.length).toBeGreaterThan(0);
  });

  it("5-4. ナッツ級をブロックした A ハイで降りる → 緩手 / レイズ → 絶妙手", () => {
    const board = ["Kh", "9h", "5c", "2h", "Qd"];
    for (const [kind, id, grade] of [
      ["fold", "riverRaiseMissed", "inaccuracy"],
      ["raise", "riverRaise", "artistic"],
    ] as const) {
      const b = srp({ 2: ["Ah", "4c"] }, board);
      b.act(2, "check", null);
      b.act(0, "check", null);
      b.street("turn");
      b.act(2, "check", null);
      b.act(0, "check", null);
      b.street("river");
      b.act(2, "check", null);
      b.act(0, "bet", 400);
      const seq = b.act(2, kind, kind === "raise" ? 1300 : null);
      const v = judgeCoach(b.hand, seq)!;
      expect(v.id).toBe(id);
      expect(v.grade).toBe(grade);
    }
  });

  it("3. フロップのベットへのコールは、必要勝率と推定勝率で判定する(ナッツドローは最善、エアーは悪手以下)", () => {
    const strong = srp({ 2: ["Ah", "Jh"] }, ["Kh", "7h", "2c", "4d", "9s"]);
    strong.act(2, "check", null);
    strong.act(0, "bet", 300);
    let v = judgeCoach(strong.hand, strong.act(2, "call", 300))!;
    expect(v.id).toBe("oddsCall");
    expect(v.requiredEquity!).toBeCloseTo(300 / 1150, 3);
    expect(v.grade).toBe("best");

    const air = srp({ 2: ["6d", "3c"] }, ["Kh", "Qh", "Jc", "4d", "9s"]);
    air.act(2, "check", null);
    air.act(0, "bet", 550);
    v = judgeCoach(air.hand, air.act(2, "call", 550))!;
    expect(v.id).toBe("oddsCall");
    expect(["mistake", "blunder"]).toContain(v.grade);
  });

  it("3. フロップのベットに降りたら、必要勝率と推定勝率で判定する(エアーは最善、ナッツドローは悪手以下)", () => {
    const air = srp({ 2: ["6d", "3c"] }, ["Kh", "Qh", "Jc", "4d", "9s"]);
    air.act(2, "check", null);
    air.act(0, "bet", 550);
    let v = judgeCoach(air.hand, air.act(2, "fold", null))!;
    expect(v.id).toBe("oddsFold");
    expect(v.grade).toBe("best");

    const strong = srp({ 2: ["Ah", "Jh"] }, ["Kh", "7h", "2c", "4d", "9s"]);
    strong.act(2, "check", null);
    strong.act(0, "bet", 300);
    v = judgeCoach(strong.hand, strong.act(2, "fold", null))!;
    expect(v.id).toBe("oddsFold");
    expect(["mistake", "blunder"]).toContain(v.grade);
  });

  it("5-2. OOP(SRP)のミドルペアで、ターンに 33% のブロックベット → 絶妙手 / チェック → 緩手", () => {
    for (const [kind, id, grade] of [
      ["bet", "blockBet", "artistic"],
      ["check", "blockBetMissed", "inaccuracy"],
    ] as const) {
      const b = srp({ 2: ["9c", "8d"] }, ["Kd", "9h", "3c", "2s", "4d"]);
      b.act(2, "check", null);
      b.act(0, "check", null);
      b.street("turn");
      const seq = b.act(2, kind, kind === "bet" ? 180 : null);
      const v = judgeCoach(b.hand, seq)!;
      expect(v.id).toBe(id);
      expect(v.grade).toBe(grade);
    }
  });

  it("ナッツ級の代表とブロッカー", () => {
    const ex = nutExamples(["Kh", "9h", "5c", "2h", "Qd"]);
    expect(ex[0]).toMatchObject({ key: "Ah", made: "フラッシュ" });
    expect(ex).toHaveLength(3);
    expect(blockedExamples(["Ah", "2c"], ex)).toContain("Ah");
    const st = nutExamples(["Ts", "9d", "8c", "2h", "3s"]);
    expect(st[0]!.made).toBe("ストレート");
    expect(st[0]!.key).toBe("QJ");
  });

  describe("6. フロップの CB(オリジナル・IP)", () => {
    /** BTN(席0)オープン → BB(席2)コール → フロップで BB チェック → BTN の決定。ポットは 550。 */
    function cb(hole: string[], board: string[], kind: "bet" | "check", amount?: number) {
      const b = srp({ 0: hole }, board);
      b.act(2, "check", null);
      return judgeCoach(b.hand, b.act(0, kind, kind === "bet" ? amount! : null))!;
    }

    it("Class5(K63 レインボー)のトップヒット・グッドキッカーを 33% → 最善", () => {
      const v = cb(["Ah", "Kd"], ["Ks", "6c", "3h", "9d", "2s"], "bet", 180);
      expect(v.id).toBe("flopCb");
      expect(v.flopCb).toMatchObject({ cls: 5, group: "high", action: "33" });
      expect(v.grade).toBe("best");
    });

    it("Class1(J85 モノトーン)のポケットペアは低頻度 → チェックが最善 / ベットは緩手", () => {
      const board = ["Jh", "8h", "5h", "2c", "3d"];
      expect(cb(["7c", "7d"], board, "check").grade).toBe("best");
      const v = cb(["7c", "7d"], board, "bet", 180);
      expect(v.flopCb).toMatchObject({ cls: 1, group: "low" });
      expect(v.grade).toBe("inaccuracy");
    });

    it("Class2(トリップス)はレンジで打つ → チェックは緩手", () => {
      const v = cb(["4c", "5d"], ["7s", "7c", "7h", "9d", "2s"], "check");
      expect(v.flopCb).toMatchObject({ cls: 2, group: "all" });
      expect(v.grade).toBe("inaccuracy");
    });

    it("Class4 強HM(AK7)はポラー: トップヒット・グッドキッカーを 125% → 最善", () => {
      const v = cb(["As", "Qd"], ["Ah", "Kc", "7d", "2s", "3c"], "bet", 690);
      expect(v.flopCb).toMatchObject({ cls: 4, hmTier: "strong", group: "value", action: "125" });
      expect(v.grade).toBe("best");
    });

    it("相手がレイザーなら当たらない(BMCB の方)", () => {
      const b = builder([4000, 4000, 4000, 4000, 4000, 4000], { 0: ["7d", "7c"] }, ["Kh", "6s", "2d", "9c", "3h"]);
      b.act(3, "fold", null);
      b.act(4, "fold", null);
      b.act(5, "raise", 250);
      b.act(0, "call", 250);
      b.act(1, "fold", null);
      b.act(2, "fold", null);
      b.street("flop");
      b.act(5, "check", null);
      expect(judgeCoach(b.hand, b.act(0, "bet", 220))!.id).toBe("bmcb");
    });
  });

  describe("7. OOP のオリジナルは Jハイ以下・モノトーンのフロップでチェック", () => {
    /** BB(席2)の 3ベットを BTN(席0)がコール → BB がオリジナルで OOP。 */
    function oop(board: string[], kind: "bet" | "check") {
      const b = builder([4000, 4000, 4000, 4000, 4000, 4000], { 2: ["Ah", "Kd"] }, board);
      b.act(3, "fold", null);
      b.act(4, "fold", null);
      b.act(5, "fold", null);
      b.act(0, "raise", 250);
      b.act(1, "fold", null);
      b.act(2, "raise", 900);
      b.act(0, "call", 900);
      b.street("flop");
      return judgeCoach(b.hand, b.act(2, kind, kind === "bet" ? 600 : null))!;
    }
    it("J ハイ以下でチェック → 素晴らしい(!)、ベット → 大悪手", () => {
      expect(oop(["Jc", "7d", "2s", "3c", "4d"], "check")).toMatchObject({ id: "oopFlopCheck", grade: "great" });
      expect(oop(["Jc", "7d", "2s", "3c", "4d"], "bet")).toMatchObject({ id: "oopFlopCheck", grade: "blunder" });
    });
    it("モノトーンも同じ。Q ハイのレインボーは当たらない", () => {
      expect(oop(["Kh", "7h", "2h", "3c", "4d"], "bet").grade).toBe("blunder");
      expect(oop(["Qc", "7d", "2s", "3c", "4d"], "bet")?.id).not.toBe("oopFlopCheck");
    });
  });
});
