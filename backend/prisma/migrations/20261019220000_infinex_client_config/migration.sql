-- 4S3-INT-03 — a game build's client config: the reviewed defaults in code,
-- with BTG's override (within limits) per build, versioned.

-- AlterTable
ALTER TABLE "InfinexClient" ADD COLUMN "configOverride" JSONB,
ADD COLUMN "configVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "InfinexClient" ADD CONSTRAINT "InfinexClient_config_check" CHECK ("configVersion" >= 0);
