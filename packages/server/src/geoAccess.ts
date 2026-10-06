import type { IncomingMessage, ServerResponse } from "node:http";
import { getGeoAccess, GEO_ITM_REQUIRED, prisma } from "@meta-geo/db";
import { authAvailable, verifyAccessToken } from "./auth.js";

/**
 * GEO データベース(データベースタブ: GEO の木・データ研究)の利用条件の確認。
 * インマネ GEO_ITM_REQUIRED 回以上の人だけが使える(オーナー確定。有料プランでも同じ)。
 * 画面の錠は案内であって守りではないので、サーバーでも必ず確かめる。
 *
 * - トークンが無い・無効 → 401
 * - 条件を満たしていない → 403 { code: "GEO_LOCKED", itmCount, required }
 * - 認証そのものが設定されていない開発環境では通す(ローカルで GEO を確認できるように)
 *
 * 解放済みのユーザーだけを短くキャッシュする(回数は減らないので、解放は取り消されない)。
 */
const UNLOCKED_TTL_MS = 60_000;
const unlockedUntil = new Map<string, number>();

function bearer(req: IncomingMessage): string | undefined {
  const header = req.headers["authorization"];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.startsWith("Bearer ") ? value.slice("Bearer ".length) : undefined;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

/** 使ってよければ true。だめなら応答を返して false。 */
export async function requireGeoAccess(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!authAvailable()) return true;
  const verified = await verifyAccessToken(bearer(req));
  if (!verified) {
    send(res, 401, { error: "unauthorized" });
    return false;
  }
  const until = unlockedUntil.get(verified.authId);
  if (until !== undefined && until > Date.now()) return true;
  const user = await prisma.user.findUnique({ where: { authId: verified.authId }, select: { id: true } });
  const access = user ? await getGeoAccess(user.id) : { itmCount: 0, required: GEO_ITM_REQUIRED, unlocked: false };
  if (access.unlocked) {
    unlockedUntil.set(verified.authId, Date.now() + UNLOCKED_TTL_MS);
    return true;
  }
  send(res, 403, { error: "geo locked", code: "GEO_LOCKED", itmCount: access.itmCount, required: access.required });
  return false;
}
