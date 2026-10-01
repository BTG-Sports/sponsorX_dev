-- 2S4-FE-02 — the checkout's contract gate. A marketplace order is placed
-- only with the sponsor's acceptance of the MARKETPLACE_ORDER terms (an
-- AgreementAcceptance, written in the order's own transaction) and the
-- billing contact they confirmed, kept on the order as a snapshot.
--
-- Nullable because orders placed before the gate carry neither; the domain
-- (placeOrder, the only writer) never creates one without both. The CHECK
-- keeps the two together: an acceptance always comes with a billing contact
-- of the right shape, and a billing contact never comes without one. The
-- snapshot is fixed once written (marketplace_order_immutable.sql).
ALTER TABLE "MarketplaceOrder"
    ADD COLUMN "acceptanceId" TEXT,
    ADD COLUMN "billingName" TEXT,
    ADD COLUMN "billingEmail" TEXT,
    ADD COLUMN "billingReference" TEXT;

CREATE UNIQUE INDEX "MarketplaceOrder_acceptanceId_key" ON "MarketplaceOrder"("acceptanceId");

ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_acceptanceId_fkey"
    FOREIGN KEY ("acceptanceId") REFERENCES "AgreementAcceptance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_contract_gate_check" CHECK (
    ("acceptanceId" IS NULL AND "billingName" IS NULL AND "billingEmail" IS NULL AND "billingReference" IS NULL)
    OR (
        "acceptanceId" IS NOT NULL
        AND length(btrim("billingName")) BETWEEN 1 AND 200
        AND length("billingEmail") BETWEEN 3 AND 320 AND "billingEmail" LIKE '%_@_%'
        AND ("billingReference" IS NULL OR length(btrim("billingReference")) BETWEEN 1 AND 100)
    )
);
