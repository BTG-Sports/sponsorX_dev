-- 2S4-BE-11 — delivery problems settled between the seller and the sponsor
-- (programme owner, 2026-10-02). A reported problem goes to the SELLER first
-- (72 hours: deliver again, refund, or disagree), then back to the SPONSOR
-- (72 hours: accept or reject). BTG steps in only when they can't settle it:
-- the sponsor rejects, or either side doesn't answer in time. A line with
-- nothing marked delivered 7 days after its last date also goes to BTG.

-- The delivery row: the second reminder, the 7-day hand-over, and the date
-- the seller agreed to deliver again on.
ALTER TABLE "OrderLineDelivery" ADD COLUMN "secondRemindedAt" TIMESTAMP(3);
ALTER TABLE "OrderLineDelivery" ADD COLUMN "overdueEscalatedAt" TIMESTAMP(3);
ALTER TABLE "OrderLineDelivery" ADD COLUMN "redeliverOn" TIMESTAMP(3);

CREATE TABLE "DeliveryIssue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "openedBy" TEXT,
    "problemNote" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3),
    "markedByName" TEXT,
    "markedNote" TEXT,
    "markedProofKey" TEXT,
    "markedProofLink" TEXT,
    "sellerDueAt" TIMESTAMP(3),
    "sellerAnswer" TEXT,
    "sellerAnsweredAt" TIMESTAMP(3),
    "sellerAnsweredBy" TEXT,
    "sellerAnsweredByName" TEXT,
    "sellerNote" TEXT,
    "redeliverOn" TIMESTAMP(3),
    "sellerProofKey" TEXT,
    "sellerProofLink" TEXT,
    "sponsorDueAt" TIMESTAMP(3),
    "sponsorAnswer" TEXT,
    "sponsorAnsweredAt" TIMESTAMP(3),
    "sponsorAnsweredBy" TEXT,
    "sponsorNote" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "escalationReason" TEXT,
    "escalationNote" TEXT,
    "outcome" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "closingNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryIssue_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeliveryIssue_tenantId_stage_idx" ON "DeliveryIssue"("tenantId", "stage");
CREATE INDEX "DeliveryIssue_deliveryId_idx" ON "DeliveryIssue"("deliveryId");
CREATE INDEX "DeliveryIssue_stage_sellerDueAt_idx" ON "DeliveryIssue"("stage", "sellerDueAt");
CREATE INDEX "DeliveryIssue_stage_sponsorDueAt_idx" ON "DeliveryIssue"("stage", "sponsorDueAt");
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_deliveryId_fkey"
    FOREIGN KEY ("deliveryId") REFERENCES "OrderLineDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one open issue per line.
CREATE UNIQUE INDEX "DeliveryIssue_one_open_per_line"
    ON "DeliveryIssue"("deliveryId") WHERE "stage" IN ('SELLER_TO_ANSWER', 'SPONSOR_TO_ANSWER', 'ESCALATED');

ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_kind_check" CHECK ("kind" IN ('PROBLEM', 'OVERDUE'));
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_stage_check"
  CHECK ("stage" IN ('SELLER_TO_ANSWER', 'SPONSOR_TO_ANSWER', 'ESCALATED', 'SETTLED', 'RESOLVED', 'CLOSED'));
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_seller_answer_check"
  CHECK ("sellerAnswer" IS NULL OR "sellerAnswer" IN ('DELIVER_AGAIN', 'REFUND', 'DISAGREE'));
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_sponsor_answer_check"
  CHECK ("sponsorAnswer" IS NULL OR "sponsorAnswer" IN ('ACCEPT', 'REJECT'));
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_reason_check"
  CHECK ("escalationReason" IS NULL OR "escalationReason" IN ('SPONSOR_REJECTED', 'SELLER_NO_ANSWER', 'SPONSOR_NO_ANSWER', 'NOT_DELIVERED', 'REPORTED_TO_BTG'));
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_outcome_check"
  CHECK ("outcome" IS NULL OR "outcome" IN ('REDELIVER', 'REFUNDED', 'CONFIRMED', 'MARKED_DELIVERED', 'ORDER_ENDED'));

-- Each stage carries what made it.
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_shape_check" CHECK (
  length(btrim("problemNote")) > 0
  -- The seller's turn: a deadline, no answer yet.
  AND ("stage" <> 'SELLER_TO_ANSWER' OR ("kind" = 'PROBLEM' AND "sellerDueAt" IS NOT NULL AND "sellerAnswer" IS NULL))
  -- The sponsor's turn: the seller has answered; a deadline, no answer yet.
  AND ("stage" <> 'SPONSOR_TO_ANSWER' OR ("kind" = 'PROBLEM' AND "sellerAnswer" IS NOT NULL AND "sponsorDueAt" IS NOT NULL AND "sponsorAnswer" IS NULL))
  -- With BTG, or decided by BTG: why it went there is always recorded.
  AND ("stage" NOT IN ('ESCALATED', 'RESOLVED') OR ("escalatedAt" IS NOT NULL AND "escalationReason" IS NOT NULL AND length(btrim(coalesce("escalationNote", ''))) > 0))
  -- Open has no outcome; finished has one, and when.
  AND (("stage" IN ('SELLER_TO_ANSWER', 'SPONSOR_TO_ANSWER', 'ESCALATED')) = ("outcome" IS NULL AND "closedAt" IS NULL))
  -- BTG decides only confirmed or refunded, with a note everyone reads.
  AND ("stage" <> 'RESOLVED' OR ("outcome" IN ('CONFIRMED', 'REFUNDED') AND length(btrim(coalesce("closingNote", ''))) > 0))
  -- An answer carries what it needs.
  AND ("sellerAnswer" IS NULL OR ("sellerAnsweredAt" IS NOT NULL))
  AND ("sellerAnswer" IS DISTINCT FROM 'DELIVER_AGAIN' OR ("redeliverOn" IS NOT NULL AND length(btrim(coalesce("sellerNote", ''))) > 0))
  AND ("sellerAnswer" IS DISTINCT FROM 'DISAGREE' OR length(btrim(coalesce("sellerNote", ''))) > 0)
  AND ("sponsorAnswer" IS NULL OR "sponsorAnsweredAt" IS NOT NULL)
  AND ("sponsorAnswer" IS DISTINCT FROM 'REJECT' OR length(btrim(coalesce("sponsorNote", ''))) > 0)
  -- An overdue hand-over has no exchange.
  AND ("kind" <> 'OVERDUE' OR ("sellerAnswer" IS NULL AND "sponsorAnswer" IS NULL))
  AND ("sellerProofLink" IS NULL OR "sellerProofLink" LIKE 'https://%')
  AND ("markedProofLink" IS NULL OR "markedProofLink" LIKE 'https://%')
);

-- Problems reported before this change were BTG's to decide from the start:
-- each becomes an issue handed to BTG when it was reported — still open
-- (PROBLEM), or decided (a resolution on the row) — so its history reads the
-- same as a new one's.
INSERT INTO "DeliveryIssue" (
    "id", "tenantId", "orderId", "lineId", "deliveryId", "kind", "stage", "openedAt", "openedBy", "problemNote",
    "markedAt", "markedByName", "markedNote", "markedProofKey", "markedProofLink",
    "escalatedAt", "escalationReason", "escalationNote", "outcome", "closedAt", "closedBy", "closingNote"
)
SELECT
    'old_' || d."id", d."tenantId", d."orderId", d."lineId", d."id", 'PROBLEM',
    CASE WHEN d."state" = 'PROBLEM' THEN 'ESCALATED' ELSE 'RESOLVED' END,
    d."problemAt", d."problemBy", d."problemNote",
    d."deliveredAt", d."deliveredByName", d."note", d."proofKey", d."proofLink",
    d."problemAt", 'REPORTED_TO_BTG', 'Reported before sellers answered problems themselves, so BTG decides',
    CASE WHEN d."state" = 'PROBLEM' THEN NULL ELSE d."resolution" END,
    CASE WHEN d."state" = 'PROBLEM' THEN NULL ELSE d."resolvedAt" END,
    CASE WHEN d."state" = 'PROBLEM' THEN NULL ELSE d."resolvedBy" END,
    CASE WHEN d."state" = 'PROBLEM' THEN NULL ELSE d."resolutionNote" END
FROM "OrderLineDelivery" d
WHERE d."problemAt" IS NOT NULL AND length(btrim(coalesce(d."problemNote", ''))) > 0
  AND (d."state" = 'PROBLEM' OR (d."resolution" IS NOT NULL AND d."resolvedAt" IS NOT NULL AND length(btrim(coalesce(d."resolutionNote", ''))) > 0));
