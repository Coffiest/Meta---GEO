-- CreateTable
CREATE TABLE "ReviewUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewUsage_userId_createdAt_idx" ON "ReviewUsage"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewUsage_userId_tournamentId_key" ON "ReviewUsage"("userId", "tournamentId");
