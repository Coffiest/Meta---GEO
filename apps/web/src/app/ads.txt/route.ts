import { ADSENSE_PUBLISHER_ID } from "@/lib/adsense";

/**
 * /ads.txt を配信する。AdSense の「認定販売者」宣言ファイル。
 *
 *   google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
 *
 * パブリッシャーIDは広告スクリプトと同じものでなければならないので、lib/adsense.ts の
 * 値を共有する(環境変数が未設定の環境でも本番の値にフォールバックする)。
 */
export function GET() {
  const body = `google.com, ${ADSENSE_PUBLISHER_ID}, DIRECT, f08c47fec0942fa0\n`;
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
