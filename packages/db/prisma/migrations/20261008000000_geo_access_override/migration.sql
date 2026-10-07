-- 管理者がプレイヤーごとに GEO データベースの利用条件を緩める("preflop" | "full")。null = インマネの回数どおり。
ALTER TABLE "User" ADD COLUMN "geoAccessOverride" TEXT;
