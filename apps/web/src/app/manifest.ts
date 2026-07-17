import type { MetadataRoute } from "next";

/**
 * PWAマニフェスト。これが無いと iOS でホーム画面に追加してもスタンドアロン(独立アプリ)
 * にならず、Safariのタブとして開いてしまう。display:standalone + start_url/scope を
 * 明示することで、ホーム画面アイコンから起動したときに独立Webアプリとして動く。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Poker ART",
    short_name: "Poker ART",
    description: "GTO戦略のバーチャルチップ専用ポーカートーナメント",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "ja",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
