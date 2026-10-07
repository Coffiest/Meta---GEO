import type { IncomingMessage, ServerResponse } from "node:http";
import { getGeoAccess, geoAccessOf, geoLevelAtLeast, prisma, type GeoAccess, type GeoAccessLevel } from "@meta-geo/db";
import { authAvailable, verifyAccessToken, type VerifiedUser } from "./auth.js";
import { isAdminIdentity } from "./adminAuth.js";

/**
 * GEO データベース(データベースタブ: GEO の木・データ研究)の利用条件の確認。
 * プランの上限(無料・シルバー=使えない / ゴールド=インマネ10回でプリフロップ・20回でポストフロップ / プラチナ=全部)と
 * 管理者の個別設定で決まる。データ研究はプラチナ(と管理者が「全部」に緩めた人)だけ(オーナー確定)。
 * 画面の錠は案内であって守りではないので、サーバーでも必ず確かめる。
 *
 * - トークンが無い・無効 → 401
 * - まだ使えない → 403 { code: "GEO_LOCKED", itmCount, required }
 * - プリフロップまでの人がポストフロップ以降を開いた → 403 { code: "GEO_POSTFLOP_LOCKED", itmCount, required }
 * - プランが足りない → 403 { code: "GEO_PLAN_REQUIRED", plan: 必要なプラン, itmCount }
 * - 認証そのものが設定されていない開発環境では通す(ローカルで GEO を確認できるように)
 *
 * 解放の段階を短くキャッシュする。管理者がプレイヤーごとに緩めた段階(User.geoAccessOverride)も含む。
 * 個別設定を変えたら clearGeoAccessCache() で捨てる。
 */
const LEVEL_TTL_MS = 60_000;
const levelCache = new Map<string, { access: GeoAccess; until: number }>();

/** "research" = データ研究(プラチナだけ)。 */
export type GeoNeed = Exclude<GeoAccessLevel, "none"> | "research";

function allows(access: GeoAccess, need: GeoNeed): boolean {
  return need === "research" ? access.researchUnlocked : geoLevelAtLeast(access.level, need);
}

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

/** 管理者が個別設定を変えたときに呼ぶ(次の要求から新しい段階で判定する。取り上げる方向の変更もすぐ効かせる)。 */
export function clearGeoAccessCache(): void {
  levelCache.clear();
}

/** ログイン中の人の GEO の利用条件(管理者のアカウントは全部使える)。 */
export async function geoAccessForVerified(verified: VerifiedUser): Promise<GeoAccess> {
  const user = await prisma.user.findUnique({ where: { authId: verified.authId }, select: { id: true, email: true } });
  const access = user ? await getGeoAccess(user.id) : geoAccessOf(0, "none");
  // 管理者のアカウントは利用条件に関係なく使える(運営のため。管理者画面への入口も GEO タブにある)。
  if (isAdminIdentity(verified.email ?? user?.email ?? null, user?.id ?? null)) return geoAccessOf(access.itmCount, "full", access.plan, true);
  return access;
}

/** need の段階まで使ってよければ true。だめなら応答を返して false。 */
export async function requireGeoAccess(
  req: IncomingMessage,
  res: ServerResponse,
  need: GeoNeed = "preflop"
): Promise<boolean> {
  if (!authAvailable()) return true;
  const verified = await verifyAccessToken(bearer(req));
  if (!verified) {
    send(res, 401, { error: "unauthorized" });
    return false;
  }
  const cached = levelCache.get(verified.authId);
  if (cached && cached.until > Date.now() && allows(cached.access, need)) return true;
  const access = await geoAccessForVerified(verified);
  levelCache.set(verified.authId, { access, until: Date.now() + LEVEL_TTL_MS });
  if (allows(access, need)) return true;
  // ゴールド未満(無料・シルバー)なのに使えない → プランの案内。データ研究はプラチナの案内。
  const planShort = need === "research" ? "platinum" : access.plan !== "gold" && access.plan !== "platinum" ? "gold" : null;
  if (planShort) {
    send(res, 403, { error: "geo plan required", code: "GEO_PLAN_REQUIRED", plan: planShort, itmCount: access.itmCount });
  } else if (access.level === "none") {
    send(res, 403, { error: "geo locked", code: "GEO_LOCKED", itmCount: access.itmCount, required: access.required });
  } else {
    send(res, 403, {
      error: "geo postflop locked",
      code: "GEO_POSTFLOP_LOCKED",
      itmCount: access.itmCount,
      required: access.postflopRequired,
    });
  }
  return false;
}
