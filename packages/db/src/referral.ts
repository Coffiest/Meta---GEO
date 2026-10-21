import { randomInt } from "node:crypto";
import { prisma } from "./client.js";
import { issueCouponForReferral } from "./premiumCoupons.js";

/**
 * 友達招待(リファラル)。招待コードを配って友達が始めると招待が成立し、その友達が実際に
 * トーナメントを遊んだら、招待した人に「棋譜解析プラン1週間無料クーポン」が1枚発行される。
 * クーポンはいつでも一覧で確認・コピーでき、棋譜解析の画面で適用したときに無料期間が始まる。
 *
 * チップは一切動かさない —— チップを配ると自己招待による増殖と射幸性の問題が
 * 出るため、特典は有料機能の無料アクセス期間に限定している。
 *
 * 複数アカウントの自作自演の対策(オーナー指示):
 *  1. 成立しただけでは発行しない。招待された人が REFERRAL_QUALIFY_TOURNAMENTS 回、自分で操作して
 *     トーナメントを最後まで遊んだら発行する(放置して時間切れで飛ぶだけの参加は数えない)。
 *  2. 発行は 30 日あたり REFERRAL_MONTHLY_CAP 枚まで。超えた分は消えずに待ち、枠が空いたら発行する。
 *  3. 同じネットワーク(IP の鍵付きハッシュ)からの招待は特典の対象外。招待した人が招待カードを
 *     開いたときの接続元・同じ人が先に招待した人の接続元と一致したら弾く。
 * 1枚あたり1週間・30日で最大2枚なので、自作自演をやり切っても無料になるのは月の半分まで。
 */

/** コードに使う文字。読み間違えやすい I/O/0/1 を除外している(口頭・手入力で伝わるように)。 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/** 招待1件につき発行するクーポン1枚あたりの棋譜解析プラン無料日数(オーナー指示で1ヶ月 → 1週間)。 */
export const REFERRAL_REWARD_DAYS = 7;
/** 特典を発行するのに、招待された人が遊び終える必要のあるトーナメントの数。 */
export const REFERRAL_QUALIFY_TOURNAMENTS = 3;
/** 「自分で遊んだ」とみなすのに必要な、1トーナメントあたりの自分の操作の数(時間切れ・ブラインドは数えない)。 */
export const REFERRAL_MIN_ACTIONS_PER_TOURNAMENT = 5;
/** 30日あたりに発行できる招待のクーポンの上限。 */
export const REFERRAL_MONTHLY_CAP = 2;
const CAP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type ReferralStatus = "pending" | "rewarded" | "ineligible";

/** 入力された招待コードを正規化する(大文字化+英数字以外を除去)。URLからの取り込みにも使う。 */
export function normalizeReferralCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
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
  /** 特典の状態。 */
  status: ReferralStatus;
  /** 遊び終えたトーナメントの数(pending のときの進み具合。最大 REFERRAL_QUALIFY_TOURNAMENTS)。 */
  progress: number;
}

export interface ReferralSummary {
  /** 自分の招待コード(この呼び出しで未発行なら発行される)。 */
  code: string;
  /** 招待が成立した人数。 */
  invitedCount: number;
  /** 直近の招待成立者(最大10件)。 */
  invitees: ReferralInvitee[];
  /** 自分を招待してくれた人の表示名。誰の招待でもなければnull。 */
  invitedByDisplayName: string | null;
  /** 招待特典(棋譜解析プラン無料クーポン)の状況。 */
  reward: {
    /** 1招待あたりに発行されるクーポンの無料日数。 */
    daysPerInvite: number;
    /** 特典の発行に必要な、招待された人のトーナメント数。 */
    qualifyTournaments: number;
    /** 30日あたりの発行の上限。 */
    monthlyCap: number;
    /** 発行された累計枚数。 */
    couponsEarned: number;
    /** まだ使っていない枚数。 */
    couponsAvailable: number;
  };
}

/**
 * 自分で操作して遊び終えたトーナメントの数(上限 cap で打ち切る)。
 * 終わったエントリーのうち、そのトーナメントで自分の操作(時間切れ・ブラインド/アンティを除く)が
 * REFERRAL_MIN_ACTIONS_PER_TOURNAMENT 回以上あったもの。
 */
export async function countQualifiedTournaments(userId: string, cap = REFERRAL_QUALIFY_TOURNAMENTS): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT te."tournamentId"
      FROM "TournamentEntry" te
      JOIN "Tournament" tt ON tt."id" = te."tournamentId"
      -- フレンド対戦は招待の成立に数えない(rankedGame.ts)。
      WHERE te."userId" = ${userId} AND te."finishPosition" IS NOT NULL AND tt."gameType" <> 'private'
        AND (
          SELECT COUNT(*) FROM "HandAction" ha
          JOIN "Hand" h ON h."id" = ha."handId"
          JOIN "HandSeat" hs ON hs."handId" = ha."handId" AND hs."seatIndex" = ha."seatIndex"
          WHERE h."tournamentId" = te."tournamentId" AND hs."userId" = ${userId}
            AND ha."timedOut" = false AND ha."kind" NOT IN ('postBlind', 'postAnte')
        ) >= ${REFERRAL_MIN_ACTIONS_PER_TOURNAMENT}
      LIMIT ${cap}
    ) q`;
  return Number(rows[0]?.n ?? 0);
}

/**
 * 招待した人の「待ち」の招待を確かめ、条件を満たしたものにクーポンを発行する(冪等)。
 * 30日の上限に達していれば待ちのまま残す(枠が空いたら次に呼ばれたときに発行する)。
 * 発行した枚数を返す。
 */
export async function settlePendingReferrals(inviterUserId: string): Promise<number> {
  const pending = await prisma.referral.findMany({
    where: { inviterUserId, status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true, inviteeUserId: true },
  });
  if (pending.length === 0) return 0;

  let granted = 0;
  for (const r of pending) {
    const recent = await prisma.referral.count({
      where: { inviterUserId, status: "rewarded", rewardedAt: { gte: new Date(Date.now() - CAP_WINDOW_MS) } },
    });
    if (recent >= REFERRAL_MONTHLY_CAP) break;
    if ((await countQualifiedTournaments(r.inviteeUserId)) < REFERRAL_QUALIFY_TOURNAMENTS) continue;
    // 先に状態を取る(同時に2回呼ばれても1回だけ通る)。クーポン自体も referralId で冪等。
    const claimed = await prisma.referral.updateMany({
      where: { id: r.id, status: "pending" },
      data: { status: "rewarded", rewardedAt: new Date() },
    });
    if (claimed.count === 0) continue;
    const code = await grantReferralReward(r.id, inviterUserId);
    if (code) granted++;
    else {
      // 発行に失敗したら待ちに戻す(次に呼ばれたときにやり直す)。
      await prisma.referral
        .updateMany({ where: { id: r.id }, data: { status: "pending", rewardedAt: null } })
        .catch(() => undefined);
    }
  }
  return granted;
}

/**
 * ホームの招待カード用のサマリ。開いた時点で待ちの招待を確かめて発行する。
 * ipHash を渡すと、招待した人の接続元として覚える(同じネットワークからの自己招待を弾くため)。
 */
export async function getReferralSummary(userId: string, opts: { ipHash?: string | null } = {}): Promise<ReferralSummary> {
  if (opts.ipHash) {
    await prisma.user.update({ where: { id: userId }, data: { referralIpHash: opts.ipHash } }).catch(() => undefined);
  }
  await settlePendingReferrals(userId).catch((err) => console.error("[referral] settle failed:", err));

  const [code, invitedCount, inviteeRows, received, couponsEarned, couponsAvailable] = await Promise.all([
    getOrCreateReferralCode(userId),
    prisma.referral.count({ where: { inviterUserId: userId } }),
    prisma.referral.findMany({
      where: { inviterUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        createdAt: true,
        status: true,
        inviteeUserId: true,
        invitee: { select: { displayName: true, avatarKey: true } },
      },
    }),
    prisma.referral.findUnique({
      where: { inviteeUserId: userId },
      select: { inviter: { select: { displayName: true } } },
    }),
    prisma.premiumCouponCode.count({ where: { ownerUserId: userId } }),
    prisma.premiumCouponCode.count({ where: { ownerUserId: userId, redeemedAt: null } }),
  ]);

  const invitees = await Promise.all(
    inviteeRows.map(async (r) => {
      const status = (r.status as ReferralStatus) ?? "pending";
      return {
        displayName: r.invitee.displayName,
        avatarKey: r.invitee.avatarKey,
        createdAt: r.createdAt,
        status,
        progress:
          status === "rewarded"
            ? REFERRAL_QUALIFY_TOURNAMENTS
            : status === "pending"
              ? await countQualifiedTournaments(r.inviteeUserId)
              : 0,
      };
    })
  );

  return {
    code,
    invitedCount,
    invitees,
    invitedByDisplayName: received?.inviter.displayName ?? null,
    reward: {
      daysPerInvite: REFERRAL_REWARD_DAYS,
      qualifyTournaments: REFERRAL_QUALIFY_TOURNAMENTS,
      monthlyCap: REFERRAL_MONTHLY_CAP,
      couponsEarned,
      couponsAvailable,
    },
  };
}

export type RedeemReferralResult =
  | {
      ok: true;
      inviterDisplayName: string;
      /** 招待した人の特典の状態(pending=友達が遊んだら発行 / ineligible=対象外)。 */
      status: ReferralStatus;
    }
  /** invalid=そんなコードは無い / self=自分のコード / already=適用済み */
  | { ok: false; reason: "invalid" | "self" | "already" };

/**
 * 招待コードを適用する。適用できるのは1ユーザーにつき生涯1回だけ。
 * 自分自身のコード・自動の席のコード・存在しないコードは弾く。
 * 特典はここでは発行しない(招待された人が遊んだら settlePendingReferrals が発行する)。
 * 接続元が招待した人と同じネットワークなら、招待は成立させるが特典の対象外にする。
 */
export async function redeemReferralCode(
  userId: string,
  rawCode: string,
  opts: { ipHash?: string | null } = {}
): Promise<RedeemReferralResult> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { ok: false, reason: "invalid" };

  const existing = await prisma.referral.findUnique({ where: { inviteeUserId: userId } });
  if (existing) return { ok: false, reason: "already" };

  const inviter = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true, displayName: true, isBot: true, referralIpHash: true },
  });
  if (!inviter || inviter.isBot) return { ok: false, reason: "invalid" };
  if (inviter.id === userId) return { ok: false, reason: "self" };

  const ipHash = opts.ipHash ?? null;
  let sameNetwork = false;
  if (ipHash) {
    if (inviter.referralIpHash === ipHash) sameNetwork = true;
    else {
      const twin = await prisma.referral.count({ where: { inviterUserId: inviter.id, ipHash } });
      sameNetwork = twin > 0;
    }
  }
  const status: ReferralStatus = sameNetwork ? "ineligible" : "pending";

  try {
    await prisma.referral.create({
      data: { inviterUserId: inviter.id, inviteeUserId: userId, code, status, ipHash },
    });
  } catch {
    // 同時に2回適用した場合の一意制約違反。先勝ちで「適用済み」として扱う。
    return { ok: false, reason: "already" };
  }

  return { ok: true, inviterDisplayName: inviter.displayName, status };
}

/**
 * 招待1件に対する特典クーポンを発行する(冪等 —— PremiumCouponCode.referralId の一意制約が
 * 二重発行を防ぐ)。発行したコードを返す。
 * 発行に失敗しても招待の成立自体は取り消さない(クーポンは後から手当てできるが、成立を
 * 巻き戻すと招待された側が二度と誰の招待も受けられなくなるため)。
 */
export async function grantReferralReward(referralId: string, inviterUserId: string): Promise<string | null> {
  try {
    return await issueCouponForReferral(referralId, inviterUserId, 0, REFERRAL_REWARD_DAYS);
  } catch (err) {
    console.error("[referral] failed to issue reward coupon:", err);
    return null;
  }
}
