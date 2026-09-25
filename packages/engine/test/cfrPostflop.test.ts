import { describe, it, expect } from "vitest";
import { solveRiverHu, type HandCombo } from "../src/solver/cfrPostflop.js";
import { parseCard } from "../src/types/card.js";

function combo(s: string, weight = 1): HandCombo {
  const a = parseCard(s.slice(0, 2));
  const b = parseCard(s.slice(2, 4));
  if (!a || !b) throw new Error(`bad combo ${s}`);
  return { a, b, weight };
}
const board = ["As", "Ks", "Qh", "Jd", "2c"].map((c) => parseCard(c)!);

/**
 * 偏極トイゲーム(古典的に解析解が既知)でCFRの正しさを検証する。
 * ボード As Ks Qh Jd 2c。
 *  - OOP: ナッツ(Td=ブロードウェイ・ストレート) と エア(7c6h=7ハイ) の 50/50 偏極レンジ
 *  - IP : ブラフキャッチャー(9s9d=ワンペア。エアに勝ち、ストレートに負け) 単一
 * ポットサイズ(B=P)ベット・レイズ無しなら GTO は:
 *  - IP はベットに MDF = P/(P+B)=1/2 でコール(=fold 50%)
 *  - OOP はナッツ全ベット + エアを value 比 B/(P+B)=1/2 でブラフ → ルートのベット頻度 ≈ 0.75
 */
describe("solveRiverHu (polarized toy, analytic GTO)", () => {
  const res = solveRiverHu({
    board,
    oop: [combo("Td3h"), combo("7c6h")],
    ip: [combo("9s9d")],
    potBb: 10,
    stackBb: 100,
    betSizes: [1.0],
    allowRaise: false,
    iterations: 1500,
  });

  it("OOP bets ~75% of a polarized range (nuts always + half bluffs)", () => {
    const bet = res.oopRoot.find((o) => o.action.startsWith("bet"))!;
    expect(bet.frequency).toBeGreaterThan(0.66);
    expect(bet.frequency).toBeLessThan(0.84);
  });

  it("IP calls a pot-sized bet ~50% (MDF)", () => {
    const call = res.ipVsBet.find((o) => o.action === "call")!;
    const fold = res.ipVsBet.find((o) => o.action === "fold")!;
    expect(call.frequency).toBeGreaterThan(0.4);
    expect(call.frequency).toBeLessThan(0.6);
    expect(fold.frequency).toBeGreaterThan(0.4);
    expect(fold.frequency).toBeLessThan(0.6);
  });
});

/**
 * ナッツのみ vs ブラフキャッチャー: 相手はバリュー一色のベットに勝てないので必ずフォールド。
 * ベットしてもチェックしても OOP はポットを取り(ショーダウンでも勝つ)、EV = +P/2。
 * (=OOPはベット/チェックに無差別。頻度は不定なので EV とIPのフォールドを検証する。)
 */
describe("solveRiverHu (value-only sanity)", () => {
  const res = solveRiverHu({
    board,
    oop: [combo("Td3h")], // ナッツのみ
    ip: [combo("9s9d")],
    potBb: 10,
    stackBb: 100,
    betSizes: [0.75],
    allowRaise: false,
    iterations: 800,
  });
  it("IP folds a bluffcatcher to a value-only betting range", () => {
    const fold = res.ipVsBet.find((o) => o.action === "fold")!;
    expect(fold.frequency).toBeGreaterThan(0.9);
  });
  it("OOP captures the pot (EV ~ +P/2)", () => {
    expect(res.oopEvBb).toBeGreaterThan(4.0); // P/2 = 5
    expect(res.oopEvBb).toBeLessThan(6.0);
  });
});
