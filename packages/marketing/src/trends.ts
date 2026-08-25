/**
 * ④ トレンドを自動収集する。
 *
 * 認証情報が要らないソースだけで組んである。X API や Meta Graph は有料/審査が要り、
 * 鍵が無ければ1件も取れないが、ここに挙げたRSSは鍵なしで今日から動く。
 * (到達性は実測済み: Google Trends JP / Google News / YouTube / はてな いずれも 200)
 *
 * パーサは正規表現ベース。RSSのためだけに XML パーサを足すほどの構造ではなく、
 * 対象も自分で選んだ既知のフィードに限られるため。
 */

export type TrendSourceKind = "google-trends" | "google-news" | "youtube" | "hatena";

export interface TrendSource {
  kind: TrendSourceKind;
  /** 画面に出す名前。 */
  label: string;
  url: string;
}

/** 収集した1件。 */
export interface TrendItem {
  source: TrendSourceKind;
  sourceLabel: string;
  title: string;
  link: string;
  /** RSS が返した公開日時(取れなければ null)。 */
  publishedAt: string | null;
}

/** ポーカー/ゲーム領域で見ておくべき既定のフィード。 */
export function defaultSources(keywords: string[] = ["ポーカー", "テキサスホールデム", "GTO ポーカー"]): TrendSource[] {
  const news: TrendSource[] = keywords.map((kw) => ({
    kind: "google-news",
    label: `ニュース: ${kw}`,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(kw)}&hl=ja&gl=JP&ceid=JP:ja`,
  }));
  return [
    { kind: "google-trends", label: "Googleトレンド(日本)", url: "https://trends.google.co.jp/trending/rss?geo=JP" },
    { kind: "hatena", label: "はてブ ゲーム", url: "https://b.hatena.ne.jp/hotentry/game.rss" },
    ...news,
  ];
}

/** YouTube チャンネルの投稿フィード。競合チャンネルの監視に使う。 */
export function youtubeChannelSource(channelId: string, label: string): TrendSource {
  return {
    kind: "youtube",
    label,
    url: `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
  };
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function pick(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]!) : null;
}

/**
 * RSS / Atom の本文をパースする。
 *
 * RSS は `<item>`、Atom(YouTube) は `<entry>` を使うので両方見る。
 * リンクは RSS が要素の中身、Atom が `href` 属性という違いがあるため、両方から拾う。
 */
export function parseFeed(xml: string, source: TrendSource): TrendItem[] {
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/\1>/gi) ?? [];
  const out: TrendItem[] = [];
  for (const b of blocks) {
    const title = pick(b, "title");
    if (!title) continue;
    const linkTag = pick(b, "link");
    const hrefAttr = b.match(/<link[^>]*href="([^"]+)"/i)?.[1];
    const link = decodeEntities(linkTag && linkTag.length > 0 ? linkTag : (hrefAttr ?? ""));
    out.push({
      source: source.kind,
      sourceLabel: source.label,
      title,
      link,
      publishedAt: pick(b, "pubDate") ?? pick(b, "published") ?? pick(b, "updated") ?? null,
    });
  }
  return out;
}

/**
 * 重複を落とす。
 *
 * 同じ記事が複数のキーワード検索に引っかかるのは普通に起きる(実測でも
 * 「ポーカー」と「テキサスホールデム」の両方から同一記事が来た)。そのまま digest に出すと
 * 同じ見出しが並び、ネガティブ検知も同じ記事を二重に通知してしまう。
 *
 * リンクが同じものを同一とみなす。リンクが空のもの(Googleトレンドの一部)は題名で見る。
 */
export function dedupeItems(items: TrendItem[]): TrendItem[] {
  const seen = new Set<string>();
  const out: TrendItem[] = [];
  for (const i of items) {
    const key = i.link.length > 0 ? `l:${i.link}` : `t:${i.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(i);
  }
  return out;
}

/** 収集結果。取れなかったソースも理由つきで残す(黙って0件にしない)。 */
export interface CollectResult {
  items: TrendItem[];
  failures: { source: TrendSource; reason: string }[];
}

/**
 * 全ソースを取りに行く。
 *
 * 1つのフィードが落ちても他は集める。どれが落ちたかは failures に残すので、
 * 「今日は0件でした」が本当に0件なのか取得失敗なのかを取り違えない。
 */
export async function collectTrends(
  sources: TrendSource[],
  fetchImpl: typeof fetch = fetch,
  perSourceLimit = 20,
): Promise<CollectResult> {
  const items: TrendItem[] = [];
  const failures: CollectResult["failures"] = [];

  for (const source of sources) {
    try {
      const res = await fetchImpl(source.url, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; PokerArtTrendBot/1.0)" },
      });
      if (!res.ok) {
        failures.push({ source, reason: `HTTP ${res.status}` });
        continue;
      }
      items.push(...parseFeed(await res.text(), source).slice(0, perSourceLimit));
    } catch (err) {
      failures.push({ source, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { items: dedupeItems(items), failures };
}

/**
 * 自社に関係する話題だけへ絞る。
 *
 * 収集そのものは広く行い、絞り込みはここで別途行う。順序を逆にすると
 * 「拾えていたのに捨てていた」ことに後から気づけないため。
 */
export function filterRelevant(items: TrendItem[], keywords: string[]): TrendItem[] {
  const lowered = keywords.map((k) => k.toLowerCase());
  return items.filter((i) => {
    const t = i.title.toLowerCase();
    return lowered.some((k) => t.includes(k));
  });
}
