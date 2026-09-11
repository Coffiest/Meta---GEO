-- CreateTable
CREATE TABLE "TrendItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "severity" TEXT,
    "severityTerms" TEXT[],
    "reviewedAt" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,

    CONSTRAINT "TrendItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "platform" TEXT,
    "postedUrl" TEXT,
    "postedAt" TIMESTAMP(3),
    "structure" JSONB NOT NULL,
    "impressions" INTEGER,
    "likes" INTEGER,
    "reposts" INTEGER,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isOwn" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountSnapshot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT NOT NULL,
    "followers" INTEGER NOT NULL,
    "following" INTEGER,
    "posts" INTEGER,

    CONSTRAINT "AccountSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrendItem_dedupeKey_key" ON "TrendItem"("dedupeKey");

-- CreateIndex
CREATE INDEX "TrendItem_createdAt_idx" ON "TrendItem"("createdAt");

-- CreateIndex
CREATE INDEX "TrendItem_severity_createdAt_idx" ON "TrendItem"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "TrendItem_reviewedAt_idx" ON "TrendItem"("reviewedAt");

-- CreateIndex
CREATE INDEX "SocialPost_createdAt_idx" ON "SocialPost"("createdAt");

-- CreateIndex
CREATE INDEX "SocialPost_platform_postedAt_idx" ON "SocialPost"("platform", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_platform_handle_key" ON "SocialAccount"("platform", "handle");

-- CreateIndex
CREATE INDEX "AccountSnapshot_accountId_createdAt_idx" ON "AccountSnapshot"("accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountSnapshot" ADD CONSTRAINT "AccountSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
