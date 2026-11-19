-- P9-BE-27 — an edition's cover image and its press PDF.
ALTER TABLE "Edition" ADD COLUMN     "coverBytes" INTEGER,
ADD COLUMN     "coverKey" TEXT,
ADD COLUMN     "coverType" TEXT,
ADD COLUMN     "coverUploadedAt" TIMESTAMP(3),
ADD COLUMN     "coverWebFrom" TEXT,
ADD COLUMN     "coverWebKey" TEXT,
ADD COLUMN     "pressPdfBytes" INTEGER,
ADD COLUMN     "pressPdfKey" TEXT,
ADD COLUMN     "pressPdfName" TEXT,
ADD COLUMN     "pressPdfUploadedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Edition_coverWebKey_key" ON "Edition"("coverWebKey");

-- A cover or press PDF is all its columns or none; a public copy names the original it came from.
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_cover_shape" CHECK (
  ("coverKey" IS NULL AND "coverType" IS NULL AND "coverBytes" IS NULL AND "coverUploadedAt" IS NULL)
  OR ("coverKey" IS NOT NULL AND "coverType" IS NOT NULL AND "coverBytes" > 0 AND "coverUploadedAt" IS NOT NULL)
);
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_cover_web_shape" CHECK (("coverWebKey" IS NULL) = ("coverWebFrom" IS NULL));
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_press_pdf_shape" CHECK (
  ("pressPdfKey" IS NULL AND "pressPdfBytes" IS NULL AND "pressPdfUploadedAt" IS NULL AND "pressPdfName" IS NULL)
  OR ("pressPdfKey" IS NOT NULL AND "pressPdfBytes" > 0 AND "pressPdfUploadedAt" IS NOT NULL)
);
