-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarKey" TEXT,
ADD COLUMN     "onboarded" BOOLEAN NOT NULL DEFAULT false;

