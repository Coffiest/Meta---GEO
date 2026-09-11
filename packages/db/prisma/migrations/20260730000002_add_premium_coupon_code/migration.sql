-- CreateTable
CREATE TABLE "PremiumCouponCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'referral',
    "referralId" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "redeemedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PremiumCouponCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PremiumCouponCode_code_key" ON "PremiumCouponCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PremiumCouponCode_referralId_key" ON "PremiumCouponCode"("referralId");

-- CreateIndex
CREATE INDEX "PremiumCouponCode_ownerUserId_createdAt_idx" ON "PremiumCouponCode"("ownerUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "PremiumCouponCode" ADD CONSTRAINT "PremiumCouponCode_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumCouponCode" ADD CONSTRAINT "PremiumCouponCode_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 特典の切り替え(称号 → 棋譜解析1ヶ月無料クーポン)より前に成立していた招待にも、さかのぼって
-- クーポンを1枚ずつ発行する。招待した人には「1人につき1ヶ月」を約束しているため、切り替え前の
-- 招待だけ無報酬になるのを避ける。
--
-- 冪等性: referralId に一意制約があり、ON CONFLICT DO NOTHING で二重発行しない。再実行しても安全。
-- コードはアプリ側と同じ体裁("GEO"+8文字、区切りなしで保存)にする。md5は16進なので
-- 見間違えやすい I/O/L を含まない。衝突は一意制約で弾かれるが、md5(乱数+招待ID)なので実質起きない。
INSERT INTO "PremiumCouponCode" ("id", "code", "ownerUserId", "months", "source", "referralId", "createdAt")
SELECT
    gen_random_uuid(),
    'GEO' || upper(substr(md5(random()::text || r."id"), 1, 8)),
    r."inviterUserId",
    1,
    'referral',
    r."id",
    NOW()
FROM "Referral" r
ON CONFLICT ("referralId") DO NOTHING;
