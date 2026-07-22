import type { ReactNode } from "react";
import Link from "next/link";

/**
 * 公開コンテンツページ(遊び方・戦略・用語集・プライバシー)共通のレイアウト。
 * ルートグループ (content) のため URL には影響しない(/guide, /strategy ...)。
 * ログイン不要で読め、ヘッダー/フッターの内部リンクで各ページを相互に結ぶ。
 * アプリ本体(白基調・ゴールドアクセントのSwissトーン)に配色を合わせている。
 */

const NAV = [
  { href: "/guide", label: "遊び方" },
  { href: "/strategy", label: "GEO戦略" },
  { href: "/glossary", label: "用語集" },
];

const FOOTER_LINKS = [
  { href: "/guide", label: "遊び方・ルール" },
  { href: "/strategy", label: "GEO/GTO戦略" },
  { href: "/glossary", label: "用語集" },
  { href: "/pricing", label: "料金プラン" },
  { href: "/privacy", label: "プライバシーポリシー" },
  { href: "/legal/tokushoho", label: "特定商取引法に基づく表記" },
];

export default function ContentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-ink-950">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3">
          <Link href="/" className="text-[12px] font-black uppercase tracking-[0.22em] text-gold-600">
            POKER ART
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-950"
              >
                {n.label}
              </Link>
            ))}
            <Link
              href="/"
              className="ml-1 rounded-full bg-gold-500 px-3.5 py-1.5 text-[12px] font-black text-ink-950 transition-transform active:scale-95"
            >
              プレイ
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-ink-200 bg-ink-50">
        <div className="mx-auto max-w-2xl px-5 py-10">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-gold-600">Poker ART（ポーカーアート）</div>
          <p className="mt-2 max-w-lg text-[12px] leading-relaxed text-ink-500">
            課金なしのバーチャルチップ専用オンラインポーカー。Sit &amp; Go・MTTのNLHトーナメントを無料でプレイでき、
            ハンド履歴とレンジ分析(GEO戦略データベース)で戦略を磨けます。実際の金銭の賭けや換金は一切ありません。
          </p>
          <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
            {FOOTER_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-[12px] font-semibold text-ink-600 underline-offset-2 hover:text-ink-950 hover:underline">
                {l.label}
              </Link>
            ))}
          </nav>
          <p className="mt-8 text-[11px] text-ink-400">© 2026 Poker ART</p>
        </div>
      </footer>
    </div>
  );
}
