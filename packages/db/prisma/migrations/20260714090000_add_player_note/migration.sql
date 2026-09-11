-- CreateTable
CREATE TABLE "PlayerNote" (
    "id" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "color" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerNote_authorUserId_idx" ON "PlayerNote"("authorUserId");

-- CreateIndex
CREATE INDEX "PlayerNote_targetUserId_idx" ON "PlayerNote"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerNote_authorUserId_targetUserId_key" ON "PlayerNote"("authorUserId", "targetUserId");
