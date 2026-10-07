import { describe, expect, it } from "vitest";
import { classifyFlop, classifyStreetCard, flopClassName, STREET_CARD_GROUP } from "../src/geo/boardClass.js";

describe("GEO のボードの分類: フロップ(Amu の Class 分類 × コネクト)", () => {
  it("記事の例どおりに分ける", () => {
    expect(classifyFlop(["Ah", "Js", "2s"])).toMatchObject({ classId: 4, connected: false }); // AJ = HMSD
    expect(classifyFlop(["8s", "8d", "2c"])).toMatchObject({ classId: 3, connected: false }); // 882 = ペア
    expect(classifyFlop(["8s", "7d", "4c"])).toMatchObject({ classId: 7, connected: true }); // 874 = 8ハイ以下(コネクト)
    expect(classifyFlop(["Ks", "7d", "2c"])).toMatchObject({ classId: 5, connected: false }); // K7 = HMnSD
    expect(classifyFlop(["Qh", "8d", "3c"])).toMatchObject({ classId: 4 }); // Q8 = 弱 HM でも HMSD
    expect(classifyFlop(["Ah", "5d", "9c"])).toMatchObject({ classId: 5 }); // A9 は HMnSD
    expect(classifyFlop(["Th", "9d", "2c"])).toMatchObject({ classId: 6 });
    expect(classifyFlop(["Jh", "Td", "9c"])).toMatchObject({ classId: 4, connected: true });
    expect(classifyFlop(["Kh", "7h", "2h"])).toMatchObject({ classId: 1, connected: false });
    expect(classifyFlop(["7s", "7d", "7c"])).toMatchObject({ classId: 2, connected: false });
  });

  it("表示名", () => {
    expect(flopClassName(classifyFlop(["Ks", "7d", "2c"])!)).toBe("Class5 A〜Jハイ HMnSD(コネクトなし)");
    expect(flopClassName(classifyFlop(["8s", "8d", "2c"])!)).toBe("Class3 ペア");
  });
});

describe("GEO のボードの分類: ターン・リバー(落ちた1枚が何をしたか)", () => {
  it("番号の若い方を優先して1つに決める", () => {
    expect(classifyStreetCard(["7s", "7d", "2c", "7h"])).toBe("trips");
    expect(classifyStreetCard(["7s", "7d", "7c", "7h"])).toBe("quads");
    expect(classifyStreetCard(["Kh", "7h", "2c", "Ah"])).toBe("flushOver");
    expect(classifyStreetCard(["Kh", "7h", "2c", "3h"])).toBe("flush");
    expect(classifyStreetCard(["Kh", "Qd", "2c", "Kd"])).toBe("pairTop");
    expect(classifyStreetCard(["Kh", "Qd", "2c", "2s"])).toBe("pairLower");
    expect(classifyStreetCard(["Kh", "7d", "2c", "As"])).toBe("overAce");
  });

  it("リバーではドロー発生を使わない(ラグに入る)", () => {
    const turn = classifyStreetCard(["Kh", "7d", "2c", "3h"]);
    expect(STREET_CARD_GROUP[turn!]).not.toBe("complete");
    const river = classifyStreetCard(["Kh", "7d", "2c", "Qs", "3h"]);
    expect(STREET_CARD_GROUP[river!]).not.toBe("draw");
  });
});
