/**
 * /ads.txt を配信する。AdSense の「認定販売者」宣言ファイル。
 *
 *   google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
 *
 * パブリッシャーIDは NEXT_PUBLIC_ADSENSE_CLIENT_ID(例: "ca-pub-1994465186798216")の
 * "ca-" を除いた "pub-..." 部分を使う。環境変数が未設定の環境(ローカル等)でも本番の
 * 値にフォールバックし、常に正しい ads.txt を返す。
 */
const FALLBACK_PUB_ID = "pub-1994465186798216";

function resolvePubId(): string {
  const client = (process.env["NEXT_PUBLIC_ADSENSE_CLIENT_ID"] ?? "").trim();
  const fromEnv = client.replace(/^ca-/, ""); // "ca-pub-XXXX" -> "pub-XXXX"
  return fromEnv.startsWith("pub-") ? fromEnv : FALLBACK_PUB_ID;
}

export function GET() {
  const body = `google.com, ${resolvePubId()}, DIRECT, f08c47fec0942fa0\n`;
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
