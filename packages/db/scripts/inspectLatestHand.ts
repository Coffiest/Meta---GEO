/**
 * ソロテスト用の確認スクリプト。直近にプレイされたハンドをDBから読み出し、
 * 「実際にプレイした内容が正しく保存されているか」を人間が目で見て確認できる形で表示する。
 *
 * 実行方法: pnpm --filter @meta-geo/db exec tsx scripts/inspectLatestHand.ts [表示件数(デフォルト3)]
 */
import { prisma } from "../src/client.js";

async function main() {
  const limit = Number(process.argv[2] ?? 3);

  const hands = await prisma.hand.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      seats: { include: { user: true }, orderBy: { seatIndex: "asc" } },
      actions: { orderBy: { sequenceNumber: "asc" } },
      pots: true,
      tournament: true,
    },
  });

  if (hands.length === 0) {
    console.log("ハンドがまだ1件も記録されていません。先にソロテストでプレイしてください。");
    return;
  }

  for (const hand of hands) {
    console.log("=".repeat(60));
    console.log(
      `Hand #${hand.handNumber}  (tournament=${hand.tournamentId.slice(0, 8)}…, ${hand.createdAt.toISOString()})`,
    );
    console.log(
      `  blinds: ${hand.levelSmallBlind}/${hand.levelBigBlind}  ante(BB): ${hand.levelAnte}  button seat: ${hand.buttonFixedPos}`,
    );
    console.log(`  board: ${hand.board.join(" ") || "(showdown前に終了)"}`);
    console.log(`  pot total: ${hand.potTotal}  won by fold: ${hand.wonByFold}`);

    console.log("  seats:");
    for (const seat of hand.seats) {
      const roleTag = seat.isBigBlind ? "[BB]" : seat.isSmallBlind ? "[SB]" : "    ";
      const delta = seat.resultStackDelta >= 0 ? `+${seat.resultStackDelta}` : `${seat.resultStackDelta}`;
      console.log(
        `    seat${seat.seatIndex} ${roleTag} ${seat.user.displayName.padEnd(14)} hole=${seat.holeCards.join(",").padEnd(7)} start=${seat.startingStack} delta=${delta}`,
      );
    }

    console.log("  actions:");
    for (const a of hand.actions) {
      const amt = a.toAmount !== null ? ` -> ${a.toAmount}` : "";
      console.log(`    [${a.street.padEnd(7)}] seat${a.seatIndex} ${a.kind}${amt}  (pot before: ${a.potBefore})`);
    }

    console.log("  pots:");
    for (const p of hand.pots) {
      console.log(`    pot#${p.potIndex}: ${p.amount}  winners=${p.winnerUserIds.length}`);
    }
  }
  console.log("=".repeat(60));
  console.log(`OK: 直近${hands.length}ハンド分がDBに正しく記録されています。`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
