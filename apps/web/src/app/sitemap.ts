import type { MetadataRoute } from "next";

/**
 * サイトマップ。検索エンジンにクロール対象の公開ページを伝える(/sitemap.xml として配信)。
 * Google Search Console に登録する際もこのURLを送信する。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://meta-geo-poker.vercel.app";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/geo`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/legal/tokushoho`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
