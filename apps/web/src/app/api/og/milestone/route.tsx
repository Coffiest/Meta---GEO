import { ImageResponse } from "next/og";

export const runtime = "edge";

/**
 * マイルストーン(節目到達)のX共有カード(OGP画像)を動的生成する。
 * 白 + ゴールドのミニマルデザイン。到達した節目そのものを主役に据える。
 *
 * 例: /api/og/milestone?name=たこやき&kind=tournaments&n=100
 *     /api/og/milestone?name=Goma&kind=rank&n=10&total=1240
 */

/**
 * Google Fonts の css2 から、必要な文字だけをサブセットした日本語フォントを取得する。
 * satori(next/og)は woff2 を解釈できないため、UAを付けず truetype を得る。
 * 取得失敗時は null を返し、フォント無しでレンダリングする(Latinはフォールバックで描画される)。
 */
async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url)).text();
    const src = css.match(/src:\s*url\((.+?)\)\s*format\('(?:opentype|truetype)'\)/);
    if (!src) return null;
    const res = await fetch(src[1]);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

const GOLD = "#d4910a";
const GOLD_DEEP = "#a16a06";
const INK = "#0d0d10";
const INK_MUTED = "#9a9a9f";
const BG = "#ffffff";

/** 月桂樹風の勲章マーク(絵文字は使わずSVGで描く)。 */
function MedalMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="5.5" />
      <path d="M9 14.2 7.5 21l4.5-2.4 4.5 2.4-1.5-6.8" />
    </svg>
  );
}

export async function GET(req: Request): Promise<ImageResponse> {
  const { searchParams } = new URL(req.url);
  const name = (searchParams.get("name") ?? "").slice(0, 24);
  const kind = searchParams.get("kind") === "rank" ? "rank" : "tournaments";
  const n = Math.max(0, Math.min(100000, Number(searchParams.get("n") ?? "0") || 0));
  const total = Math.max(0, Number(searchParams.get("total") ?? "0") || 0);

  const isRank = kind === "rank";
  // 主役の文字列。順位は "TOP 10" / "1st"、参加数はそのまま大きな数字。
  const headline = isRank ? (n === 1 ? "全国 1 位" : `TOP ${n}`) : n === 1 ? "初トーナメント" : n.toLocaleString();
  const suffix = !isRank && n > 1 ? "戦" : "";
  const caption = isRank
    ? total > 0
      ? `${total.toLocaleString()} 人中`
      : "全国ランキング"
    : n === 1
      ? "Poker ARTデビュー"
      : "通算トーナメント参加数";
  // 長い見出しは字を詰める(「初トーナメント」など)。
  const headlineSize = headline.length >= 7 ? "108px" : headline.length >= 5 ? "140px" : "180px";

  const glyphs = `${name}${headline}${caption}${suffix}マイルストーン到達実力が数字に出る無料ポーカー全国位人中通算トーナメント参加数初デビューPokerARTMILESTONE0123456789 ,./`;
  const [bold, black] = await Promise.all([
    loadGoogleFont("Noto Sans JP", 700, glyphs),
    loadGoogleFont("Noto Sans JP", 900, glyphs),
  ]);
  const fonts: { name: string; data: ArrayBuffer; weight: 700 | 900; style: "normal" }[] = [];
  if (bold) fonts.push({ name: "NotoJP", data: bold, weight: 700, style: "normal" });
  if (black) fonts.push({ name: "NotoJP", data: black, weight: 900, style: "normal" });
  const fontFamily = fonts.length ? "NotoJP" : "sans-serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          background: BG,
          fontFamily,
          position: "relative",
          padding: "56px 72px",
        }}
      >
        {/* 上部ゴールドライン */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "1200px", height: "10px", background: GOLD, display: "flex" }} />

        {/* ヘッダー: 表示名 + 勲章マーク */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "8px", color: INK_MUTED }}>MILESTONE</span>
            {name ? <span style={{ fontSize: "40px", fontWeight: 900, color: INK, marginTop: "8px" }}>{name}</span> : null}
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <MedalMark size={56} />
          </div>
        </div>

        {/* 中央: 節目の超特大表示 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{ fontSize: headlineSize, fontWeight: 900, color: isRank ? GOLD_DEEP : INK, lineHeight: 1 }}>{headline}</span>
            {suffix ? <span style={{ fontSize: "72px", fontWeight: 900, color: GOLD, marginLeft: "10px" }}>{suffix}</span> : null}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: "28px",
              padding: "12px 34px",
              borderRadius: "999px",
              background: "rgba(212,145,10,0.14)",
              color: GOLD_DEEP,
              fontSize: "32px",
              fontWeight: 900,
            }}
          >
            {caption}
          </div>
        </div>

        {/* フッター: キャッチ + アプリ名/URL */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", width: "100%" }}>
          <span style={{ fontSize: "24px", fontWeight: 700, color: INK_MUTED }}>実力が数字に出る無料ポーカー</span>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: "32px", fontWeight: 900, color: INK }}>Poker ART</span>
            <span style={{ fontSize: "21px", fontWeight: 700, color: GOLD_DEEP }}>meta-geo-poker.vercel.app</span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      ...(fonts.length ? { fonts } : {}),
    },
  );
}
