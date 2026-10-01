-- 2S1-BE-18 — the restricted-words list BTG keeps (removal deactivates).
CREATE TABLE "RestrictedWord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RestrictedWord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RestrictedWord_tenantId_normalized_key" ON "RestrictedWord"("tenantId", "normalized");
CREATE INDEX "RestrictedWord_tenantId_active_idx" ON "RestrictedWord"("tenantId", "active");
ALTER TABLE "RestrictedWord" ADD CONSTRAINT "RestrictedWord_kind_check"
  CHECK ("kind" IN ('ADULT', 'DRUGS', 'WEAPONS', 'GAMBLING', 'VIOLENCE_HATE', 'OTHER_ILLEGAL'));
