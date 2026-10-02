import { describe, expect, it } from "vitest";
import { buildRecycleBriefs, ANGLES } from "../src/recycle.js";

describe("buildRecycleBriefs", () => {
  const source = [
    "BBで降りすぎてない？",
    "",
    "6人卓のBBフォールド率は62%でした。",
    "",
    "・ポットオッズ的に降りすぎ",
    "・相手が広げてくる",
    "",
    "無料で確認してみて",
    "#ポーカー",
  ].join("\n");

  it("元投稿で効いていた構造を引き継ぎ項目として出す", () => {
    const briefs = buildRecycleBriefs(source);
    const keep = briefs[0]!.keep.join(" ");
    expect(keep).toContain("数字");
    expect(keep).toContain("箇条書き");
    expect(keep).toContain("CTA");
    expect(keep).toContain("#ポーカー");
  });

  it("1行目の書き換えを必ず指示する", () => {
    // 同じフックのまま再投稿しても伸びない。ここが抜けると再利用の意味が無い。
    for (const b of buildRecycleBriefs(source)) {
      expect(b.change.some((c) => c.includes("1行目"))).toBe(true);
    }
  });

  it("既定で全ての切り口を返す", () => {
    expect(buildRecycleBriefs(source)).toHaveLength(ANGLES.length);
  });

  it("切り口を指定できる", () => {
    const b = buildRecycleBriefs(source, ["data", "question"]);
    expect(b.map((x) => x.angle)).toEqual(["data", "question"]);
    expect(b[0]!.hookRecipe.length).toBeGreaterThan(0);
    expect(b[0]!.bodyRecipe.length).toBeGreaterThan(0);
  });

  it("構造の無い投稿では、その旨を明示する", () => {
    // 何も引き継げないのに「引き継ぐものがある」風に見せると、書き手を誤解させる。
    const b = buildRecycleBriefs("こんにちは");
    expect(b[0]!.keep.join("")).toContain("見当たらない");
  });
});
