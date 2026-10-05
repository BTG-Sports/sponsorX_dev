-- 2S5-INT-02 — the payment provider's word, recorded once, applied forward only.
-- (documentation/SponsorX-Phase2-State-Machines.md §5.)

-- ── PaymentEvent: one row per provider event, in SponsorX's own words ──────
-- Unique per (provider, event id), so a duplicate delivery is a no-op. The
-- webhook writes it RECEIVED and queues it; the worker applies it.
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "subjectRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "outcome" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentEvent_provider_providerEventId_key" ON "PaymentEvent"("provider", "providerEventId");
CREATE INDEX "PaymentEvent_tenantId_status_idx" ON "PaymentEvent"("tenantId", "status");
CREATE INDEX "PaymentEvent_status_nextAttemptAt_idx" ON "PaymentEvent"("status", "nextAttemptAt");
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_type_check" CHECK ("type" IN (
  'payment.processing', 'payment.succeeded', 'payment.failed', 'payment.refunded',
  'dispute.opened', 'dispute.closed', 'payout.paid', 'payout.failed', 'payout.returned'));
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_status_check"
  CHECK ("status" IN ('RECEIVED', 'APPLIED', 'IGNORED', 'DEFERRED', 'HELD', 'FAILED'));
-- A deferred event (it arrived before what it follows) has its next try; nothing else does.
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_deferred_check"
  CHECK (("status" = 'DEFERRED') = ("nextAttemptAt" IS NOT NULL));
-- Applied, ignored or held for BTG: a final word, with when and what.
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_settled_check"
  CHECK ("status" NOT IN ('APPLIED', 'IGNORED', 'HELD', 'FAILED') OR ("appliedAt" IS NOT NULL AND "outcome" IS NOT NULL));
-- Only an exception BTG had to look at is closed by a person, with a note.
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_resolved_check"
  CHECK (("resolvedAt" IS NULL) = ("resolvedBy" IS NULL) AND ("resolvedAt" IS NULL OR ("status" IN ('HELD', 'FAILED') AND length(btrim(coalesce("resolutionNote", ''))) > 0)));

-- ── PaymentAttempt: the payment's own states, forward only ─────────────────
ALTER TABLE "PaymentAttempt" ADD COLUMN "refundedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_state_check"
  CHECK ("state" IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'));
-- Never refunded beyond what was captured; the refund states say how much.
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_refunded_check" CHECK (
  "refundedCents" >= 0 AND "refundedCents" <= "amountCents"
  AND (("state" = 'REFUNDED') = ("refundedCents" = "amountCents" AND "refundedCents" > 0))
  AND (("state" = 'PARTIALLY_REFUNDED') = ("refundedCents" > 0 AND "refundedCents" < "amountCents"))
  AND ("state" NOT IN ('PENDING', 'PROCESSING', 'FAILED') OR "refundedCents" = 0));

