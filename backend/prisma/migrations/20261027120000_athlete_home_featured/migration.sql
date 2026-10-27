-- P8-BE-08 — the home page's Featured athletes panel and the athlete's profile photo.
-- AlterTable
ALTER TABLE "Athlete" ADD COLUMN     "homeApprovedAt" TIMESTAMP(3),
ADD COLUMN     "homePinnedAt" TIMESTAMP(3),
ADD COLUMN     "homeRemovedAt" TIMESTAMP(3),
ADD COLUMN     "photoKey" TEXT;
