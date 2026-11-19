-- P9-BE-25 — a piece of edition content's file, in any format: its type, exact size and name.
ALTER TABLE "EditionAsset" ADD COLUMN     "fileBytes" INTEGER,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "fileType" TEXT;

-- A size is never negative, and only a piece with a file has a type, size or name.
ALTER TABLE "EditionAsset" ADD CONSTRAINT "EditionAsset_fileBytes_check" CHECK ("fileBytes" IS NULL OR "fileBytes" > 0);
ALTER TABLE "EditionAsset" ADD CONSTRAINT "EditionAsset_file_needs_key_check" CHECK ("r2Key" IS NOT NULL OR ("fileType" IS NULL AND "fileBytes" IS NULL AND "fileName" IS NULL));

-- Student pieces approved before this carry their draft's type.
UPDATE "EditionAsset" a SET "fileType" = s."fileType"
FROM "StudentAssignment" s
WHERE s."assetId" = a."id" AND a."r2Key" IS NOT NULL AND s."fileType" IS NOT NULL AND a."fileType" IS NULL;
