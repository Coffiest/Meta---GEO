/**
 * アクセス元の国(ISO 3166-1 alpha-2)を返す。表示言語の自動判定で、中国語の書体の決め分けと、
 * 端末の言語が対応外のときの補いにだけ使う(src/lib/localeDetect.ts)。
 * Vercel がリクエストに付ける `x-vercel-ip-country` をそのまま返すだけで、保存はしない。
 */
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const raw = request.headers.get("x-vercel-ip-country");
  const country = raw && /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : null;
  return Response.json({ country }, { headers: { "cache-control": "private, no-store" } });
}
