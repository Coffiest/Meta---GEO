import type { Metadata } from "next";
import Link from "next/link";

/**
 * Xの intent ツイートから開かれる「このハンド」共有ランディング。
 * OGP画像に動的生成カード(/api/og/hand)を指定し、タイムライン上でリッチカードとして展開させる。
 * ページ本体は白+ゴールドのミニマルなカードプレビュー + 「無料でプレイ」CTA。
 */

const SITE_URL = "https://meta-geo-poker.vercel.app";

type SP = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** searchParams をOG画像ルートへ引き渡すクエリ文字列にする(未指定は落とす)。 */
function ogQuery(sp: SP): string {
  const p = new URLSearchParams();
  for (const key of ["name", "h", "b", "bb", "fold"]) {
    const v = first(sp[key]);
    if (v != null && v !== "") p.set(key, v);
  }
  return p.toString();
}

/** 収支の一言サマリ(タイトル/本文用)。 */
function summarize(sp: SP): string {
  const raw = Number(first(sp["bb"]) ?? "0");
  const bb = Number.isFinite(raw) ? Math.round(raw * 10) / 10 : 0;
  if (bb === 0) return "このハンド";
  const abs = Number.isInteger(bb) ? String(Math.abs(bb)) : Math.abs(bb).toFixed(1);
  return `このハンドで${bb > 0 ? "+" : "-"}${abs}bb`;
}

export function generateMetadata({ searchParams }: { searchParams: SP }): Metadata {
  const qs = ogQuery(searchParams);
  const name = first(searchParams["name"]);
  const who = name ? `${name} さん` : "プレイヤー";
  const title = `${who}の${summarize(searchParams)} — Poker ART`;
  const description = "課金なしで実力が数値に出る無料オンラインポーカー。Sit & Go・MTTを今すぐプレイ。";
  const ogImage = `${SITE_URL}/api/og/hand${qs ? `?${qs}` : ""}`;
  return {
    title,
    description,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      title,
      description,
      url: `${SITE_URL}/share/hand${qs ? `?${qs}` : ""}`,
      siteName: "Poker ART（ポーカーアート）",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default function ShareHandPage({ searchParams }: { searchParams: SP }) {
  const qs = ogQuery(searchParams);
  const ogImage = `/api/og/hand${qs ? `?${qs}` : ""}`;
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "28px",
        padding: "40px 20px",
        background: "#1c1c1e",
        color: "#f5f5f7",
      }}
    >
      <div style={{ width: "100%", maxWidth: "560px", display: "flex", flexDirection: "column", gap: "24px", alignItems: "center" }}>
        {/* 生成カードのプレビュー */}
        {/* eslint-disable-next-line @next/next/no-img-element -- 動的OGルートの外部相当URLをそのまま表示 */}
        <img
          src={ogImage}
          alt="ハンド共有カード"
          width={1200}
          height={630}
          style={{ width: "100%", height: "auto", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 24px 60px -24px rgba(0,0,0,0.75)" }}
        />
        <p style={{ fontSize: "17px", fontWeight: 700, textAlign: "center", color: "#aeaeb2", lineHeight: 1.6, margin: 0 }}>
          Poker ART（ポーカーアート）は、課金なしで実力が数値に出る無料オンラインポーカー。
          <br />
          あなたの神ハンドも、ワンタップでシェアできます。
        </p>
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            maxWidth: "360px",
            padding: "18px 24px",
            borderRadius: "16px",
            background: "#26c2a3",
            color: "#04211b",
            fontSize: "18px",
            fontWeight: 900,
            textDecoration: "none",
            boxShadow: "0 14px 34px -10px rgba(38,194,163,0.55)",
          }}
        >
          無料でプレイする
        </Link>
      </div>
    </main>
  );
}
