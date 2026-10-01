-- 2S2-FE-03 — the athlete requests a change to a SENT offer. The offer's own
-- row is untouched (its terms are fixed once sent — offer_terms_immutable);
-- each request is its own row, routed to BTG's campaign managers.
CREATE TABLE "OfferChangeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferChangeRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OfferChangeRequest_note_check" CHECK (length(btrim("note")) BETWEEN 1 AND 2000)
);
CREATE INDEX "OfferChangeRequest_tenantId_offerId_idx" ON "OfferChangeRequest"("tenantId", "offerId");
ALTER TABLE "OfferChangeRequest" ADD CONSTRAINT "OfferChangeRequest_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
