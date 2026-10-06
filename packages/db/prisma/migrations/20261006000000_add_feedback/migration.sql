-- ホームの「ご意見フォーム」(要望・不具合・その他)と、その添付写真。
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "appVersion" TEXT,
    "userAgent" TEXT,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedbackImage" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "bytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "FeedbackImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");
CREATE INDEX "Feedback_readAt_idx" ON "Feedback"("readAt");
CREATE INDEX "FeedbackImage_feedbackId_idx" ON "FeedbackImage"("feedbackId");

ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackImage" ADD CONSTRAINT "FeedbackImage_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
