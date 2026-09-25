-- CreateTable
CREATE TABLE "PremiumCoupon" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "monthsGranted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PremiumCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PremiumCoupon_userId_key" ON "PremiumCoupon"("userId");

-- CreateIndex
CREATE INDEX "PremiumCoupon_expiresAt_idx" ON "PremiumCoupon"("expiresAt");

-- AddForeignKey
ALTER TABLE "PremiumCoupon" ADD CONSTRAINT "PremiumCoupon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
