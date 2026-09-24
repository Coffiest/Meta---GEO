-- CreateTable
CREATE TABLE "PlayerReport" (
    "id" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerBlock" (
    "id" TEXT NOT NULL,
    "blockerUserId" TEXT NOT NULL,
    "blockedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerReport_reporterUserId_idx" ON "PlayerReport"("reporterUserId");

-- CreateIndex
CREATE INDEX "PlayerReport_reportedUserId_idx" ON "PlayerReport"("reportedUserId");

-- CreateIndex
CREATE INDEX "PlayerBlock_blockerUserId_idx" ON "PlayerBlock"("blockerUserId");

-- CreateIndex
CREATE INDEX "PlayerBlock_blockedUserId_idx" ON "PlayerBlock"("blockedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerBlock_blockerUserId_blockedUserId_key" ON "PlayerBlock"("blockerUserId", "blockedUserId");
