-- 退会(アカウント削除)の記録。User 行自体は消さずに匿名化するため、削除時刻だけを持たせる。
-- 行を消さないのは、ハンド履歴(HandSeat.userId)=GEO DATABASE の実データが User を参照しており、
-- 行を消すと集計対象のハンドまで巻き添えで消えてしまうため。
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
