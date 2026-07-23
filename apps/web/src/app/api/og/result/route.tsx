import { ImageResponse } from "next/og";

export const runtime = "edge";

/**
 * トーナメント結果のX共有カード(OGP画像)を動的生成する。
 * 白 + ゴールドのミニマルデザイン。着順を主役に、獲得プライズ・全国順位・表示名を添える。
 *
 * 例: /api/og/result?name=たこやき&pos=1&payout=12000&rank=234&mode=sng
 *     /api/og/result?name=Goma&pos=6&entrants=521&payout=8000&mode=mtt
 */

/** 英語の序数表記(1st / 2nd / 3rd / 4th ...)。 */
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

export async function GET(req: Request): Promise<ImageResponse> {
  const { searchParams } = new URL(req.url);
  const name = (searchParams.get("name") ?? "").slice(0, 24);
  const posRaw = searchParams.get("pos");
  const pos = posRaw != null && posRaw !== "" ? Number(posRaw) : null;
  const entrantsRaw = searchParams.get("entrants");
  const entrants = entrantsRaw != null && entrantsRaw !== "" ? Number(entrantsRaw) : null;
  const payout = Number(searchParams.get("payout") ?? "0") || 0;
  const rankRaw = searchParams.get("rank");
  const rank = rankRaw != null && rankRaw !== "" ? Number(rankRaw) : null;
  const mode = searchParams.get("mode") === "mtt" ? "mtt" : "sng";

  const isWin = pos === 1;
  const useRatio = mode === "mtt" && pos != null && entrants != null && entrants > 0;
  const rankBig = pos == null ? "結果" : useRatio ? `${pos} / ${entrants}` : ordinal(pos);

  // フォントサブセットに必要な全文字を集める(表示名 + 固定ラベル + 数字)。
  const glyphs = `${name}${rankBig}トーナメント結果獲得全国位無料ポーカーで対戦強くなる実力が数字に出る${payout}${rank ?? ""}0123456789 ,./+PokerART`;
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
          padding: "64px 72px",
        }}
      >
        {/* 上部ゴールドライン */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "1200px", height: "10px", background: GOLD, display: "flex" }} />

        {/* ヘッダー: 表示名 + アプリ名 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "8px", color: INK_MUTED }}>TOURNAMENT RESULT</span>
            {name ? (
              <span style={{ fontSize: "40px", fontWeight: 900, color: INK, marginTop: "8px" }}>{name}</span>
            ) : null}
          </div>
          {/* スペードのゴールドマーク */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <svg width="52" height="52" viewBox="0 0 24 24" fill={GOLD}>
              <path d="M12 2C9 6 4 8.5 4 13a4 4 0 0 0 6.5 3.1C10 18 9 19.5 8 20.5h8c-1-1-2-2.5-2.5-4.4A4 4 0 0 0 20 13c0-4.5-5-7-8-11Z" />
            </svg>
          </div>
        </div>

        {/* 中央: 着順の超特大表示 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1 }}>
          {isWin ? (
            <span style={{ fontSize: "30px", fontWeight: 900, letterSpacing: "6px", color: GOLD, marginBottom: "8px" }}>CHAMPION</span>
          ) : null}
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{ fontSize: useRatio ? "150px" : "220px", fontWeight: 900, color: INK, lineHeight: 1 }}>{rankBig}</span>
            {!useRatio && pos != null ? <span style={{ fontSize: "120px", fontWeight: 900, color: GOLD, lineHeight: 1 }}>.</span> : null}
          </div>
          {payout > 0 ? (
            <div
              style={{
                display: "flex",
                marginTop: "28px",
                padding: "12px 34px",
                borderRadius: "999px",
                background: "rgba(212,145,10,0.14)",
                color: GOLD_DEEP,
                fontSize: "40px",
                fontWeight: 900,
              }}
            >
              獲得 +{payout.toLocaleString()}
            </div>
          ) : null}
        </div>

        {/* フッター: 全国順位 + アプリ名/URL */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {rank != null ? (
              <div style={{ display: "flex", alignItems: "baseline" }}>
                <span style={{ fontSize: "24px", fontWeight: 700, color: INK_MUTED, marginRight: "10px" }}>全国</span>
                <span style={{ fontSize: "44px", fontWeight: 900, color: INK }}>{rank.toLocaleString()}</span>
                <span style={{ fontSize: "24px", fontWeight: 700, color: INK_MUTED, marginLeft: "6px" }}>位</span>
              </div>
            ) : (
              <span style={{ fontSize: "26px", fontWeight: 700, color: INK_MUTED }}>強くなれる無料ポーカー</span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: "34px", fontWeight: 900, color: INK }}>Poker ART</span>
            <span style={{ fontSize: "22px", fontWeight: 700, color: GOLD_DEEP }}>meta-geo-poker.vercel.app</span>
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
