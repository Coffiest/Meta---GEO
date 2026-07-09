import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GTO Poker",
  description: "GTO戦略のバーチャルチップ専用ポーカートーナメント",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#fafafa",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-ink-50 text-ink-950 font-sans antialiased">{children}</body>
    </html>
  );
}
