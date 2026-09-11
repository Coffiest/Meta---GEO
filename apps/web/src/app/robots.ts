import type { MetadataRoute } from "next";

/**
 * robots.txt(/robots.txt として配信)。全ページのクロールを許可し、ユーザー個別の棋譜レビュー
 * ページ(/review/...)と運用者向けの診断ページ(/diagnostics)はクロール対象外にする。
 * sitemapの場所も明示する。
 */
export default function robots(): MetadataRoute.Robots {
  const base = "https://meta-geo-poker.vercel.app";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/review/", "/diagnostics"] },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
