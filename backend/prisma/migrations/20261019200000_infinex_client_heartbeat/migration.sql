-- 4S3-INT-02 — the INFINEX client registry and heartbeats. A client is one
-- game build for one world; its latest heartbeat is kept on its row, and a
-- build that reported and then went quiet is marked missing (and alerted)
-- until it reports again.

-- AlterTable
ALTER TABLE "InfinexClient" ADD COLUMN "revokedBy" TEXT,
ADD COLUMN "revokeReason" TEXT,
ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN "lastManifestVersion" INTEGER,
ADD COLUMN "lastFps" DOUBLE PRECISION,
ADD COLUMN "lastErrorCount" INTEGER,
ADD COLUMN "heartbeatCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "missingSince" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "InfinexClient_worldId_buildId_key" ON "InfinexClient"("worldId", "buildId");

-- A revoked client says when; a missing one has reported at least once.
ALTER TABLE "InfinexClient" ADD CONSTRAINT "InfinexClient_heartbeat_check" CHECK ((
  ("status" = 'REVOKED') = ("revokedAt" IS NOT NULL)
  AND ("missingSince" IS NULL OR "lastHeartbeatAt" IS NOT NULL)
  AND "heartbeatCount" >= 0
) IS TRUE);
