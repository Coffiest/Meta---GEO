-- 7日間無料の特別オファー(インマネ10回ごとに1回、1時間だけ)。
ALTER TABLE "User" ADD COLUMN "trialOfferMilestone" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "trialOfferUntil" TIMESTAMP(3);
