-- 2S1-BE-02 — verification documents attached to a property onboarding.
-- CreateTable
CREATE TABLE "OnboardingDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "r2Key" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingDocument_r2Key_key" ON "OnboardingDocument"("r2Key");

-- CreateIndex
CREATE INDEX "OnboardingDocument_tenantId_onboardingId_idx" ON "OnboardingDocument"("tenantId", "onboardingId");

-- AddForeignKey
ALTER TABLE "OnboardingDocument" ADD CONSTRAINT "OnboardingDocument_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "PropertyOnboarding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
