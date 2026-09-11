import type { IncomingMessage } from "node:http";

/**
 * HTTPリクエストボディの共通ユーティリティ。
 *
 * 以前は各APIの readJsonBody に**サイズ上限が無く**、無認証エンドポイント(Stripe Webhook、
 * error-report を除く全て)へ巨大なボディを送りつけてメモリを枯渇させられた。ここに集約し、
 * 上限超過は読み切らずに打ち切る。
 */

/** 既定のボディ上限(64KB)。JSONのAPIリクエストとしては十分大きい。 */
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

export class BodyTooLargeError extends Error {
  constructor() {
    super("request body too large");
    this.name = "BodyTooLargeError";
  }
}

/** サイズ上限つきで生ボディを読む。上限超過で BodyTooLargeError を投げる。 */
export async function readRawBody(req: IncomingMessage, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) throw new BodyTooLargeError();
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/**
 * サイズ上限つきでJSONボディを読む。上限超過・パース失敗はいずれも {} を返す
 * (既存呼び出し側は「不正なら必須項目エラー」で弾く前提なので、throwより穏当)。
 */
export async function readJsonBodyLimited(req: IncomingMessage, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  try {
    const raw = await readRawBody(req, maxBytes);
    if (raw.length === 0) return {};
    return JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * クエリの数値パラメータを安全な範囲へ丸める。
 *
 * 以前は `Number(url.searchParams.get("limit") ?? 20)` を素通ししていたため、
 * `?limit=abc`(NaN)、`?limit=-1`、`?limit=999999999`(同期モンテカルロがイベントループを
 * 完全ブロック)がそのまま Prisma の take へ渡っていた。
 */
export function clampLimit(raw: string | null, fallback: number, min = 1, max = 1000): number {
  // 未指定(null)・空文字は fallback にする。Number(null)/Number("") はどちらも 0(有限)になり、
  // そのまま通すと「パラメータ省略時に min へ丸められる」誤りになるため、先に弾く。
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}
