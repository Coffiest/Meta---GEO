-- 3つのプラン(シルバー / ゴールド / プラチナ)。既存の契約(¥980)はすべてシルバー(オーナー確定)。
ALTER TABLE "Subscription" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'silver';

-- 無料体験は全プランを通して1人1回。
ALTER TABLE "User" ADD COLUMN "trialUsedAt" TIMESTAMP(3);

-- 無料体験に使ったカードの指紋(同じカードでの2回目を弾く)。
CREATE TABLE "TrialFingerprint" (
    "fingerprint" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrialFingerprint_pkey" PRIMARY KEY ("fingerprint")
);
