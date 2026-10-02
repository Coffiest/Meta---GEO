import { describe, expect, it } from "vitest";
import { optimizeFor, optimizeAll, PLATFORM_RULES } from "../src/optimize.js";

/**
 * 出し分けの肝は「上限を必ず守ること」と「守るために何を捨てたかが分かること」。
 * 黙って途中で切れる実装は、投稿してから気づくことになるので許容しない。
 */
describe("optimizeFor", () => {
  const source = [
    "BBディフェンスで一番多いミスは？",
    "",
    "「オープンに全部降りる」です。6人卓のデータではBTNオープンに対してBBが降りた割合は62%でした。ポットオッズ的には明らかに降りすぎで、しかも降りると分かると相手はさらにレンジを広げてきます。つまり損失は1回のポットでは終わりません。",
    "",
    "自分のデータを無料で見てみて",
    "#ポーカー #GTO #テキサスホールデム #ポーカー勉強",
  ].join("\n");

  it("X では140文字に収め、削ったことを記録する", () => {
    const r = optimizeFor("x", source, { link: "https://meta-geo-poker.vercel.app" });
    expect(r.withinLimit).toBe(true);
    expect(r.length).toBeLessThanOrEqual(140);
    // 何をしたかが残ること。残らないと、なぜ短いのかが後から分からない。
    expect(r.applied.some((a) => a.includes("削除") || a.includes("削減") || a.includes("分割"))).toBe(true);
    // フック(1行目)は必ず生き残る。
    expect(r.text.startsWith("BBディフェンスで一番多いミスは？")).toBe(true);
  });

  it("X のハッシュタグは2個までに絞る", () => {
    const r = optimizeFor("x", source);
    expect((r.text.match(/#[^\s#　]+/g) ?? []).length).toBeLessThanOrEqual(PLATFORM_RULES.x.hashtags);
  });

  it("Instagram は本文リンクが踏まれないのでプロフィール誘導へ差し替える", () => {
    const link = "https://meta-geo-poker.vercel.app";
    const r = optimizeFor("instagram", source, { link });
    expect(r.text).not.toContain(link);
    expect(r.text).toContain("プロフィールのリンク");
    expect(r.applied.some((a) => a.includes("プロフィール誘導"))).toBe(true);
  });

  it("X ではリンクを本文にそのまま置く", () => {
    const link = "https://meta-geo-poker.vercel.app";
    expect(optimizeFor("x", source, { link }).text).toContain(link);
  });

  it("長い段落は空行で割る", () => {
    const r = optimizeFor("instagram", source);
    // 元は1段落が200文字超。Instagram の目安120文字で割られること。
    const longest = Math.max(...r.text.split(/\n\s*\n/).map((p) => p.length));
    expect(longest).toBeLessThanOrEqual(PLATFORM_RULES.instagram.paragraphMax + 40);
  });

  it("全プラットフォームで上限を超えない", () => {
    for (const r of optimizeAll(source, { link: "https://meta-geo-poker.vercel.app" })) {
      expect(r.withinLimit, `${r.platform} が上限超過 (${r.length})`).toBe(true);
    }
  });

  it("極端に長い原稿でも上限を守り、フックを残す", () => {
    const huge = "衝撃の事実。\n\n" + "あ".repeat(5000);
    const r = optimizeFor("x", huge);
    expect(r.length).toBeLessThanOrEqual(140);
    expect(r.text.startsWith("衝撃の事実。")).toBe(true);
  });
});
