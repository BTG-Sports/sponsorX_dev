-- POL-BE-18 — when a sponsor applicant last corrected their address (confirmation links are bound to it).
ALTER TABLE "Inquiry" ADD COLUMN "emailChangedAt" TIMESTAMP(3);
