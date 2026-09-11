import { describe, expect, it } from "vitest";
import { analyzePost, findIssues } from "../src/structure.js";

/**
 * 構造抽出は、この後の「出し分け」「作り直し」「弱点指摘」全ての土台になる。
 * ここがずれると下流が全部ずれるので、実際に投稿しそうな文面で確かめる。
 */
describe("analyzePost", () => {
  const post = [
    "BBディフェンスで一番多いミスは？",
    "",
    "「オープンに全部降りる」です。",
    "6人卓のデータでは、BTNオープンに対してBBが降りた割合は62%でした。",
    "",
    "・ポットオッズ的に降りすぎ",
    "・降りると分かると相手が広げてくる",
    "",
    "無料で自分のデータを見てみて → https://meta-geo-poker.vercel.app",
    "#ポーカー #GTO",
  ].join("\n");

  it("フック・数字・箇条書き・CTA を取り出す", () => {
    const s = analyzePost(post);
    expect(s.hook).toBe("BBディフェンスで一番多いミスは？");
    expect(s.hasQuestion).toBe(true);
    expect(s.hasCta).toBe(true);
    expect(s.bulletLines).toBe(2);
    expect(s.hashtags).toEqual(["#ポーカー", "#GTO"]);
    expect(s.urls).toEqual(["https://meta-geo-poker.vercel.app"]);
    // 「6人」「62%」を具体の数字として拾えていること。
    expect(s.numbers.some((n) => n.includes("62"))).toBe(true);
    expect(s.numbers.some((n) => n.includes("6"))).toBe(true);
  });

  it("ハッシュタグとURLは本文の密度計算から外す", () => {
    // タグやURLを本文に含めたまま平均段落長を出すと、実際より「詰まって」見えてしまう。
    const withTags = analyzePost("短い本文。\n\n#a #b #c #d #e https://example.com/very/long/path/that/is/long");
    expect(withTags.hashtags).toHaveLength(5);
    // 数字はタグ・URLを除いた本文から拾うので、URL中の数字を誤検出しない。
    expect(withTags.numbers).toEqual([]);
  });
});

describe("findIssues", () => {
  it("良い投稿には弱点を出さない", () => {
    const s = analyzePost("勝率が62%上がった理由\n\n降りる基準を1つに絞ったからです。\n\n試してみて → https://x.example\n#ポーカー");
    const codes = findIssues(s).map((i) => i.code);
    expect(codes).not.toContain("no-numbers");
    expect(codes).not.toContain("no-cta");
    expect(codes).not.toContain("hook-missing-punch");
  });

  it("数字もCTAも無く、フックが長い投稿は全部指摘する", () => {
    const bad = "ポーカーというゲームはとても奥が深くて面白いものだと私は考えていますがみなさんはどうでしょうか";
    const codes = findIssues(analyzePost(bad)).map((i) => i.code);
    expect(codes).toContain("hook-too-long");
    expect(codes).toContain("no-numbers");
    expect(codes).toContain("no-cta");
  });

  it("上限を渡すと超過分の文字数まで出す", () => {
    const long = "あ".repeat(200);
    const issue = findIssues(analyzePost(long), 140).find((i) => i.code === "too-long");
    expect(issue).toBeDefined();
    // 「何文字削ればいいか」が分かる形で出ること(削る量が分からない指摘は行動に移せない)。
    expect(issue!.message).toContain("60文字削る");
  });

  it("ハッシュタグの付けすぎを拾う", () => {
    const codes = findIssues(analyzePost("本文\n#a #b #c #d")).map((i) => i.code);
    expect(codes).toContain("too-many-hashtags");
  });
});
