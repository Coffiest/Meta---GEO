-- CreateTable
CREATE TABLE "GtoSolution" (
    "id" TEXT NOT NULL,
    "spotKey" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "effStackBucket" TEXT NOT NULL,
    "heroPos" TEXT NOT NULL,
    "boardCanon" TEXT NOT NULL,
    "actionLine" TEXT NOT NULL,
    "betTree" TEXT NOT NULL,
    "solution" JSONB NOT NULL,
    "exploitability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "solverVersion" TEXT NOT NULL DEFAULT 'preflop-table-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GtoSolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandReview" (
    "id" TEXT NOT NULL,
    "handId" TEXT NOT NULL,
    "heroUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "gtoAccuracy" DOUBLE PRECISION,
    "totalEvLossBb" DOUBLE PRECISION,
    "mistakeCount" INTEGER,
    "artisticCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "street" TEXT NOT NULL,
    "analyzable" BOOLEAN NOT NULL DEFAULT true,
    "outOfScopeReason" TEXT,
    "heroPos" TEXT NOT NULL,
    "effStackBb" DOUBLE PRECISION NOT NULL,
    "potBb" DOUBLE PRECISION NOT NULL,
    "facingSizeBb" DOUBLE PRECISION,
    "actionTaken" JSONB NOT NULL,
    "gtoActions" JSONB,
    "evLossBb" DOUBLE PRECISION,
    "classification" TEXT,
    "actionName" TEXT,
    "explanation" TEXT,
    "spotKey" TEXT,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GtoSolution_spotKey_key" ON "GtoSolution"("spotKey");

-- CreateIndex
CREATE INDEX "GtoSolution_street_effStackBucket_idx" ON "GtoSolution"("street", "effStackBucket");

-- CreateIndex
CREATE UNIQUE INDEX "HandReview_handId_heroUserId_key" ON "HandReview"("handId", "heroUserId");

-- CreateIndex
CREATE INDEX "HandReview_status_idx" ON "HandReview"("status");

-- CreateIndex
CREATE INDEX "ReviewDecision_reviewId_idx" ON "ReviewDecision"("reviewId");

-- AddForeignKey
ALTER TABLE "HandReview" ADD CONSTRAINT "HandReview_handId_fkey" FOREIGN KEY ("handId") REFERENCES "Hand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "HandReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
