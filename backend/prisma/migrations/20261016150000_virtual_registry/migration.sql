-- 4S1-BE-01/02/03 — virtual worlds, their zones and placements
-- (documentation/SponsorX-Virtual-Registry.md, SponsorX-Virtual-Taxonomy.md).

-- CreateTable
CREATE TABLE "VirtualWorld" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "runtime" TEXT,
    "runtimeVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VirtualWorld_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirtualZone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "parentId" TEXT,
    "level" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VirtualZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirtualPlacement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "zoneId" TEXT,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "widthPx" INTEGER NOT NULL,
    "heightPx" INTEGER NOT NULL,
    "creativeTypes" TEXT[],
    "maxBytes" INTEGER NOT NULL,
    "maxVideoSeconds" INTEGER,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "viewabilityRule" TEXT NOT NULL,
    "rackPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "testStatus" TEXT NOT NULL DEFAULT 'UNTESTED',
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "inventoryItemId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VirtualPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VirtualWorld_tenantId_environment_externalId_key" ON "VirtualWorld"("tenantId", "environment", "externalId");

-- CreateIndex
CREATE INDEX "VirtualWorld_tenantId_propertyId_idx" ON "VirtualWorld"("tenantId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "VirtualZone_worldId_externalId_key" ON "VirtualZone"("worldId", "externalId");

-- CreateIndex
CREATE INDEX "VirtualZone_tenantId_worldId_idx" ON "VirtualZone"("tenantId", "worldId");

-- CreateIndex
CREATE UNIQUE INDEX "VirtualPlacement_worldId_externalId_key" ON "VirtualPlacement"("worldId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "VirtualPlacement_inventoryItemId_key" ON "VirtualPlacement"("inventoryItemId");

-- CreateIndex
CREATE INDEX "VirtualPlacement_tenantId_worldId_idx" ON "VirtualPlacement"("tenantId", "worldId");

-- The vocabulary, held by the database (SponsorX-Virtual-Taxonomy.md).
ALTER TABLE "VirtualWorld" ADD CONSTRAINT "VirtualWorld_values_check" CHECK (
  "environment" IN ('STAGING', 'PRODUCTION') AND "status" IN ('ACTIVE', 'RETIRED')
  AND "externalId" ~ '^[A-Za-z0-9._-]{1,64}$'
);
ALTER TABLE "VirtualZone" ADD CONSTRAINT "VirtualZone_values_check" CHECK (
  "level" IN ('DISTRICT', 'VENUE', 'ZONE') AND "status" IN ('ACTIVE', 'RETIRED')
  AND "externalId" ~ '^[A-Za-z0-9._-]{1,64}$'
);
ALTER TABLE "VirtualPlacement" ADD CONSTRAINT "VirtualPlacement_values_check" CHECK ((
  "kind" IN ('BILLBOARD', 'LED_SCREEN', 'NAMING_RIGHTS', 'BRANDED_ROOM', 'COURT', 'TUNNEL', 'KIOSK')
  AND "state" IN ('DRAFT', 'AVAILABLE', 'RETIRED')
  AND "testStatus" IN ('UNTESTED', 'PASSED', 'FAILED')
  AND "externalId" ~ '^[A-Za-z0-9._-]{1,64}$'
  AND cardinality("creativeTypes") > 0 AND "creativeTypes" <@ ARRAY['IMAGE', 'VIDEO', 'LOGO']
  AND ("maxVideoSeconds" IS NOT NULL) = ('VIDEO' = ANY("creativeTypes"))
  AND "widthPx" > 0 AND "heightPx" > 0 AND "maxBytes" > 0 AND "capacity" >= 1 AND "rackPriceCents" > 0
  AND ("availableUntil" IS NULL OR "availableFrom" IS NULL OR "availableUntil" > "availableFrom")
  -- 4S1-BE-03: an available placement is always sellable inventory.
  AND ("state" <> 'AVAILABLE' OR "inventoryItemId" IS NOT NULL)
) IS TRUE);

-- Stable IDs (SponsorX-INFINEX-World-Contract.md §3): an external ID never
-- changes, a zone never changes level or parent, a placement never moves,
-- and nothing is deleted — so no ID is ever reused. A retired row stays.
-- Deleting is allowed only where `sponsorx.audit_purge` is on (test databases).
CREATE OR REPLACE FUNCTION virtual_ids_are_fixed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('sponsorx.audit_purge', true) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION '% rows are retired, never deleted, so their IDs are never reused', TG_TABLE_NAME;
  END IF;
  IF NEW."externalId" IS DISTINCT FROM OLD."externalId" OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" THEN
    RAISE EXCEPTION 'An external ID never changes (%)', TG_TABLE_NAME;
  END IF;
  -- One table's fields at a time: PL/pgSQL would fail on a field another table has.
  IF TG_TABLE_NAME = 'VirtualWorld' THEN
    IF NEW."environment" IS DISTINCT FROM OLD."environment" OR NEW."propertyId" IS DISTINCT FROM OLD."propertyId" THEN
      RAISE EXCEPTION 'A world keeps its environment and owner';
    END IF;
  ELSIF TG_TABLE_NAME = 'VirtualZone' THEN
    IF NEW."worldId" IS DISTINCT FROM OLD."worldId" OR NEW."level" IS DISTINCT FROM OLD."level" OR NEW."parentId" IS DISTINCT FROM OLD."parentId" THEN
      RAISE EXCEPTION 'A zone keeps its world, level and parent';
    END IF;
  ELSIF TG_TABLE_NAME = 'VirtualPlacement' THEN
    IF NEW."worldId" IS DISTINCT FROM OLD."worldId" OR NEW."zoneId" IS DISTINCT FROM OLD."zoneId" THEN
      RAISE EXCEPTION 'A placement never moves; a surface somewhere else is a new placement';
    END IF;
    IF OLD."state" = 'RETIRED' AND NEW."state" <> 'RETIRED' THEN
      RAISE EXCEPTION 'A retired placement stays retired';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "VirtualWorld_ids_fixed" BEFORE UPDATE OR DELETE ON "VirtualWorld" FOR EACH ROW EXECUTE FUNCTION virtual_ids_are_fixed();
CREATE TRIGGER "VirtualZone_ids_fixed" BEFORE UPDATE OR DELETE ON "VirtualZone" FOR EACH ROW EXECUTE FUNCTION virtual_ids_are_fixed();
CREATE TRIGGER "VirtualPlacement_ids_fixed" BEFORE UPDATE OR DELETE ON "VirtualPlacement" FOR EACH ROW EXECUTE FUNCTION virtual_ids_are_fixed();
