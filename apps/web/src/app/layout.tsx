import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// 姉妹アプリRRPokerと統一したフォント。
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Poker ART",
  description: "GTO戦略のバーチャルチップ専用ポーカートーナメント",
  // favicon/apple-touch-iconは src/app/icon.png・apple-icon.png のNext.js規約ファイルから自動生成される。
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
      <body className={`${jakarta.className} min-h-screen bg-ink-50 text-ink-950 antialiased`}>{children}</body>
    </html>
  );
}
