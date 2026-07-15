import { describe, it, expect } from "vitest";
import { buildPreflopVsOpenNode, preflopVsOpenAvailable } from "../src/preflopVsOpenBaseline.js";

describe("buildPreflopVsOpenNode (vsオープン・ディフェンス解)", () => {
  it("data bundle is present", () => {
    expect(preflopVsOpenAvailable()).toBe(true);
  });

  it("100bb BB vs UTG open: wide call + some 3bet, no open-jam, sane frequencies", () => {
    const node = buildPreflopVsOpenNode("100", "UTG", "BB");
    expect(node.unsupported).toBeUndefined();
    expect(node.position).toBe("BB"); // PositionPillBar の完全一致判定用に素のポジション名
    const freq = Object.fromEntries(node.options.map((o) => [o.bucket, o.frequency]));
    // コールは広い(>20%)、3betは存在(>2%)、100bbのオープンジャムは無し。
    expect(freq["call"] ?? 0).toBeGreaterThan(0.2);
    expect((freq["raise4+"] ?? 0) + (freq["raise3-4"] ?? 0)).toBeGreaterThan(0.02);
    expect(freq["allIn"] ?? 0).toBe(0);
    // 頻度合計はほぼ1。
    const totalFreq = node.options.reduce((a, o) => a + o.frequency, 0);
    expect(totalFreq).toBeGreaterThan(0.99);
    expect(totalFreq).toBeLessThan(1.01);
    // 13x13マトリクスが埋まっている。
    expect(node.matrix.cells.length).toBe(13);
    expect(node.matrix.totalSamples).toBe(1326);
  });

  it("100bb HJ vs UTG open: tight defense (fold-heavy)", () => {
    const node = buildPreflopVsOpenNode("100", "UTG", "HJ");
    const freq = Object.fromEntries(node.options.map((o) => [o.bucket, o.frequency]));
    expect(freq["fold"] ?? 0).toBeGreaterThan(0.7); // GTO Wizardアンカー: フォールド~85%
    expect(freq["call"] ?? 0).toBeLessThan(0.15);
  });

  it("20bb band: jam is available, 3bet is not (fold/call/allin only)", () => {
    const node = buildPreflopVsOpenNode("20", "UTG", "BB");
    const buckets = node.options.map((o) => o.bucket);
    expect(buckets).toContain("allIn");
    expect(buckets.some((b) => b.startsWith("raise"))).toBe(false);
  });

  it("unknown pair is unsupported", () => {
    // BBはオープンしないので opener=BB は存在しない。
    expect(buildPreflopVsOpenNode("100", "BB", "SB").unsupported).toBe(true);
    expect(buildPreflopVsOpenNode("7", "UTG", "BB").unsupported).toBe(true);
  });
});
