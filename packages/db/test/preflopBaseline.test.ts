import { describe, expect, it } from "vitest";
import { expandToken, getPreflopBaseline, buildPreflopGtoNode } from "../src/preflopBaseline.js";

describe("expandToken", () => {
  it("ペア以上を展開", () => {
    expect(expandToken("QQ+")).toEqual(["AA", "KK", "QQ"]);
  });
  it("単一ペア", () => {
    expect(expandToken("55")).toEqual(["55"]);
  });
  it("スーテッド以上(キッカーを上げる)", () => {
    expect(expandToken("ATs+")).toEqual(["AKs", "AQs", "AJs", "ATs"]);
  });
  it("オフスート単一", () => {
    expect(expandToken("KQo")).toEqual(["KQo"]);
  });
});

describe("getPreflopBaseline (RFI)", () => {
  it("レンジ内はオープン頻度1", () => {
    const r = getPreflopBaseline({ heroPos: "BTN", line: [], handClass: "AA" });
    expect(r?.find((a) => a.frequency === 1)?.bucket).toBe("raise2-2.5");
  });
  it("レンジ外はフォールド頻度1", () => {
    const r = getPreflopBaseline({ heroPos: "UTG", line: [], handClass: "72o" });
    expect(r?.find((a) => a.frequency === 1)?.bucket).toBe("fold");
  });
  it("フェイス(line非空)は未対応でnull", () => {
    expect(getPreflopBaseline({ heroPos: "BTN", line: [{ position: "CO", bucket: "raise2-2.5" }], handClass: "AA" })).toBeNull();
  });
});

describe("buildPreflopGtoNode", () => {
  it("13x13マトリクスとレンジ分布を返す", () => {
    const node = buildPreflopGtoNode({ heroPos: "BTN", line: [] });
    expect(node.matrix.cells).toHaveLength(13);
    expect(node.matrix.cells[0]).toHaveLength(13);
    // BTNは広いのでオープン頻度が相応にある。
    const open = node.options.find((o) => o.bucket === "raise2-2.5");
    expect((open?.frequency ?? 0)).toBeGreaterThan(0.3);
  });
  it("未対応ポジションはunsupported", () => {
    expect(buildPreflopGtoNode({ heroPos: "BB", line: [] }).unsupported).toBe(true);
  });
});
