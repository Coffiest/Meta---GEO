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

const SITE_URL = "https://meta-geo-poker.vercel.app";
const SITE_DESCRIPTION =
  "Poker ART（ポーカーアート／POKERART）は、課金なしのバーチャルチップ専用オンラインポーカー。Sit & Go・MTTのNLHトーナメントを無料でプレイでき、ハンド履歴とレンジ分析で戦略を磨けます。";

export const metadata: Metadata = {
  // 本番URLを基準に相対パス(manifest/OGP等)を絶対URL化する。
  metadataBase: new URL(SITE_URL),
  // ブランド名「Poker ART / ポーカーアート / POKERART」で検索されたときに確実に一致させる。
  title: {
    default: "Poker ART（ポーカーアート）| 無料バーチャルチップ・ポーカートーナメント",
    template: "%s | Poker ART（ポーカーアート）",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Poker ART",
  keywords: [
    "Poker ART",
    "ポーカーアート",
    "POKERART",
    "ポーカー",
    "無料 ポーカー",
    "オンラインポーカー",
    "バーチャルポーカー",
    "ポーカー トーナメント",
    "テキサスホールデム",
    "SNG",
    "MTT",
  ],
  authors: [{ name: "Poker ART" }],
  creator: "Poker ART",
  publisher: "Poker ART",
  // favicon/apple-touch-iconは src/app/icon.png・apple-icon.png のNext.js規約ファイルから自動生成される。
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  // iOSでホーム画面に追加したとき、Safariのタブではなく独立したWebアプリ(スタンドアロン)
  // として起動させるための設定。capable:true が <meta name="apple-mobile-web-app-capable" content="yes"> を出す。
  appleWebApp: {
    capable: true,
    title: "Poker ART",
    // 白テーマに合わせ、ステータスバーは黒文字が読める明るい既定スタイルにする。
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: SITE_URL,
    siteName: "Poker ART（ポーカーアート）",
    title: "Poker ART（ポーカーアート）| 無料バーチャルチップ・ポーカートーナメント",
    description: SITE_DESCRIPTION,
    images: [{ url: "/logos/Logo_s.png", width: 2000, height: 2000, alt: "Poker ART（ポーカーアート）" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Poker ART（ポーカーアート）| 無料バーチャルポーカー",
    description: SITE_DESCRIPTION,
    images: ["/logos/Logo_s.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

// 検索エンジンにブランド(Poker ART=ポーカーアート=POKERART)を「同一の実体」として
// 認識させるための構造化データ。alternateNameでカナ・大文字表記も紐付ける。
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Poker ART",
  alternateName: ["ポーカーアート", "POKERART", "Poker ART（ポーカーアート）"],
  url: SITE_URL,
  applicationCategory: "GameApplication",
  operatingSystem: "Web",
  inLanguage: "ja",
  description: SITE_DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={`${jakarta.className} min-h-screen bg-ink-50 text-ink-950 antialiased`}>
        {/* クローラー向けのブランド見出し。アプリ本体はクライアント描画でサーバーHTMLに本文が
            乗らないため、ブランド名(カナ・英字・大文字)と概要をサーバー描画のテキストとして必ず含める。
            視覚的には隠す(sr-only)がDOMには存在し、実体を正確に説明する正当なテキスト。 */}
        <h1 className="sr-only">Poker ART（ポーカーアート／POKERART）— 無料バーチャルチップ・ポーカートーナメント</h1>
        <p className="sr-only">{SITE_DESCRIPTION}</p>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
