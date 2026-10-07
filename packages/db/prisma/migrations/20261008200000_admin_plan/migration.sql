-- 管理者が付与したプラン(Stripe の契約とは別。高い方が効く)。
ALTER TABLE "User" ADD COLUMN "adminPlan" TEXT;
ALTER TABLE "User" ADD COLUMN "adminPlanUntil" TIMESTAMP(3);
