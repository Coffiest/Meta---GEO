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
    // アイコンは既存ワードマークを白背景でパディングしたもの(/logos/Logo_app_icon.png)。
    // フルブリードだとiOSホーム画面で黒く沈むため、白マージンを付けて白基調のタイルにする。新規ロゴは作らない。
    icons: [
      { src: "/logos/Logo_app_icon.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      { src: "/logos/Logo_app_icon.png", sizes: "1024x1024", type: "image/png", purpose: "maskable" },
    ],
  };
}
