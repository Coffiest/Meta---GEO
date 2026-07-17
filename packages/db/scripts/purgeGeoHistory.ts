/**
 * GEOのプレイ履歴データ(テストプレイで溜まった分)を全削除するワンショットスクリプト。
 * リリース直前に一度だけ手動実行し、GEO戦略DB(レンジ分析)とプレイヤー統計(VPIP/PFR/3bet)の
 * 元データを初期化する。実行後は通常どおり各ハンドが recordHand で蓄積されていく。
 *
 * 削除するのは以下のプレイ履歴テーブルのみ:
 *   ReviewDecision → HandReview → HandAction / HandSeat / HandPot → Hand
 * (外部キーの依存順に子から削除する)
 *
 * 保持するもの: GtoSolution(自社ソルバーの正解データ)、User/Subscription(アカウント)、
 *   Tournament/TournamentEntry(トーナメント結果)、BankrollTransaction(バンクロール取引)。
 *
 *   実行: DATABASE_URL=... pnpm --filter @meta-geo/db exec tsx scripts/purgeGeoHistory.ts
 *   本番では .github/workflows/purge-geo-history.yml (手動 workflow_dispatch) から実行する。
 */
import { prisma } from "../src/client.js";

async function main(): Promise<void> {
  // 削除前の件数を記録(実行ログで確認できるように)。
  const before = {
    hand: await prisma.hand.count(),
    handSeat: await prisma.handSeat.count(),
    handAction: await prisma.handAction.count(),
    handPot: await prisma.handPot.count(),
    handReview: await prisma.handReview.count(),
    reviewDecision: await prisma.reviewDecision.count(),
  };
  console.log("[purgeGeoHistory] 削除前の件数:", JSON.stringify(before));

  // 外部キーの依存順に、子テーブルから削除する。
  const deleted = await prisma.$transaction(async (tx) => {
    const reviewDecision = await tx.reviewDecision.deleteMany({});
    const handReview = await tx.handReview.deleteMany({});
    const handAction = await tx.handAction.deleteMany({});
    const handSeat = await tx.handSeat.deleteMany({});
    const handPot = await tx.handPot.deleteMany({});
    const hand = await tx.hand.deleteMany({});
    return {
      reviewDecision: reviewDecision.count,
      handReview: handReview.count,
      handAction: handAction.count,
      handSeat: handSeat.count,
      handPot: handPot.count,
      hand: hand.count,
    };
  });

  console.log("[purgeGeoHistory] 削除した件数:", JSON.stringify(deleted));

  const after = {
    hand: await prisma.hand.count(),
    handAction: await prisma.handAction.count(),
  };
  console.log("[purgeGeoHistory] 削除後の件数:", JSON.stringify(after));
  if (after.hand !== 0 || after.handAction !== 0) {
    throw new Error(`[purgeGeoHistory] 削除後も残存: ${JSON.stringify(after)}`);
  }
  console.log("[purgeGeoHistory] 完了: GEOプレイ履歴を全削除しました。");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("[purgeGeoHistory] 失敗:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
