-- GEO集計の走査順(createdAt昇順)に効くインデックス。全件ソートを避ける。
-- CreateIndex
CREATE INDEX "Hand_createdAt_idx" ON "Hand"("createdAt");

-- ポストフロップGEOは板面でハンドを絞り込む(board @> ARRAY[...])。配列包含はGINが効く。
-- CreateIndex
CREATE INDEX "Hand_board_idx" ON "Hand" USING GIN ("board" array_ops);
