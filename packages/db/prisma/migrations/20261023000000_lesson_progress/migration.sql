-- レッスン(Lesson タブ)の進み具合。
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "lastStartedDay" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "bestStars" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LessonProgress_userId_lessonId_key" ON "LessonProgress"("userId", "lessonId");
CREATE INDEX "LessonProgress_userId_lastStartedDay_idx" ON "LessonProgress"("userId", "lastStartedDay");
