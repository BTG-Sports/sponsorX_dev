-- 2S4-BE-06 / 2S4-BE-07 / 2S4-BE-08 — a contracted order line as its sellers
-- see it, and its delivery: marked by the seller with a note, confirmed by
-- the sponsor (or by 24 hours of silence, or by BTG), or a problem BTG
-- resolves. Written when the order is contracted; the line itself is never
-- rewritten (marketplace_order_immutable.sql), so its delivery lives here.
CREATE TABLE "OrderLineDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "propertyId" TEXT,
    "propertyTenantId" TEXT,
    "athleteId" TEXT,
    "athleteTenantId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "deliveredBy" TEXT,
    "deliveredByName" TEXT,
    "note" TEXT,
    "proofKey" TEXT,
    "proofLink" TEXT,
    "confirmDueAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "confirmedHow" TEXT,
    "problemAt" TIMESTAMP(3),
    "problemBy" TEXT,
    "problemNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "resolutionNote" TEXT,
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderLineDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrderLineDelivery_lineId_key" ON "OrderLineDelivery"("lineId");
CREATE INDEX "OrderLineDelivery_tenantId_state_idx" ON "OrderLineDelivery"("tenantId", "state");
CREATE INDEX "OrderLineDelivery_orderId_idx" ON "OrderLineDelivery"("orderId");
CREATE INDEX "OrderLineDelivery_propertyTenantId_propertyId_idx" ON "OrderLineDelivery"("propertyTenantId", "propertyId");
CREATE INDEX "OrderLineDelivery_athleteTenantId_athleteId_idx" ON "OrderLineDelivery"("athleteTenantId", "athleteId");
CREATE INDEX "OrderLineDelivery_tenantId_sponsorId_idx" ON "OrderLineDelivery"("tenantId", "sponsorId");
ALTER TABLE "OrderLineDelivery" ADD CONSTRAINT "OrderLineDelivery_lineId_fkey"
    FOREIGN KEY ("lineId") REFERENCES "MarketplaceOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderLineDelivery" ADD CONSTRAINT "OrderLineDelivery_state_check"
  CHECK ("state" IN ('UNPAID', 'IN_DELIVERY', 'DELIVERED', 'CONFIRMED', 'PROBLEM', 'REFUNDED', 'CANCELLED'));
ALTER TABLE "OrderLineDelivery" ADD CONSTRAINT "OrderLineDelivery_how_check"
  CHECK ("confirmedHow" IS NULL OR "confirmedHow" IN ('SPONSOR', 'SILENCE', 'BTG'));
ALTER TABLE "OrderLineDelivery" ADD CONSTRAINT "OrderLineDelivery_resolution_check"
  CHECK ("resolution" IS NULL OR "resolution" IN ('CONFIRMED', 'REFUNDED'));
-- A seller to read it: a team (with its tenant), an athlete (with theirs), or both.
ALTER TABLE "OrderLineDelivery" ADD CONSTRAINT "OrderLineDelivery_seller_check" CHECK (
  ("propertyId" IS NOT NULL OR "athleteId" IS NOT NULL)
  AND (("propertyId" IS NULL) = ("propertyTenantId" IS NULL))
  AND (("athleteId" IS NULL) = ("athleteTenantId" IS NULL))
);
-- Each state carries what made it: a mark carries its note and the sponsor's
-- window; a confirmation its time and how; a problem the sponsor's words.
ALTER TABLE "OrderLineDelivery" ADD CONSTRAINT "OrderLineDelivery_shape_check" CHECK (
  ("state" <> 'DELIVERED' OR ("deliveredAt" IS NOT NULL AND "confirmDueAt" IS NOT NULL AND length(btrim(coalesce("note", ''))) > 0))
  AND ("state" <> 'CONFIRMED' OR ("confirmedAt" IS NOT NULL AND "confirmedHow" IS NOT NULL))
  AND ("state" <> 'PROBLEM' OR ("problemAt" IS NOT NULL AND length(btrim(coalesce("problemNote", ''))) > 0))
  AND ("proofLink" IS NULL OR "proofLink" LIKE 'https://%')
);

-- Orders contracted before this table existed: one row per line, in the state
-- its order is in. A FULFILLED or CLOSED order's lines count as confirmed by
-- BTG when it was fulfilled — that is how they were paid out until now.
INSERT INTO "OrderLineDelivery" (
    "id", "tenantId", "orderId", "lineId", "sponsorId", "propertyId", "propertyTenantId", "athleteId", "athleteTenantId",
    "state", "paidAt", "confirmedAt", "confirmedBy", "confirmedHow"
)
SELECT
    'old_' || l."id", o."tenantId", o."id", l."id", o."sponsorId",
    l."propertyId", p."tenantId",
    a."id", a."tenantId",
    CASE o."state"::text
        WHEN 'APPROVED' THEN 'UNPAID' WHEN 'AWAITING_PAYMENT' THEN 'UNPAID'
        WHEN 'PAID' THEN 'IN_DELIVERY' WHEN 'IN_DELIVERY' THEN 'IN_DELIVERY'
        WHEN 'FULFILLED' THEN 'CONFIRMED' WHEN 'CLOSED' THEN 'CONFIRMED'
        WHEN 'REFUNDED' THEN 'REFUNDED' ELSE 'CANCELLED' END,
    CASE WHEN o."state"::text IN ('PAID', 'IN_DELIVERY', 'FULFILLED', 'CLOSED', 'REFUNDED') THEN o."updatedAt" END,
    CASE WHEN o."state"::text IN ('FULFILLED', 'CLOSED') THEN coalesce(o."fulfilledAt", o."updatedAt") END,
    CASE WHEN o."state"::text IN ('FULFILLED', 'CLOSED') THEN 'system' END,
    CASE WHEN o."state"::text IN ('FULFILLED', 'CLOSED') THEN 'BTG' END
FROM "MarketplaceOrderLine" l
JOIN "MarketplaceOrder" o ON o."id" = l."orderId"
LEFT JOIN "Property" p ON p."id" = l."propertyId"
LEFT JOIN "InventoryItem" i ON i."id" = l."inventoryItemId"
LEFT JOIN "Athlete" a ON a."id" = coalesce(l."sellerAthleteId", i."athleteId")
WHERE o."contractedAt" IS NOT NULL
  AND (l."propertyId" IS NOT NULL OR a."id" IS NOT NULL)
ON CONFLICT ("lineId") DO NOTHING;

-- 2S2-BE-05 — a team invites an athlete already on SponsorX. Nobody is linked
-- without accepting; one open invitation per team and athlete.
CREATE TABLE "TeamInvitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "athleteTenantId" TEXT NOT NULL,
    "teamShareBps" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "invitedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamInvitation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TeamInvitation_tenantId_propertyId_state_idx" ON "TeamInvitation"("tenantId", "propertyId", "state");
CREATE INDEX "TeamInvitation_athleteTenantId_athleteId_state_idx" ON "TeamInvitation"("athleteTenantId", "athleteId", "state");
CREATE UNIQUE INDEX "TeamInvitation_one_open" ON "TeamInvitation"("propertyId", "athleteId") WHERE "state" = 'PENDING';
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_state_check"
  CHECK ("state" IN ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN'));
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_share_check"
  CHECK ("teamShareBps" BETWEEN 0 AND 10000);
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_decided_check"
  CHECK (("state" = 'PENDING') = ("decidedAt" IS NULL));
