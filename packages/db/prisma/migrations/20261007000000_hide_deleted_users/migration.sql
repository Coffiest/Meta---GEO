-- 退会したユーザーの表示名を、退会したと分からない名前にそろえる(オーナー指示: 表舞台から完全に消す)。
UPDATE "User" SET "displayName" = 'Player' WHERE "deletedAt" IS NOT NULL;
