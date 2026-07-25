import { ImageResponse } from "next/og";

export const runtime = "edge";

/**
 * 「このハンド」単体のX共有カード(OGP画像)を動的生成する。
 * 白 + ゴールドのミニマルデザイン。自分のホールカードとボードを実カードの絵で描き、
 * 収支(bb)を主役に据える。スートは絵文字ではなくSVGパスで描画する。
 *
 * 例: /api/og/hand?name=たこやき&h=As,Kd&b=Ah,7c,2d,Kh&bb=42.5
 *     /api/og/hand?h=Qs,Qh&bb=-30.2&fold=1
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
const CRIMSON = "#c23a2f";
const BG = "#ffffff";

/** 4色デッキ(スペード=黒, ハート=赤, ダイヤ=青, クラブ=緑)。アプリ内のカード配色に合わせる。 */
const SUIT_COLOR: Record<string, string> = { s: INK, h: "#dd4438", d: "#3a7fc4", c: "#1fae70" };

/** スートのSVGパス(viewBox 0 0 24 24)。装飾に絵文字は使わない。 */
const SUIT_PATH: Record<string, string> = {
  s: "M12 2C9 6 4 8.5 4 13a4 4 0 0 0 6.5 3.1C10 18 9 19.5 8 20.5h8c-1-1-2-2.5-2.5-4.4A4 4 0 0 0 20 13c0-4.5-5-7-8-11Z",
  h: "M12 21C12 21 3 14.6 3 8.9 3 5.7 5.4 3.2 8.5 3.2c1.7 0 3 .8 3.5 1.9.5-1.1 1.8-1.9 3.5-1.9 3.1 0 5.5 2.5 5.5 5.7 0 5.7-9 12.1-9 12.1Z",
  d: "M12 2 21 12 12 22 3 12Z",
  c: "M12 2.5a3.9 3.9 0 0 0-3.2 6.1A3.9 3.9 0 1 0 8 16.3c1 0 2-.4 2.7-1-.2 2-1 3.7-2.3 5.2h7.2c-1.3-1.5-2.1-3.2-2.3-5.2.7.6 1.7 1 2.7 1a3.9 3.9 0 1 0-.8-7.7A3.9 3.9 0 0 0 12 2.5Z",
};

/** ハンド表記("As" "10h" "Kd")をランクとスートに割る。 */
function splitCard(code: string): { rank: string; suit: string } {
  return { rank: code.slice(0, -1), suit: code.slice(-1) };
}

function SuitMark({ suit, size }: { suit: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={SUIT_COLOR[suit] ?? INK}>
      <path d={SUIT_PATH[suit] ?? SUIT_PATH.s} />
    </svg>
  );
}

/** カード1枚。幅を指定すると 1:1.4 の比率で描画する。 */
function Card({ code, w }: { code: string; w: number }) {
  const { rank, suit } = splitCard(code);
  const color = SUIT_COLOR[suit] ?? INK;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: `${w}px`,
        height: `${Math.round(w * 1.4)}px`,
        padding: `${Math.round(w * 0.09)}px`,
        borderRadius: `${Math.round(w * 0.1)}px`,
        background: "#ffffff",
        border: `2px solid ${INK}`,
        boxShadow: "0 10px 24px -14px rgba(0,0,0,0.5)",
      }}
    >
      <span style={{ fontSize: `${Math.round(w * 0.4)}px`, fontWeight: 900, color, lineHeight: 1 }}>{rank}</span>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <SuitMark suit={suit} size={Math.round(w * 0.44)} />
      </div>
    </div>
  );
}

/** ── ラベル ── 風のキッカー見出し。 */
function Kicker({ text }: { text: string }) {
  return <span style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "6px", color: INK_MUTED }}>{text}</span>;
}

/** カード表記のパース。"As,Kd" → ["As","Kd"]。不正な値は落とす。 */
function parseCards(raw: string | null, max: number): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter((c) => /^(?:[AKQJ]|10|[2-9])[shdc]$/.test(c))
    .slice(0, max);
}

export async function GET(req: Request): Promise<ImageResponse> {
  const { searchParams } = new URL(req.url);
  const name = (searchParams.get("name") ?? "").slice(0, 24);
  const hero = parseCards(searchParams.get("h"), 2);
  const board = parseCards(searchParams.get("b"), 5);
  const bbRaw = Number(searchParams.get("bb") ?? "0");
  const bb = Number.isFinite(bbRaw) ? Math.round(bbRaw * 10) / 10 : 0;
  const wonByFold = searchParams.get("fold") === "1";

  const win = bb > 0;
  const lose = bb < 0;
  const bbAbs = Number.isInteger(bb) ? String(Math.abs(bb)) : Math.abs(bb).toFixed(1);
  const bbText = bb === 0 ? "±0" : `${win ? "+" : "-"}${bbAbs}`;
  const accent = win ? GOLD_DEEP : lose ? CRIMSON : INK_MUTED;

  // フォントサブセットに必要な全文字を集める(表示名 + 固定ラベル + 数字 + ランク)。
  const glyphs = `${name}${bbText}このハンド全員フォールドで決着プリフロップ無料ポーカー強くなれる実力が数字に出る0123456789+-±.,/AKQJshdcbBOARDYUHNPokerART `;
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

        {/* ヘッダー: 表示名 + ゴールドのスペードマーク */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Kicker text="HAND OF THE GAME" />
            {name ? <span style={{ fontSize: "36px", fontWeight: 900, color: INK, marginTop: "6px" }}>{name}</span> : null}
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <SuitMark suit="s" size={48} />
          </div>
        </div>

        {/* 中央: 左=カード / 右=収支 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", flex: 1, marginTop: "32px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Kicker text="YOUR HAND" />
            <div style={{ display: "flex", gap: "14px", marginTop: "10px" }}>
              {hero.length > 0 ? hero.map((c) => <Card key={c} code={c} w={112} />) : <span style={{ fontSize: "28px", fontWeight: 700, color: INK_MUTED }}>-</span>}
            </div>

            <div style={{ display: "flex", marginTop: "24px" }}>
              <Kicker text="BOARD" />
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              {board.length > 0 ? (
                board.map((c) => <Card key={c} code={c} w={74} />)
              ) : (
                <span style={{ fontSize: "26px", fontWeight: 700, color: INK_MUTED, display: "flex", alignItems: "center", height: "104px" }}>
                  プリフロップ
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginLeft: "40px" }}>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ fontSize: "150px", fontWeight: 900, color: accent, lineHeight: 1 }}>{bbText}</span>
              <span style={{ fontSize: "56px", fontWeight: 900, color: accent, marginLeft: "8px" }}>bb</span>
            </div>
            {wonByFold ? (
              <div
                style={{
                  display: "flex",
                  marginTop: "18px",
                  padding: "10px 24px",
                  borderRadius: "999px",
                  background: "rgba(212,145,10,0.14)",
                  color: GOLD_DEEP,
                  fontSize: "24px",
                  fontWeight: 900,
                }}
              >
                全員フォールドで決着
              </div>
            ) : null}
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
