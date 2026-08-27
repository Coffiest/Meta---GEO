import { describe, expect, it } from "vitest";
import { parseFeed, collectTrends, filterRelevant, defaultSources, youtubeChannelSource, dedupeItems, dedupeKeyOf } from "../src/trends.js";

const SRC = { kind: "google-news" as const, label: "ニュース", url: "https://example.invalid/rss" };

describe("parseFeed", () => {
  it("RSS(item)から題名・リンク・日時を取り出す", () => {
    const xml = `<rss><channel>
      <item><title><![CDATA[ポーカー人口が急増]]></title><link>https://ex.com/a</link><pubDate>Sat, 23 Aug 2026 09:00:00 GMT</pubDate></item>
      <item><title>2本目&amp;記号</title><link>https://ex.com/b</link></item>
    </channel></rss>`;
    const items = parseFeed(xml, SRC);
    expect(items).toHaveLength(2);
    expect(items[0]!.title).toBe("ポーカー人口が急増");   // CDATA が剥がれる
    expect(items[0]!.link).toBe("https://ex.com/a");
    expect(items[0]!.publishedAt).toContain("2026");
    expect(items[1]!.title).toBe("2本目&記号");            // 実体参照が戻る
    expect(items[1]!.publishedAt).toBeNull();
  });

  it("Atom(entry・link は href 属性)も読める", () => {
    // YouTube のフィードはこの形。RSSだけ対応していると競合チャンネル監視が丸ごと空になる。
    const xml = `<feed><entry>
      <title>新作ポーカー動画</title>
      <link rel="alternate" href="https://youtu.be/xyz"/>
      <published>2026-08-23T09:00:00+00:00</published>
    </entry></feed>`;
    const items = parseFeed(xml, { ...SRC, kind: "youtube" });
    expect(items).toHaveLength(1);
    expect(items[0]!.link).toBe("https://youtu.be/xyz");
    expect(items[0]!.publishedAt).toContain("2026-08-23");
  });

  it("空のフィードは空配列(例外にしない)", () => {
    expect(parseFeed("<rss><channel></channel></rss>", SRC)).toEqual([]);
  });
});

describe("collectTrends", () => {
  it("1つのソースが落ちても他は集め、落ちた理由を残す", async () => {
    const ok = { kind: "hatena" as const, label: "OK", url: "https://ok.invalid" };
    const ng = { kind: "google-news" as const, label: "NG", url: "https://ng.invalid" };
    const boom = { kind: "youtube" as const, label: "BOOM", url: "https://boom.invalid" };

    const fake = (async (url: string) => {
      if (url.includes("ok")) return { ok: true, status: 200, text: async () => "<rss><item><title>取れた</title><link>https://a</link></item></rss>" };
      if (url.includes("ng")) return { ok: false, status: 503, text: async () => "" };
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const r = await collectTrends([ok, ng, boom], fake);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.title).toBe("取れた");
    // 「0件」と「取得失敗」を取り違えないことが要点。
    expect(r.failures).toHaveLength(2);
    expect(r.failures.find((f) => f.source.label === "NG")!.reason).toBe("HTTP 503");
    expect(r.failures.find((f) => f.source.label === "BOOM")!.reason).toBe("network down");
  });

  it("ソースごとに件数を打ち切る", async () => {
    const many = Array.from({ length: 50 }, (_, i) => `<item><title>t${i}</title><link>https://x/${i}</link></item>`).join("");
    const fake = (async () => ({ ok: true, status: 200, text: async () => `<rss>${many}</rss>` })) as unknown as typeof fetch;
    const r = await collectTrends([SRC], fake, 5);
    expect(r.items).toHaveLength(5);
  });
});

describe("filterRelevant", () => {
  it("キーワードに当たるものだけ残す", () => {
    const items = parseFeed(
      `<rss><item><title>ポーカー大会が開催</title><link>https://a</link></item>
       <item><title>将棋のニュース</title><link>https://b</link></item></rss>`,
      SRC,
    );
    const r = filterRelevant(items, ["ポーカー"]);
    expect(r).toHaveLength(1);
    expect(r[0]!.title).toContain("ポーカー");
  });
});

describe("既定のソース", () => {
  it("キーワードごとにニュース検索を組み立てる", () => {
    const s = defaultSources(["ポーカー"]);
    const news = s.find((x) => x.kind === "google-news")!;
    expect(news.url).toContain(encodeURIComponent("ポーカー"));
    expect(news.url).toContain("ceid=JP:ja");
    // トレンドとはてブは常に入る。
    expect(s.some((x) => x.kind === "google-trends")).toBe(true);
    expect(s.some((x) => x.kind === "hatena")).toBe(true);
  });

  it("YouTubeチャンネルのフィードURLを作れる", () => {
    const s = youtubeChannelSource("UC123", "競合A");
    expect(s.url).toContain("channel_id=UC123");
    expect(s.label).toBe("競合A");
  });
});

describe("dedupeItems", () => {
  it("同じ記事が複数のキーワードから来ても1件にまとめる", async () => {
    // 実測で「ポーカー」と「テキサスホールデム」の両方から同一記事が来た。
    // 重複したまま digest に出すと、同じ見出しが並びネガティブ検知も二重に鳴る。
    const same = `<rss><item><title>同じ記事</title><link>https://ex.com/same</link></item></rss>`;
    const a = { kind: "google-news" as const, label: "kw:A", url: "https://a.invalid" };
    const b = { kind: "google-news" as const, label: "kw:B", url: "https://b.invalid" };
    const fake = (async () => ({ ok: true, status: 200, text: async () => same })) as unknown as typeof fetch;

    const r = await collectTrends([a, b], fake);
    expect(r.items).toHaveLength(1);
  });

  it("リンクが空のものは題名で重複を判定する", () => {
    const mk = (title: string, link: string) => ({
      source: "google-trends" as const, sourceLabel: "t", title, link, publishedAt: null,
    });
    const r = dedupeItems([mk("同じ", ""), mk("同じ", ""), mk("別", "")]);
    expect(r.map((x) => x.title)).toEqual(["同じ", "別"]);
  });

  it("題名が違えば別件として残す", () => {
    const mk = (title: string, link: string) => ({
      source: "google-news" as const, sourceLabel: "n", title, link, publishedAt: null,
    });
    expect(dedupeItems([mk("記事A", "https://a"), mk("記事B", "https://b")])).toHaveLength(2);
  });

  it("題名が同じなら、リンクが違っても1件にまとめる(意図した割り切り)", () => {
    // 題名が同じ別記事を1件にしてしまう可能性は残るが、同じ見出しが並ぶ方が実害が大きい。
    // Googleニュースが検索ごとに別URLを返す以上、リンク基準では重複を防げない。
    const mk = (link: string) => ({
      source: "google-news" as const, sourceLabel: "n", title: "同題名", link, publishedAt: null,
    });
    expect(dedupeItems([mk("https://a"), mk("https://b")])).toHaveLength(1);
  });
});

describe("dedupeKeyOf", () => {
  it("Googleニュースの追跡URL違いを同一記事として扱う", () => {
    // 実測で起きた事象: 同じイカサマ報道が「ポーカー」と「テキサスホールデム」の
    // 検索から別リンクで届き、2件保存されてしまった。リンクで見ると防げない。
    const mk = (link: string) => ({
      source: "google-news" as const, sourceLabel: "n", link, publishedAt: null,
      title: "ポーカーをしていた客と店員に「イカサマやってんだろ」 - 例社",
    });
    const r = dedupeItems([mk("https://news.google.com/rss/articles/AAA"), mk("https://news.google.com/rss/articles/BBB")]);
    expect(r).toHaveLength(1);
  });

  it("題名の空白ゆれを吸収する", () => {
    expect(dedupeKeyOf({ title: "  ポーカー   大会 " })).toBe(dedupeKeyOf({ title: "ポーカー 大会" }));
  });
});

describe("同一事件の複数媒体報道", () => {
  it("媒体名だけが違う同じ見出しは1件にまとめる", () => {
    // 実測で起きた事象: 同じイカサマ報道が別媒体名で2件保存された。
    const mk = (outlet: string) => ({
      source: "google-news" as const, sourceLabel: "n", link: `https://x/${outlet}`, publishedAt: null,
      title: `ポーカー店で客が逮捕 - ${outlet}`,
    });
    expect(dedupeItems([mk("au Webポータル"), mk("FNNプライムオンライン")])).toHaveLength(1);
  });

  it("見出し本体が違えば別件として残す", () => {
    const mk = (head: string) => ({
      source: "google-news" as const, sourceLabel: "n", link: `https://x/${head}`, publishedAt: null,
      title: `${head} - 同じ媒体`,
    });
    expect(dedupeItems([mk("大会が開催"), mk("新店舗が開店")])).toHaveLength(2);
  });

  it("媒体名の付かない見出し(はてブ等)はそのまま扱う", () => {
    expect(dedupeKeyOf({ title: "ポーカーの確率入門" })).toBe("ポーカーの確率入門");
  });
});
