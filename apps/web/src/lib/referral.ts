"use client";

/**
 * 友達招待(リファラル)のクライアント側ヘルパー。
 * 招待リンク(`/?ref=CODE`)で来訪した人はまだログインしていないことが多いため、
 * コードを一旦localStorageへ退避し、ログイン+オンボーディング完了後に自動で適用する。
 */

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";
const PENDING_KEY = "pendingReferralCode";

export type ReferralTierKey = "scout" | "recruiter" | "ambassador" | "legend";

export interface ReferralInvitee {
  displayName: string;
  avatarKey: string | null;
  createdAt: string;
}

export interface ReferralReward {
  /** 1招待あたりの付与月数。 */
  monthsPerInvite: number;
  /** 累計で獲得した無料月数。 */
  monthsGranted: number;
  /** いま特典で棋譜解析が使えるか。 */
  active: boolean;
  /** 無料アクセスの期限(ISO文字列。未獲得ならnull)。 */
  expiresAt: string | null;
}

export interface ReferralSummary {
  code: string;
  invitedCount: number;
  invitees: ReferralInvitee[];
  tier: ReferralTierKey | null;
  nextTier: { key: ReferralTierKey; minInvites: number } | null;
  invitedByDisplayName: string | null;
  reward: ReferralReward;
}

export type RedeemReferralResult =
  | { ok: true; inviterDisplayName: string; rewardMonths: number }
  | { ok: false; reason: "invalid" | "self" | "already" };

/** 入力/URL由来の招待コードを正規化する(サーバー側 normalizeReferralCode と同じ規則)。 */
export function normalizeReferralCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

/** 招待リンク。共有先で崩れないよう、常に本番URL基準ではなく現在のオリジンで組み立てる。 */
export function buildInviteUrl(code: string): string {
  const origin = typeof window === "undefined" ? "https://meta-geo-poker.vercel.app" : window.location.origin;
  return `${origin}/?ref=${encodeURIComponent(code)}`;
}

/**
 * URLの `?ref=CODE` を取り込んでlocalStorageへ保存し、アドレスバーからクエリを消す。
 * ログイン前でも呼べる(ログイン後に takePendingReferralCode で適用する)。
 */
export function capturePendingReferralCode(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("ref");
  if (!raw) return;
  const code = normalizeReferralCode(raw);
  if (code) {
    try {
      window.localStorage.setItem(PENDING_KEY, code);
    } catch {
      // プライベートブラウジング等でlocalStorageが使えない場合は、手入力での適用にフォールバックする。
    }
  }
  params.delete("ref");
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

/** 保留中の招待コードを取り出して消す(適用は1回きり)。 */
export function takePendingReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const code = window.localStorage.getItem(PENDING_KEY);
    if (code) window.localStorage.removeItem(PENDING_KEY);
    return code;
  } catch {
    return null;
  }
}

export async function fetchReferralSummary(accessToken: string): Promise<ReferralSummary | null> {
  const res = await fetch(`${SERVER_URL}/api/lobby/referral`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as ReferralSummary;
}

export async function redeemReferral(accessToken: string, code: string): Promise<RedeemReferralResult | null> {
  const res = await fetch(`${SERVER_URL}/api/lobby/referral/redeem`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ code: normalizeReferralCode(code) }),
  });
  if (!res.ok) return null;
  return (await res.json()) as RedeemReferralResult;
}
