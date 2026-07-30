-- 特典の切り替え(称号 → 棋譜解析1ヶ月無料)より前に成立していた招待にも、さかのぼって
-- 無料月数を付与する。招待した人には「1人につき1ヶ月」を約束しているため、切り替え前の
-- 招待だけ無報酬になるのを避ける。
--
-- 冪等性: rewardGrantedAt IS NULL の行だけを対象にし、最後にその行へ付与時刻を刻む。
-- 再実行しても対象が0件になるだけで二重付与にならない。
-- クーポン行が既にある場合(このマイグレーション以降に招待が成立した場合)は期限を延長する。

WITH pending AS (
    SELECT "inviterUserId" AS user_id, COUNT(*)::int AS months
    FROM "Referral"
    WHERE "rewardGrantedAt" IS NULL
    GROUP BY "inviterUserId"
)
INSERT INTO "PremiumCoupon" ("id", "userId", "expiresAt", "monthsGranted", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p.user_id, NOW() + (p.months || ' month')::interval, p.months, NOW(), NOW()
FROM pending p
ON CONFLICT ("userId") DO UPDATE
SET "expiresAt" = GREATEST("PremiumCoupon"."expiresAt", NOW()) + (EXCLUDED."monthsGranted" || ' month')::interval,
    "monthsGranted" = "PremiumCoupon"."monthsGranted" + EXCLUDED."monthsGranted",
    "updatedAt" = NOW();

UPDATE "Referral" SET "rewardGrantedAt" = NOW() WHERE "rewardGrantedAt" IS NULL;
