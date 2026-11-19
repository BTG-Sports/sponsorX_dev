-- P9-BE-26 — the public copy of a published edition's picture, video or ad.
ALTER TABLE "EditionAsset" ADD COLUMN     "webCopiedAt" TIMESTAMP(3),
ADD COLUMN     "webKey" TEXT,
ADD COLUMN     "webProblem" TEXT,
ADD COLUMN     "webType" TEXT;

CREATE UNIQUE INDEX "EditionAsset_webKey_key" ON "EditionAsset"("webKey");

-- A copy has its type and its time; a piece without one has neither.
ALTER TABLE "EditionAsset" ADD CONSTRAINT "EditionAsset_web_copy_shape" CHECK (
  ("webKey" IS NULL AND "webType" IS NULL AND "webCopiedAt" IS NULL)
  OR ("webKey" IS NOT NULL AND "webType" IS NOT NULL AND "webCopiedAt" IS NOT NULL)
);
