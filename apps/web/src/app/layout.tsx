import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n";

// 姉妹アプリRRPokerと統一したフォント。
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  // 本番URLを基準に相対パス(manifest/OGP等)を絶対URL化する。
  metadataBase: new URL("https://meta-geo-poker.vercel.app"),
  title: "Poker ART",
  description: "GTO戦略のバーチャルチップ専用ポーカートーナメント",
  applicationName: "Poker ART",
  // favicon/apple-touch-iconは src/app/icon.png・apple-icon.png のNext.js規約ファイルから自動生成される。
  manifest: "/manifest.webmanifest",
  // iOSでホーム画面に追加したとき、Safariのタブではなく独立したWebアプリ(スタンドアロン)
  // として起動させるための設定。capable:true が <meta name="apple-mobile-web-app-capable" content="yes"> を出す。
  appleWebApp: {
    capable: true,
    title: "Poker ART",
    // 白テーマに合わせ、ステータスバーは黒文字が読める明るい既定スタイルにする。
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={`${jakarta.className} min-h-screen bg-ink-50 text-ink-950 antialiased`}>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
