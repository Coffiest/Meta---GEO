import { describe, it, expect } from "vitest";
import { analyzeExtractedHand } from "../src/review.js";
import type { ExtractHand, ExtractAction } from "../src/reviewExtract.js";

/**
 * 局後検討パイプラインのエンドツーエンド(DB非依存)。
 * 席順: buttonFixedPos=0 → seat0=BTN, seat1=SB, seat2=BB, seat3=UTG, seat4=HJ, seat5=CO。
 */

const BB = 100; // 1bb = 100チップ

function seats(stackBb: number, heroSeat: number, heroCards: string[], villainSeat?: number, villainCards?: string[]) {
  return Array.from({ length: 6 }, (_, i) => ({
    seatIndex: i,
    userId: `u${i}`,
    startingStack: stackBb * BB,
    holeCards: i === heroSeat ? heroCards : villainSeat === i && villainCards ? villainCards : ["2c", "3d"],
  }));
}

let seq = 0;
function act(seatIndex: number, street: string, kind: string, toAmount: number | null, potBefore: number): ExtractAction {
  seq += 1;
  return { sequenceNumber: seq, seatIndex, street, kind, toAmount, potBefore };
}
function blindsAndAnte(): ExtractAction[] {
  return [
    act(1, "preflop", "postBlind", 50, 0),
    act(2, "preflop", "postBlind", 100, 50),
    act(2, "preflop", "postAnte", 100, 150),
  ];
}

describe("analyzeExtractedHand (局後検討 v2 パイプライン)", () => {
  it("BBがAAで10bbのUTGジャムをフォールド → 大悪手(blunder)", () => {
    seq = 0;
    const hand: ExtractHand = {
      buttonFixedPos: 0,
      levelBigBlind: BB,
      board: [],
      seats: seats(10, 2, ["As", "Ah"]),
      actions: [
        ...blindsAndAnte(),
        act(3, "preflop", "allIn", 10 * BB, 250), // UTG 10bbジャム
        act(4, "preflop", "fold", null, 1250),
        act(5, "preflop", "fold", null, 1250),
        act(0, "preflop", "fold", null, 1250),
        act(1, "preflop", "fold", null, 1250),
        act(2, "preflop", "fold", null, 1250), // hero(BB) AAをフォールド
      ],
    };
    const r = analyzeExtractedHand(hand, "u2")!;
    const d = r.decisions.find((x) => x.street === "preflop" && x.actionTaken.kind === "fold")!;
    expect(d.gtoActions).toBeTruthy();
    expect(d.classification).toBe("blunder");
    expect(d.evLossBb!).toBeGreaterThan(2);
    expect(d.actionName).toBe("フォールド");
  });

  it("BTNが7bbでA5sをオープンジャム → 正着(book/best)", () => {
    seq = 0;
    const hand: ExtractHand = {
      buttonFixedPos: 0,
      levelBigBlind: BB,
      board: [],
      seats: seats(7, 0, ["Ad", "5d"]),
      actions: [
        ...blindsAndAnte(),
        act(3, "preflop", "fold", null, 250),
        act(4, "preflop", "fold", null, 250),
        act(5, "preflop", "fold", null, 250),
        act(0, "preflop", "allIn", 7 * BB, 250), // hero(BTN) ジャム
        act(1, "preflop", "fold", null, 950),
        act(2, "preflop", "fold", null, 950),
      ],
    };
    const r = analyzeExtractedHand(hand, "u0")!;
    const d = r.decisions[0]!;
    expect(d.classification).not.toBeNull();
    expect(["book", "best", "great"]).toContain(d.classification);
    expect(d.evLossBb!).toBeLessThan(0.05);
    expect(d.actionName).toBe("オープンジャム");
  });

  it("BBが100bbでUTGオープンに76sでコール → 分類される(vsOpenディフェンス)", () => {
    seq = 0;
    const hand: ExtractHand = {
      buttonFixedPos: 0,
      levelBigBlind: BB,
      board: [],
      seats: seats(100, 2, ["7h", "6h"]),
      actions: [
        ...blindsAndAnte(),
        act(3, "preflop", "raise", 210, 250), // UTG 2.1bbオープン
        act(4, "preflop", "fold", null, 460),
        act(5, "preflop", "fold", null, 460),
        act(0, "preflop", "fold", null, 460),
        act(1, "preflop", "fold", null, 460),
        act(2, "preflop", "call", 210, 460), // hero(BB) コール
      ],
    };
    const r = analyzeExtractedHand(hand, "u2")!;
    const d = r.decisions[0]!;
    expect(d.gtoActions).toBeTruthy();
    expect(d.classification).not.toBeNull();
    // 76sのBBディフェンスは大きなミスではない(緩手以内)。
    expect(d.evLossBb!).toBeLessThan(0.8);
  });

  it("HUポストフロップ: トップセットで相手のフロップ・オールインをコール → 正着", () => {
    seq = 0;
    const hand: ExtractHand = {
      buttonFixedPos: 0,
      levelBigBlind: BB,
      board: ["Ac", "Kh", "2d"],
      seats: seats(20, 2, ["As", "Ah"], 0, ["Ks", "Qs"]),
      actions: [
        ...blindsAndAnte(),
        act(3, "preflop", "fold", null, 250),
        act(4, "preflop", "fold", null, 250),
        act(5, "preflop", "fold", null, 250),
        act(0, "preflop", "raise", 200, 250), // BTN 2bbオープン
        act(1, "preflop", "fold", null, 450),
        act(2, "preflop", "call", 200, 450), // BB コール → HUフロップへ
        act(2, "flop", "check", null, 550),
        act(0, "flop", "allIn", 18 * BB, 550), // BTN 残り18bbオールイン
        act(2, "flop", "call", 18 * BB, 2350), // hero トップセットでコール
      ],
    };
    const r = analyzeExtractedHand(hand, "u2")!;
    const flopCall = r.decisions.find((x) => x.street === "flop" && x.actionTaken.kind === "call")!;
    expect(flopCall.gtoActions).toBeTruthy();
    expect(flopCall.evLossBb).toBe(0);
    expect(["best", "great", "artistic"]).toContain(flopCall.classification);
    // チェック(通常ノード)はソルバー未接続なので分類なし(解析待ち)。
    const flopCheck = r.decisions.find((x) => x.street === "flop" && x.actionTaken.kind === "check")!;
    expect(flopCheck.classification).toBeNull();
  });

  it("3betライン(2レイズ以上)は対象外理由つきで分類なし", () => {
    seq = 0;
    const hand: ExtractHand = {
      buttonFixedPos: 0,
      levelBigBlind: BB,
      board: [],
      seats: seats(100, 2, ["Qc", "Qd"]),
      actions: [
        ...blindsAndAnte(),
        act(3, "preflop", "raise", 210, 250), // UTGオープン
        act(4, "preflop", "raise", 700, 460), // HJ 3bet
        act(5, "preflop", "fold", null, 1160),
        act(0, "preflop", "fold", null, 1160),
        act(1, "preflop", "fold", null, 1160),
        act(2, "preflop", "fold", null, 1160), // hero(BB) 3betラインに直面
      ],
    };
    const r = analyzeExtractedHand(hand, "u2")!;
    const d = r.decisions[0]!;
    expect(d.classification).toBeNull();
    expect(d.outOfScopeReason).toBe("3bet-line");
  });

  it("集計: 分類済み決定からGTO精度%とミス数が出る", () => {
    seq = 0;
    const hand: ExtractHand = {
      buttonFixedPos: 0,
      levelBigBlind: BB,
      board: [],
      seats: seats(10, 2, ["As", "Ah"]),
      actions: [
        ...blindsAndAnte(),
        act(3, "preflop", "allIn", 10 * BB, 250),
        act(4, "preflop", "fold", null, 1250),
        act(5, "preflop", "fold", null, 1250),
        act(0, "preflop", "fold", null, 1250),
        act(1, "preflop", "fold", null, 1250),
        act(2, "preflop", "fold", null, 1250),
      ],
    };
    const r = analyzeExtractedHand(hand, "u2")!;
    expect(r.summary.gtoAccuracy).not.toBeNull();
    expect(r.summary.gtoAccuracy!).toBeLessThan(60); // AAフォールドで精度は大きく下がる
    expect(r.summary.mistakeCount).toBe(1);
  });

  it("全プレイヤー評価: 各決定に席番号が付き、プレイヤーごとに独立して解析できる", () => {
    seq = 0;
    const hand: ExtractHand = {
      buttonFixedPos: 0,
      levelBigBlind: BB,
      board: [],
      seats: seats(10, 2, ["As", "Ah"]),
      actions: [
        ...blindsAndAnte(),
        act(3, "preflop", "allIn", 10 * BB, 250), // UTG(seat3)ジャム
        act(4, "preflop", "fold", null, 1250),
        act(5, "preflop", "fold", null, 1250),
        act(0, "preflop", "fold", null, 1250),
        act(1, "preflop", "fold", null, 1250),
        act(2, "preflop", "fold", null, 1250), // hero(BB=seat2) AAフォールド
      ],
    };
    // hero(seat2)の決定は席2、geoは未エンリッチでnull。
    const hero = analyzeExtractedHand(hand, "u2")!;
    const heroFold = hero.decisions.find((x) => x.actionTaken.kind === "fold")!;
    expect(heroFold.seatIndex).toBe(2);
    expect(heroFold.geo).toBeNull();
    // 相手(seat3=UTG)を独立に解析するとその席のジャム決定が得られる(全プレイヤー評価の基礎)。
    const villain = analyzeExtractedHand(hand, "u3")!;
    const villainJam = villain.decisions.find((x) => x.actionTaken.kind === "allIn");
    expect(villainJam?.seatIndex).toBe(3);
  });
});
