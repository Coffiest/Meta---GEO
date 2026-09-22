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
    background_color: "#1C1C1E",
    theme_color: "#1C1C1E",
    lang: "ja",
    // アイコンはオーナー支給のクラブのスプラッター(黒地+ティール)。scripts/app-icons.py で
    // 1枚の原画から書き出す。`any` は原画の構図のままフルブリード、`maskable` は絵柄を
    // セーフゾーン(中心の直径80%)へ収めた別の絵 ―― Androidは端末ごとの形で切り抜くため、
    // 同じ絵を両方に渡すと外周のスプラッターが欠ける。
    // なお iOS はPWAでもここではなく apple-touch-icon(src/app/apple-icon.png)を使う。
    icons: [
      { src: "/logos/Logo_club_1024.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      { src: "/logos/Logo_club_mask_1024.png", sizes: "1024x1024", type: "image/png", purpose: "maskable" },
    ],
  };
}
