-- POL-BE-03 — a team's share goes up only with the athlete's yes (the
-- guardian's, for a minor). A raise, a clear back to BTG's standard share, and
-- the share typed at "Add athlete" are each a request the athlete answers;
-- lowering applies at once. One open request per athlete.
CREATE TABLE "TeamShareChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "fromBps" INTEGER,
    "toBps" INTEGER,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamShareChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TeamShareChange_tenantId_athleteId_state_idx" ON "TeamShareChange"("tenantId", "athleteId", "state");
CREATE INDEX "TeamShareChange_propertyId_state_idx" ON "TeamShareChange"("propertyId", "state");
CREATE UNIQUE INDEX "TeamShareChange_one_open" ON "TeamShareChange"("athleteId") WHERE "state" = 'PENDING';
ALTER TABLE "TeamShareChange" ADD CONSTRAINT "TeamShareChange_state_check"
  CHECK ("state" IN ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'LAPSED'));
ALTER TABLE "TeamShareChange" ADD CONSTRAINT "TeamShareChange_share_check"
  CHECK (("fromBps" IS NULL OR "fromBps" BETWEEN 0 AND 10000) AND ("toBps" IS NULL OR "toBps" BETWEEN 0 AND 10000));
ALTER TABLE "TeamShareChange" ADD CONSTRAINT "TeamShareChange_decided_check"
  CHECK (("state" = 'PENDING') = ("decidedAt" IS NULL));
