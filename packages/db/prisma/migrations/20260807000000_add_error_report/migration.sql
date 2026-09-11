-- ユーザーからのエラー報告(「運営に報告する」ボタン)を保存するテーブル。
CREATE TABLE "ErrorReport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scope" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "context" JSONB,
    "appVersion" TEXT,
    "userAgent" TEXT,
    "url" TEXT,
    "userId" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ErrorReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErrorReport_createdAt_idx" ON "ErrorReport"("createdAt");
CREATE INDEX "ErrorReport_scope_createdAt_idx" ON "ErrorReport"("scope", "createdAt");
CREATE INDEX "ErrorReport_resolvedAt_idx" ON "ErrorReport"("resolvedAt");

-- ユーザー削除時は報告を残しつつ紐付けだけ外す(原因分析のため報告自体は保持する)。
ALTER TABLE "ErrorReport" ADD CONSTRAINT "ErrorReport_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
