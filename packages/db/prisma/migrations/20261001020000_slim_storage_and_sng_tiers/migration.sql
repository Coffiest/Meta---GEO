-- DB容量の節約 + SNG の階層(High Roller / Super High Roller)の下準備。
--
-- 1. 研究用の DecisionFact は人間の決定だけを持つ(自動で卓を埋めるプレイヤーの行はどこからも読まれない)。
--    既存の該当行を消してから、種別の列そのものを削除する。
DELETE FROM "DecisionFact" WHERE "isBot" = true;

-- 2. 実数は REAL(8→4バイト)、小さい整数は SMALLINT(4→2バイト)へ。
-- 3. 読まれていない索引と、他の列から求まる列(HandAction.turnStartedAt = actedAt − thinkMs)を削除。
-- 4. もう使われていない GeoViewUsage を削除。
-- 5. 賞金はトーナメント単位で1回だけ持つ(Tournament.payouts)。既存の SNG(参加費1,000)は 4,000 / 2,000。

-- DropIndex
DROP INDEX "HandAction_street_kind_idx";

-- DropIndex
DROP INDEX "DecisionFact_isBot_userId_idx";

-- DropIndex
DROP INDEX "DecisionFact_tournamentId_userId_handNumber_idx";

-- DropIndex
DROP INDEX "HandReview_status_idx";

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "payouts" INTEGER[],
ADD COLUMN     "tier" TEXT NOT NULL DEFAULT 'regular';

-- AlterTable
ALTER TABLE "HandAction" DROP COLUMN "turnStartedAt";

-- AlterTable
ALTER TABLE "DecisionFact" DROP COLUMN "isBot",
ALTER COLUMN "sequenceNumber" SET DATA TYPE SMALLINT,
ALTER COLUMN "playersInHand" SET DATA TYPE SMALLINT,
ALTER COLUMN "playersActive" SET DATA TYPE SMALLINT,
ALTER COLUMN "potBb" SET DATA TYPE REAL,
ALTER COLUMN "facingBb" SET DATA TYPE REAL,
ALTER COLUMN "betSizePot" SET DATA TYPE REAL,
ALTER COLUMN "stackBb" SET DATA TYPE REAL,
ALTER COLUMN "effStackBb" SET DATA TYPE REAL,
ALTER COLUMN "spr" SET DATA TYPE REAL,
ALTER COLUMN "playersRemaining" SET DATA TYPE SMALLINT,
ALTER COLUMN "itmPlaces" SET DATA TYPE SMALLINT,
ALTER COLUMN "bubbleDistance" SET DATA TYPE SMALLINT,
ALTER COLUMN "stackRank" SET DATA TYPE SMALLINT,
ALTER COLUMN "chipShare" SET DATA TYPE REAL,
ALTER COLUMN "winProb" SET DATA TYPE REAL,
ALTER COLUMN "itmProb" SET DATA TYPE REAL,
ALTER COLUMN "icmEquity" SET DATA TYPE REAL,
ALTER COLUMN "prevHandDeltaBb" SET DATA TYPE REAL,
ALTER COLUMN "handsSinceBigPot" SET DATA TYPE SMALLINT,
ALTER COLUMN "lossStreak" SET DATA TYPE SMALLINT,
ALTER COLUMN "handIndexInTournament" SET DATA TYPE SMALLINT,
ALTER COLUMN "minutesIntoTournament" SET DATA TYPE REAL,
ALTER COLUMN "stackVsStart" SET DATA TYPE REAL,
ALTER COLUMN "handResultBb" SET DATA TYPE REAL;

-- DropTable
DROP TABLE "GeoViewUsage";

-- CreateIndex
CREATE INDEX "DecisionFact_userId_idx" ON "DecisionFact"("userId");


UPDATE "Tournament" SET "payouts" = ARRAY[4000, 2000] WHERE "gameType" = 'sng' AND "buyIn" = 1000;
