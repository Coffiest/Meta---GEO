import { randomInt } from "node:crypto";
import { prisma } from "./client.js";
import { extendPremiumCoupon, getPremiumCouponStatus } from "./subscriptions.js";

/**
 * 「棋譜解析プラン1ヶ月無料」クーポンのコード管理。
 *
 * 招待が1件成立するごとに1枚発行され、獲得した人はいつでも一覧で確認・コピーできる。
 * 発行しただけでは無料期間は始まらない —— 棋譜解析の画面でコードを適用したときに初めて
 * PremiumCoupon の期限が伸びる(使うタイミングを本人が選べるようにするための設計)。
 *
 * コードは共有できる(コピーして誰かに渡せる)。1枚1回だけ使えるので、渡した先で使われれば
 * 自分では使えなくなる —— 紙のクーポンと同じ挙動にしている。
 */

/** コードに使う文字。読み間違えやすい I/O/0/1 は除外する(口頭・手入力で伝わるように)。 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** "GEO" に続くランダム部の長さ。表示は "GEO-XXXX-XXXX"。 */
const CODE_BODY_LENGTH = 8;
const CODE_PREFIX = "GEO";

/** 入力/貼り付けされたクーポンコードを正規化する(大文字化+英数字以外を除去)。 */
export function normalizeCouponCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

/** 保存形式("GEOABCD2345")を表示形式("GEO-ABCD-2345")に整える。 */
export function formatCouponCode(code: string): string {
  if (!code.startsWith(CODE_PREFIX)) return code;
  const body = code.slice(CODE_PREFIX.length);
  if (body.length !== CODE_BODY_LENGTH) return code;
  return `${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

function generateCouponCode(): string {
  let body = "";
  for (let i = 0; i < CODE_BODY_LENGTH; i++) body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${CODE_PREFIX}${body}`;
}

export interface CouponCode {
  /** 表示用に整形済みのコード("GEO-ABCD-2345")。 */
  code: string;
  /** 適用すると付与される無料月数。 */
  months: number;
  /** 適用済みなら適用時刻、未使用ならnull。 */
  redeemedAt: Date | null;
  /** 自分が使ったのか、渡した相手が使ったのか。未使用ならnull。 */
  redeemedByMe: boolean | null;
  createdAt: Date;
}

export interface CouponWallet {
  coupons: CouponCode[];
  /** 未使用の枚数。 */
  availableCount: number;
  /** クーポンで得ている棋譜解析の無料アクセス状態。 */
  premium: { active: boolean; expiresAt: Date | null; monthsGranted: number };
}

/** 自分が獲得したクーポン一覧(新しい順)と、いま有効な無料期間。 */
export async function getCouponWallet(userId: string): Promise<CouponWallet> {
  const [rows, premium] = await Promise.all([
    prisma.premiumCouponCode.findMany({
      where: { ownerUserId: userId },
      orderBy: [{ redeemedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      take: 100,
      select: { code: true, months: true, redeemedAt: true, redeemedByUserId: true, createdAt: true },
    }),
    getPremiumCouponStatus(userId),
  ]);

  return {
    coupons: rows.map((r) => ({
      code: formatCouponCode(r.code),
      months: r.months,
      redeemedAt: r.redeemedAt,
      redeemedByMe: r.redeemedAt ? r.redeemedByUserId === userId : null,
      createdAt: r.createdAt,
    })),
    availableCount: rows.filter((r) => r.redeemedAt == null).length,
    premium,
  };
}

/**
 * 招待1件に対するクーポンを発行する(冪等)。referralId の一意制約が二重発行を防ぐため、
 * 同時に2回呼ばれても1枚しか作られない。
 * 発行できたら(既に発行済みなら既存の)コードを返す。
 */
export async function issueCouponForReferral(
  referralId: string,
  ownerUserId: string,
  months: number
): Promise<string | null> {
  const existing = await prisma.premiumCouponCode.findUnique({
    where: { referralId },
    select: { code: true },
  });
  if (existing) return formatCouponCode(existing.code);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await prisma.premiumCouponCode.create({
        data: { code: generateCouponCode(), ownerUserId, months, source: "referral", referralId },
        select: { code: true },
      });
      return formatCouponCode(created.code);
    } catch {
      // code / referralId の一意制約違反。referralId 側なら別プロセスが発行済みなのでそれを返す。
      const raced = await prisma.premiumCouponCode.findUnique({
        where: { referralId },
        select: { code: true },
      });
      if (raced) return formatCouponCode(raced.code);
      // code の衝突なら別のコードで再試行する。
    }
  }
  console.error("[coupon] failed to issue coupon for referral", referralId);
  return null;
}

export type RedeemCouponResult =
  | {
      ok: true;
      /** 付与された無料月数。 */
      months: number;
      /** 適用後の無料アクセス期限。 */
      expiresAt: Date;
    }
  /** invalid=そんなコードは無い / used=既に使用済み */
  | { ok: false; reason: "invalid" | "used" };

/**
 * クーポンコードを適用して棋譜解析の無料期間を延長する。
 * 1枚1回だけ。updateMany で「未使用の行を取れたときにのみ」付与するため、同時に2回叩かれても
 * 二重に付与されない。
 */
export async function redeemCouponCode(userId: string, rawCode: string): Promise<RedeemCouponResult> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, reason: "invalid" };

  const coupon = await prisma.premiumCouponCode.findUnique({
    where: { code },
    select: { id: true, months: true, redeemedAt: true },
  });
  if (!coupon) return { ok: false, reason: "invalid" };
  if (coupon.redeemedAt) return { ok: false, reason: "used" };

  const claimed = await prisma.premiumCouponCode.updateMany({
    where: { id: coupon.id, redeemedAt: null },
    data: { redeemedAt: new Date(), redeemedByUserId: userId },
  });
  if (claimed.count === 0) return { ok: false, reason: "used" };

  try {
    const expiresAt = await extendPremiumCoupon(userId, coupon.months);
    return { ok: true, months: coupon.months, expiresAt };
  } catch (err) {
    // 期限の延長に失敗したらクーポンを未使用に戻す(使ったのに何も貰えない状態を作らない)。
    console.error("[coupon] failed to extend premium access, releasing coupon:", err);
    await prisma.premiumCouponCode
      .updateMany({ where: { id: coupon.id }, data: { redeemedAt: null, redeemedByUserId: null } })
      .catch(() => undefined);
    throw err;
  }
}
