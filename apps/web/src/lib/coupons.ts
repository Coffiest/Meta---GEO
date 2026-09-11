"use client";

/**
 * 「棋譜解析プラン1ヶ月無料」クーポンのクライアント側ヘルパー。
 * 招待が成立すると1枚発行され、獲得した人はいつでも一覧で確認・コピーできる。
 * 無料期間が始まるのは、棋譜解析の画面でコードを適用したとき。
 */

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

export interface CouponCode {
  /** 表示用に整形済みのコード("GEO-ABCD-2345")。 */
  code: string;
  months: number;
  /** 適用済みなら適用時刻(ISO)、未使用ならnull。 */
  redeemedAt: string | null;
  /** 自分が使ったのか、渡した相手が使ったのか。未使用ならnull。 */
  redeemedByMe: boolean | null;
  createdAt: string;
}

export interface CouponWallet {
  coupons: CouponCode[];
  availableCount: number;
  premium: { active: boolean; expiresAt: string | null; monthsGranted: number };
}

export type RedeemCouponResult =
  | { ok: true; months: number; expiresAt: string }
  | { ok: false; reason: "invalid" | "used" };

/** 入力/貼り付けされたコードを正規化する(サーバー側 normalizeCouponCode と同じ規則)。 */
export function normalizeCouponCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

export async function fetchCouponWallet(accessToken: string): Promise<CouponWallet | null> {
  const res = await fetch(`${SERVER_URL}/api/lobby/coupons`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as CouponWallet;
}

export async function redeemCoupon(accessToken: string, code: string): Promise<RedeemCouponResult | null> {
  const res = await fetch(`${SERVER_URL}/api/lobby/coupons/redeem`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ code: normalizeCouponCode(code) }),
  });
  if (!res.ok) return null;
  return (await res.json()) as RedeemCouponResult;
}

/** 期限を端末のロケールで「2026/8/30」のように表示する。 */
export function formatCouponDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString();
}
