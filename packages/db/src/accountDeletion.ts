import { prisma } from "./client.js";

/**
 * アカウントの完全削除(退会)。
 *
 * ■ 最重要の前提: GEO DATABASE のデータは絶対に消さない
 *
 * GEO DATABASE の実データはハンド履歴そのもの(Hand / HandSeat / HandAction / HandPot)で、
 * HandSeat.userId が User を参照している。したがって User 行を物理削除すると、
 *  - 外部キー制約(Restrict)で削除自体が失敗するか、
 *  - 制約を緩めた場合はハンド履歴ごと消えてGEOの集計結果が変わってしまう。
 * どちらも許容できない。
 *
 * そこで退会処理は「User 行は残したまま、本人性(認証情報・表示名・連絡先)だけを消す」
 * 匿名化として実装する。これにより:
 *  - 本人はもう二度とログインできない(authId を外し、Supabase Auth 側のユーザーも削除する)
 *  - 個人に紐づくデータ(端末プッシュ購読・メモ・解析結果・課金状態など)は物理削除される
 *  - ハンド履歴は1件も欠けないため、GEOの集計は退会前とまったく同じ結果になる
 *
 * ■ 消すもの / 残すもの
 * 消す : PushSubscription / PlayerNote(本人が書いたもの・本人について書かれたもの) /
 *        GeoViewUsage / ReviewUsage / HandReview + ReviewDecision / Subscription /
 *        PremiumCoupon / Referral(本人が関わる行)。ErrorReport は報告内容を残しつつ紐付けのみ解除。
 * 残す : Hand / HandSeat / HandAction / HandPot(= GEO DATABASE 本体) /
 *        Tournament / TournamentEntry / BankrollTransaction(対戦記録の整合性)。
 */

/** 退会後の表示名。卓の履歴などで参照されたときに出る。 */
export const DELETED_USER_DISPLAY_NAME = "削除されたユーザー";

export interface DeleteAccountResult {
  /** 実際に匿名化した User.id。 */
  userId: string;
  /** 退会前に持っていた Supabase Auth のユーザーid(呼び出し側でAuth側も消すために返す)。 */
  authId: string | null;
  /** 参考: 残したハンド参加記録の件数(GEOデータが保持されたことの確認用)。 */
  keptHandSeats: number;
  /** 冪等性: すでに退会済みだった場合は true(何も変更していない)。 */
  alreadyDeleted: boolean;
}

/**
 * 指定ユーザーを退会させる。個人データを物理削除し、User 行は匿名化して残す。
 * 二重実行しても安全(すでに退会済みなら何もしない)。
 */
export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, authId: true, deletedAt: true, isBot: true },
  });
  if (!user) throw new Error("user not found");
  // 自動プレイヤーは退会の対象外(誤って卓の構成を壊さないための保険)。
  if (user.isBot) throw new Error("cannot delete a bot account");

  const keptHandSeats = await prisma.handSeat.count({ where: { userId } });

  if (user.deletedAt) {
    return { userId, authId: user.authId, keptHandSeats, alreadyDeleted: true };
  }

  await prisma.$transaction(async (tx) => {
    // --- 個人に紐づくデータの物理削除 ---
    // 端末のプッシュ購読(退会後に通知が飛ばないよう必ず消す)。
    await tx.pushSubscription.deleteMany({ where: { userId } });
    // プレイヤーメモ: 本人が書いたものと、本人について書かれたものの両方。
    await tx.playerNote.deleteMany({ where: { OR: [{ authorUserId: userId }, { targetUserId: userId }] } });
    // 閲覧・解析の無料枠カウンタ。
    await tx.geoViewUsage.deleteMany({ where: { userId } });
    await tx.reviewUsage.deleteMany({ where: { userId } });
    // 棋譜解析の結果(本人の意思決定の分析=個人データ)。子から先に消す。
    const reviews = await tx.handReview.findMany({ where: { heroUserId: userId }, select: { id: true } });
    if (reviews.length > 0) {
      const reviewIds = reviews.map((r) => r.id);
      await tx.reviewDecision.deleteMany({ where: { reviewId: { in: reviewIds } } });
      await tx.handReview.deleteMany({ where: { id: { in: reviewIds } } });
    }
    // 課金・特典の状態。
    await tx.subscription.deleteMany({ where: { userId } });
    await tx.premiumCoupon.deleteMany({ where: { userId } });
    // 招待関係(送った側・受けた側の両方)。
    await tx.referral.deleteMany({ where: { OR: [{ inviterUserId: userId }, { inviteeUserId: userId }] } });
    // エラー報告は不具合調査のため内容を残し、本人との紐付けだけ外す。
    await tx.errorReport.updateMany({ where: { userId }, data: { userId: null } });

    // --- User 行の匿名化(削除はしない: GEOデータの参照元を壊さないため) ---
    await tx.user.update({
      where: { id: userId },
      data: {
        authId: null,
        email: null,
        displayName: DELETED_USER_DISPLAY_NAME,
        avatarKey: null,
        onboarded: false,
        referralCode: null,
        deletedAt: new Date(),
      },
    });
  });

  return { userId, authId: user.authId, keptHandSeats, alreadyDeleted: false };
}
