-- 招待の特典を「招待された人が実際に遊んだら」発行する形にする(複数アカウントの自作自演の対策)。
ALTER TABLE "Referral" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Referral" ADD COLUMN "rewardedAt" TIMESTAMP(3);
ALTER TABLE "Referral" ADD COLUMN "ipHash" TEXT;
-- これまでの招待は成立と同時にクーポンを発行済み。
UPDATE "Referral" r SET "status" = 'rewarded', "rewardedAt" = r."createdAt";

-- 招待の特典を1週間にする(古いクーポンは months のまま)。
ALTER TABLE "PremiumCouponCode" ADD COLUMN "days" INTEGER;

ALTER TABLE "User" ADD COLUMN "referralIpHash" TEXT;
