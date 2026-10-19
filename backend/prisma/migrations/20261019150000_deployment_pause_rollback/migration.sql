-- 4S2-BE-05 — a deployment can be paused (and resumed) or rolled back to an
-- earlier creative version from SponsorX, without redeploying the INFINEX
-- application: the manifest shows only APPROVED deployments, so either takes
-- the creative off the world on its next poll. PAUSED and ROLLED_BACK were
-- already in the state vocabulary (20261016190000); these record when and why.

-- AlterTable
ALTER TABLE "CreativeDeployment" ADD COLUMN "pausedAt" TIMESTAMP(3),
ADD COLUMN "rolledBackAt" TIMESTAMP(3),
ADD COLUMN "stateReason" TEXT,
ADD COLUMN "replacedById" TEXT;

-- A paused deployment says when and why; a rolled-back one, when, why and what replaced it.
ALTER TABLE "CreativeDeployment" ADD CONSTRAINT "CreativeDeployment_pause_rollback_check" CHECK ((
  ("state" <> 'PAUSED' OR ("pausedAt" IS NOT NULL AND "stateReason" IS NOT NULL))
  AND ("state" <> 'ROLLED_BACK' OR ("rolledBackAt" IS NOT NULL AND "stateReason" IS NOT NULL AND "replacedById" IS NOT NULL))
) IS TRUE);
