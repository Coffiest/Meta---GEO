-- GEO戦略DBの集計用に事前展開した「1意思決定 = 1行」のテーブル。
-- GEOの問い合わせをインデックス1本 + GROUP BY で答えられるようにする。
-- CreateTable
CREATE TABLE "GeoDecision" (
    "id" TEXT NOT NULL,
    "handId" TEXT NOT NULL,
    "handSeatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "boardKey" TEXT NOT NULL,
    "preflopKey" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "stackBucket" TEXT NOT NULL,
    "bubbleStage" TEXT NOT NULL,
    "playerCount" INTEGER NOT NULL,
    "isGeometric" BOOLEAN NOT NULL,
    "handClassRow" INTEGER,
    "handClassCol" INTEGER,
    "sequenceNumber" INTEGER NOT NULL,

    CONSTRAINT "GeoDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeoDecision_street_lineKey_boardKey_stackBucket_bubbleStage_idx" ON "GeoDecision"("street", "lineKey", "boardKey", "stackBucket", "bubbleStage", "playerCount");

-- CreateIndex
CREATE INDEX "GeoDecision_handId_idx" ON "GeoDecision"("handId");

-- CreateIndex
CREATE INDEX "GeoDecision_handSeatId_idx" ON "GeoDecision"("handSeatId");

-- AddForeignKey
ALTER TABLE "GeoDecision" ADD CONSTRAINT "GeoDecision_handId_fkey" FOREIGN KEY ("handId") REFERENCES "Hand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeoDecision" ADD CONSTRAINT "GeoDecision_handSeatId_fkey" FOREIGN KEY ("handSeatId") REFERENCES "HandSeat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
