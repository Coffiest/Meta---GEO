import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { REVIEW_GLOSSARY, splitTerms, splitTermsMany } from "../src/lib/reviewGlossary";

const terms = (text: string) => splitTerms(text).filter((s) => s.entry).map((s) => s.text);

describe("解説の用語の見つけ方", () => {
  it("長い用語を先に取る(トップペア > ペア、3ベット > ベット、スポット ≠ ポット)", () => {
    expect(terms("トップペアで3ベットされたスポット")).toEqual(["トップペア", "3ベット", "スポット"]);
  });

  it("英字の用語は前後が英数字なら拾わない(40BB の単位・ChipEV)", () => {
    expect(terms("ES 40BB で BB がコール")).toEqual(["BB", "コール"]);
    expect(terms("ChipEV と EV")).toEqual(["ChipEV", "EV"]);
  });

  it("同じ用語は最初の1回だけ印を付け、文字は欠けない", () => {
    const text = "ベットしてまたベット。シャブはオールインのこと";
    const segs = splitTerms(text);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.filter((s) => s.entry).map((s) => s.text)).toEqual(["ベット", "シャブ"]);
  });

  it("複数の文章でも最初の1回を共有する", () => {
    const [a, b] = splitTermsMany(["レンジが広い", "レンジとブロッカー"]);
    expect(a!.filter((s) => s.entry).map((s) => s.text)).toEqual(["レンジ"]);
    expect(b!.filter((s) => s.entry).map((s) => s.text)).toEqual(["ブロッカー"]);
  });

  it("見出し・別名が重複しない", () => {
    const words = REVIEW_GLOSSARY.flatMap((e) => [e.term, ...(e.aliases ?? [])]);
    expect(new Set(words).size).toBe(words.length);
  });

  it("解説の用語集(terminology.md)の用語はすべて辞書にある", () => {
    const md = readFileSync(resolve(__dirname, "../../../packages/engine/knowledge/terminology.md"), "utf8");
    const words = new Set(REVIEW_GLOSSARY.flatMap((e) => [e.term, ...(e.aliases ?? [])]));
    const missing: string[] = [];
    for (const line of md.split("\n")) {
      const m = /^\| ([^|]+) \|/.exec(line);
      if (!m || m[1]!.trim() === "用語" || m[1]!.startsWith("---")) continue;
      // 「オールイン(シャブ / ジャム)」→ オールイン・シャブ・ジャム。「スーテッド(s)」の 1 文字の略記は対象外。
      // 「ハイ+ロー(のオフスート)」は続けて読む(ハイ+ローのオフスート)。
      for (const part of m[1]!.replace("(の", "の").replace(/[()]/g, " / ").split("/")) {
        const w = part.trim();
        if (w.length <= 1) continue;
        if (!words.has(w)) missing.push(w);
      }
    }
    expect(missing).toEqual([]);
  });
});
