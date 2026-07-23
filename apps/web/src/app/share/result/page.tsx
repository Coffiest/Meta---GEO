import type { Metadata } from "next";
import Link from "next/link";

/**
 * Xの intent ツイートから開かれる「トーナメント結果」共有ランディング。
 * OGP画像に動的生成カード(/api/og/result)を指定し、タイムライン上でリッチカードとして展開させる。
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
  for (const key of ["name", "pos", "entrants", "payout", "rank", "mode"]) {
    const v = first(sp[key]);
    if (v != null && v !== "") p.set(key, v);
  }
  return p.toString();
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** 結果の一言サマリ(タイトル/本文用)。 */
function summarize(sp: SP): string {
  const posStr = first(sp["pos"]);
  const pos = posStr != null && posStr !== "" ? Number(posStr) : null;
  const entrantsStr = first(sp["entrants"]);
  const entrants = entrantsStr != null && entrantsStr !== "" ? Number(entrantsStr) : null;
  const mode = first(sp["mode"]) === "mtt" ? "mtt" : "sng";
  if (pos == null) return "トーナメント結果";
  const rank = mode === "mtt" && entrants ? `${pos} / ${entrants}位` : `${ordinal(pos)}`;
  return pos === 1 ? `優勝（${rank}）` : `${rank}`;
}

export function generateMetadata({ searchParams }: { searchParams: SP }): Metadata {
  const qs = ogQuery(searchParams);
  const name = first(searchParams["name"]);
  const result = summarize(searchParams);
  const who = name ? `${name} さん` : "プレイヤー";
  const title = `${who}の${result} — Poker ART`;
  const description = "課金なしで実力が数値に出る無料オンラインポーカー。Sit & Go・MTTを今すぐプレイ。";
  const ogImage = `${SITE_URL}/api/og/result${qs ? `?${qs}` : ""}`;
  return {
    title,
    description,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      title,
      description,
      url: `${SITE_URL}/share/result${qs ? `?${qs}` : ""}`,
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

export default function ShareResultPage({ searchParams }: { searchParams: SP }) {
  const qs = ogQuery(searchParams);
  const ogImage = `/api/og/result${qs ? `?${qs}` : ""}`;
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
        background: "#ffffff",
        color: "#0d0d10",
      }}
    >
      <div style={{ width: "100%", maxWidth: "560px", display: "flex", flexDirection: "column", gap: "24px", alignItems: "center" }}>
        {/* 生成カードのプレビュー */}
        {/* eslint-disable-next-line @next/next/no-img-element -- 動的OGルートの外部相当URLをそのまま表示 */}
        <img
          src={ogImage}
          alt="トーナメント結果カード"
          width={1200}
          height={630}
          style={{ width: "100%", height: "auto", borderRadius: "20px", border: "1px solid #ececec", boxShadow: "0 24px 60px -30px rgba(0,0,0,0.35)" }}
        />
        <p style={{ fontSize: "17px", fontWeight: 700, textAlign: "center", color: "#4a4a50", lineHeight: 1.6, margin: 0 }}>
          Poker ART（ポーカーアート）は、課金なしで実力が数値に出る無料オンラインポーカー。
          <br />
          あなたの全国順位を上げにいこう。
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
            background: "#d4910a",
            color: "#ffffff",
            fontSize: "18px",
            fontWeight: 900,
            textDecoration: "none",
            boxShadow: "0 14px 34px -12px rgba(212,145,10,0.6)",
          }}
        >
          無料でプレイする
        </Link>
      </div>
    </main>
  );
}
