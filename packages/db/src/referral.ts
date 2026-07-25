import { randomInt } from "node:crypto";
import { prisma } from "./client.js";

/**
 * 友達招待(リファラル)。招待コードを配って友達が始めると招待が成立し、招待数に応じて
 * 称号(非金銭報酬)が上がる。バーチャルチップは一切動かさない —— チップを配ると
 * 自己招待による増殖と射幸性の問題が出るため、報酬は称号だけに限定している。
 */

/** コードに使う文字。読み間違えやすい I/O/0/1 を除外している(口頭・手入力で伝わるように)。 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/** 招待人数に応じた称号(しきい値の昇順)。ラベルはWeb側のi18n(`invite.tier.*`)で解決する。 */
export const REFERRAL_TIERS = [
  { key: "scout", minInvites: 1 },
  { key: "recruiter", minInvites: 3 },
  { key: "ambassador", minInvites: 5 },
  { key: "legend", minInvites: 10 },
] as const;

export type ReferralTierKey = (typeof REFERRAL_TIERS)[number]["key"];

/** 入力された招待コードを正規化する(大文字化+英数字以外を除去)。URLからの取り込みにも使う。 */
export function normalizeReferralCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

/** 招待成立数に対応する現在の称号。1人未満はnull(称号なし)。 */
export function referralTierFor(invitedCount: number): ReferralTierKey | null {
  let current: ReferralTierKey | null = null;
  for (const tier of REFERRAL_TIERS) {
    if (invitedCount >= tier.minInvites) current = tier.key;
  }
  return current;
}

/** 次に到達する称号としきい値。最高称号に達していればnull。 */
export function nextReferralTier(invitedCount: number): { key: ReferralTierKey; minInvites: number } | null {
  for (const tier of REFERRAL_TIERS) {
    if (invitedCount < tier.minInvites) return { key: tier.key, minInvites: tier.minInvites };
  }
  return null;
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/**
 * ユーザーの招待コードを取得する(未発行なら発行して保存)。
 * 一意制約に当たった場合は別のコードで数回まで再試行する。
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (user?.referralCode) return user.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const updated = await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
      return updated.referralCode ?? code;
    } catch {
      // 衝突(P2002)または競合更新。最新値を読み直し、既に発行済みならそれを返す。
      const latest = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
      if (latest?.referralCode) return latest.referralCode;
    }
  }
  throw new Error("failed to issue referral code");
}

export interface ReferralInvitee {
  displayName: string;
  avatarKey: string | null;
  createdAt: Date;
}

export interface ReferralSummary {
  /** 自分の招待コード(この呼び出しで未発行なら発行される)。 */
  code: string;
  /** 招待が成立した人数。 */
  invitedCount: number;
  /** 直近の招待成立者(最大10件)。 */
  invitees: ReferralInvitee[];
  /** 現在の称号。1人も招待していなければnull。 */
  tier: ReferralTierKey | null;
  /** 次の称号としきい値。最高称号ならnull。 */
  nextTier: { key: ReferralTierKey; minInvites: number } | null;
  /** 自分を招待してくれた人の表示名。誰の招待でもなければnull。 */
  invitedByDisplayName: string | null;
}

/** ホームの招待カード用のサマリ。 */
export async function getReferralSummary(userId: string): Promise<ReferralSummary> {
  const [code, invitedCount, inviteeRows, received] = await Promise.all([
    getOrCreateReferralCode(userId),
    prisma.referral.count({ where: { inviterUserId: userId } }),
    prisma.referral.findMany({
      where: { inviterUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { createdAt: true, invitee: { select: { displayName: true, avatarKey: true } } },
    }),
    prisma.referral.findUnique({
      where: { inviteeUserId: userId },
      select: { inviter: { select: { displayName: true } } },
    }),
  ]);

  return {
    code,
    invitedCount,
    invitees: inviteeRows.map((r) => ({
      displayName: r.invitee.displayName,
      avatarKey: r.invitee.avatarKey,
      createdAt: r.createdAt,
    })),
    tier: referralTierFor(invitedCount),
    nextTier: nextReferralTier(invitedCount),
    invitedByDisplayName: received?.inviter.displayName ?? null,
  };
}

export type RedeemReferralResult =
  | { ok: true; inviterDisplayName: string }
  /** invalid=そんなコードは無い / self=自分のコード / already=適用済み */
  | { ok: false; reason: "invalid" | "self" | "already" };

/**
 * 招待コードを適用する。適用できるのは1ユーザーにつき生涯1回だけ。
 * 自分自身のコード・BOTのコード・存在しないコードは弾く。
 */
export async function redeemReferralCode(userId: string, rawCode: string): Promise<RedeemReferralResult> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { ok: false, reason: "invalid" };

  const existing = await prisma.referral.findUnique({ where: { inviteeUserId: userId } });
  if (existing) return { ok: false, reason: "already" };

  const inviter = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true, displayName: true, isBot: true },
  });
  if (!inviter || inviter.isBot) return { ok: false, reason: "invalid" };
  if (inviter.id === userId) return { ok: false, reason: "self" };

  try {
    await prisma.referral.create({ data: { inviterUserId: inviter.id, inviteeUserId: userId, code } });
  } catch {
    // 同時に2回適用した場合の一意制約違反。先勝ちで「適用済み」として扱う。
    return { ok: false, reason: "already" };
  }
  return { ok: true, inviterDisplayName: inviter.displayName };
}
