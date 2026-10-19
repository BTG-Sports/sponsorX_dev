-- 4S4-BE-01 / 4S4-DATA-01 — raw INFINEX telemetry. One row per (client,
-- eventId): a resent event is a no-op, never a second row. Append-only, and
-- separate from every aggregate, so any figure can be recomputed from it.

-- CreateTable
CREATE TABLE "VirtualEventRaw" (
    "clientId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "sessionKeyId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "placementId" TEXT,
    "deploymentId" TEXT,
    "zoneId" TEXT,
    "activationId" TEXT,
    "sessionRef" TEXT,
    "subjectRef" TEXT,
    "sequence" INTEGER,
    "data" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACCEPTED',

    CONSTRAINT "VirtualEventRaw_pkey" PRIMARY KEY ("clientId","eventId")
);

-- CreateIndex
CREATE INDEX "VirtualEventRaw_tenantId_placementId_occurredAt_idx" ON "VirtualEventRaw"("tenantId", "placementId", "occurredAt");
CREATE INDEX "VirtualEventRaw_tenantId_eventType_occurredAt_idx" ON "VirtualEventRaw"("tenantId", "eventType", "occurredAt");
CREATE INDEX "VirtualEventRaw_tenantId_receivedAt_idx" ON "VirtualEventRaw"("tenantId", "receivedAt");

-- The vocabulary.
ALTER TABLE "VirtualEventRaw" ADD CONSTRAINT "VirtualEventRaw_values_check" CHECK ((
  "status" IN ('ACCEPTED', 'QUARANTINED') AND "schemaVersion" >= 1
) IS TRUE);

-- Append-only: a raw event is never changed or removed — except a DELETE in a
-- database marked for purging (the test databases: sponsorx.audit_purge = 'on').
CREATE OR REPLACE FUNCTION virtual_event_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('sponsorx.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'virtual_event_append_only: raw event %/% cannot be %d', OLD."clientId", OLD."eventId", lower(TG_OP) USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS virtual_event_append_only ON "VirtualEventRaw";
CREATE TRIGGER virtual_event_append_only BEFORE UPDATE OR DELETE ON "VirtualEventRaw"
  FOR EACH ROW EXECUTE FUNCTION virtual_event_append_only();
