-- AlterTable
ALTER TABLE "Hand" ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "entryCount" INTEGER,
ADD COLUMN     "fieldStacks" INTEGER[],
ADD COLUMN     "itmPlaces" INTEGER,
ADD COLUMN     "payouts" INTEGER[],
ADD COLUMN     "playersRemaining" INTEGER,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "HandAction" ADD COLUMN     "actedAt" TIMESTAMP(3),
ADD COLUMN     "thinkMs" INTEGER,
ADD COLUMN     "timeBankUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "timedOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "turnStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DecisionFact" (
    "id" TEXT NOT NULL,
    "handId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isBot" BOOLEAN NOT NULL,
    "gameType" TEXT NOT NULL,
    "handNumber" INTEGER NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "street" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actionClass" TEXT NOT NULL,
    "firstInHand" BOOLEAN NOT NULL,
    "handVpip" BOOLEAN NOT NULL,
    "handPfr" BOOLEAN NOT NULL,
    "thinkMs" INTEGER,
    "thinkBucket" TEXT NOT NULL,
    "timedOut" BOOLEAN NOT NULL,
    "timeBankUsed" BOOLEAN NOT NULL,
    "position" TEXT NOT NULL,
    "playersInHand" INTEGER NOT NULL,
    "playersActive" INTEGER NOT NULL,
    "bigBlind" INTEGER NOT NULL,
    "potBb" DOUBLE PRECISION NOT NULL,
    "facingBb" DOUBLE PRECISION,
    "betSizePot" DOUBLE PRECISION,
    "betSizeBucket" TEXT NOT NULL,
    "stackBb" DOUBLE PRECISION NOT NULL,
    "effStackBb" DOUBLE PRECISION NOT NULL,
    "stackBucket" TEXT NOT NULL,
    "spr" DOUBLE PRECISION,
    "handClass" TEXT,
    "madeHand" TEXT,
    "hasDraw" BOOLEAN NOT NULL,
    "boardTexture" TEXT,
    "spot" TEXT NOT NULL,
    "playersRemaining" INTEGER,
    "itmPlaces" INTEGER,
    "bubbleDistance" INTEGER,
    "bubbleStage" TEXT NOT NULL,
    "stackRank" INTEGER,
    "chipShare" DOUBLE PRECISION,
    "winProb" DOUBLE PRECISION,
    "itmProb" DOUBLE PRECISION,
    "icmEquity" DOUBLE PRECISION,
    "winProbBucket" TEXT NOT NULL,
    "itmProbBucket" TEXT NOT NULL,
    "prevHandDeltaBb" DOUBLE PRECISION,
    "prevBigPot" TEXT NOT NULL,
    "handsSinceBigPot" INTEGER,
    "lastBigPotKind" TEXT NOT NULL,
    "lossStreak" INTEGER NOT NULL,
    "handIndexInTournament" INTEGER NOT NULL,
    "minutesIntoTournament" DOUBLE PRECISION,
    "stackVsStart" DOUBLE PRECISION,
    "handResultBb" DOUBLE PRECISION NOT NULL,
    "wentToShowdown" BOOLEAN NOT NULL,
    "wonHand" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DecisionFact_isBot_userId_idx" ON "DecisionFact"("isBot", "userId");

-- CreateIndex
CREATE INDEX "DecisionFact_tournamentId_userId_handNumber_idx" ON "DecisionFact"("tournamentId", "userId", "handNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionFact_handId_sequenceNumber_key" ON "DecisionFact"("handId", "sequenceNumber");

-- AddForeignKey
ALTER TABLE "DecisionFact" ADD CONSTRAINT "DecisionFact_handId_fkey" FOREIGN KEY ("handId") REFERENCES "Hand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

