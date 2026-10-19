-- 4S0-SEC-01 — trusted client authentication for INFINEX
-- (documentation/SponsorX-INFINEX-API-and-Event-Spec.md §6). Two new roles,
-- a world operator's server credential, the game clients registered for a
-- world, and the 15-minute tokens both get. Secrets and tokens are stored
-- only as SHA-256 hashes.

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'INFINEX_SERVICE';
ALTER TYPE "Role" ADD VALUE 'INFINEX_CLIENT';

-- CreateTable
CREATE TABLE "InfinexCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokeReason" TEXT,

    CONSTRAINT "InfinexCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfinexClient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "InfinexClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfinexToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "clientId" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfinexToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InfinexCredential_userId_key" ON "InfinexCredential"("userId");
CREATE INDEX "InfinexCredential_tenantId_idx" ON "InfinexCredential"("tenantId");
CREATE INDEX "InfinexClient_tenantId_worldId_idx" ON "InfinexClient"("tenantId", "worldId");
CREATE UNIQUE INDEX "InfinexToken_tokenHash_key" ON "InfinexToken"("tokenHash");
CREATE INDEX "InfinexToken_tenantId_credentialId_idx" ON "InfinexToken"("tenantId", "credentialId");
CREATE INDEX "InfinexToken_expiresAt_idx" ON "InfinexToken"("expiresAt");

-- The vocabularies, held by the database.
ALTER TABLE "InfinexClient" ADD CONSTRAINT "InfinexClient_status_check" CHECK ("status" IN ('ACTIVE', 'REVOKED'));
ALTER TABLE "InfinexToken" ADD CONSTRAINT "InfinexToken_kind_check" CHECK ((
  "kind" IN ('SERVICE', 'CLIENT') AND ("kind" = 'CLIENT') = ("clientId" IS NOT NULL) AND "expiresAt" > "issuedAt"
) IS TRUE);
