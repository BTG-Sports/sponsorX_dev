-- 3S8-BE-01 model versions; 3S8-OPS-01 feature flags.

-- CreateTable
CREATE TABLE "ModelVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "thresholds" JSONB NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "ModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "tenantId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("tenantId","feature")
);

-- CreateIndex
CREATE INDEX "ModelVersion_tenantId_key_status_idx" ON "ModelVersion"("tenantId", "key", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ModelVersion_tenantId_key_version_key" ON "ModelVersion"("tenantId", "key", "version");

-- One active version per tenant and model.
CREATE UNIQUE INDEX "ModelVersion_one_active" ON "ModelVersion"("tenantId", "key") WHERE "status" = 'active';
