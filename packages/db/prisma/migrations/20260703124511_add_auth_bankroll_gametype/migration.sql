-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "buyIn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gameType" TEXT NOT NULL DEFAULT 'sng';

-- AlterTable
ALTER TABLE "TournamentEntry" ADD COLUMN     "payout" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authId" TEXT;

-- CreateTable
CREATE TABLE "BankrollTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "tournamentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankrollTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankrollTransaction_userId_createdAt_idx" ON "BankrollTransaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_authId_key" ON "User"("authId");

-- AddForeignKey
ALTER TABLE "BankrollTransaction" ADD CONSTRAINT "BankrollTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankrollTransaction" ADD CONSTRAINT "BankrollTransaction_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

