-- 2S1-BE-17 — sponsors approved automatically: the business type, email
-- confirmation, review reasons, the proof of business, and switching a
-- login off (Reject after approval).
ALTER TABLE "Inquiry" ADD COLUMN "businessType" TEXT;
ALTER TABLE "Inquiry" ADD COLUMN "businessTypeOther" TEXT;
ALTER TABLE "Inquiry" ADD COLUMN "emailConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Inquiry" ADD COLUMN "reviewReasons" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Inquiry" ADD COLUMN "autoApproved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Inquiry" DROP CONSTRAINT IF EXISTS "Inquiry_state_check";
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_state_check" CHECK ("state" IN ('NEW', 'APPROVED', 'DECLINED', 'REJECTED'));

CREATE TABLE "InquiryDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "r2Key" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InquiryDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InquiryDocument_tenantId_inquiryId_idx" ON "InquiryDocument"("tenantId", "inquiryId");
ALTER TABLE "InquiryDocument" ADD CONSTRAINT "InquiryDocument_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "disabledReason" TEXT;
