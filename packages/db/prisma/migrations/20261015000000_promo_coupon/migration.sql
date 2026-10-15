-- 管理者が発行する割引・無料体験のクーポン。
CREATE TABLE "PromoCoupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "note" TEXT,
    "plan" TEXT,
    "kind" TEXT NOT NULL,
    "percentOff" INTEGER,
    "durationMonths" INTEGER,
    "trialDays" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stripeCouponId" TEXT,
    "stripePromotionCodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoCoupon_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PromoCoupon_code_key" ON "PromoCoupon"("code");
CREATE UNIQUE INDEX "PromoCoupon_stripePromotionCodeId_key" ON "PromoCoupon"("stripePromotionCodeId");

CREATE TABLE "PromoCouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoCouponRedemption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PromoCouponRedemption_couponId_userId_key" ON "PromoCouponRedemption"("couponId", "userId");
ALTER TABLE "PromoCouponRedemption" ADD CONSTRAINT "PromoCouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "PromoCoupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
