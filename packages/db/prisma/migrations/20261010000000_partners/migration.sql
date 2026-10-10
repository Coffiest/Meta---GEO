-- インフルエンサー(ローンチパートナー)と、その人に発行した Stripe のプロモーションコード。
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "note" TEXT,
    "code" TEXT NOT NULL,
    "stripePromotionCodeId" TEXT NOT NULL,
    "statementToken" TEXT NOT NULL,
    "userId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Partner_code_key" ON "Partner"("code");
CREATE UNIQUE INDEX "Partner_stripePromotionCodeId_key" ON "Partner"("stripePromotionCodeId");
CREATE UNIQUE INDEX "Partner_statementToken_key" ON "Partner"("statementToken");
