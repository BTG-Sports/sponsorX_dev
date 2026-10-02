-- 2S4-BE-13 — money received must never be missing from Finance's list. A
-- card payment confirmed after its order was cancelled gets a row per card
-- attempt (two attempts confirmed after one cancellation are two refunds),
-- so those rows leave the one-whole-order-row rule and are unique by attempt.
ALTER TABLE "RefundDue" ADD COLUMN "attemptId" TEXT;
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_attempt_check"
  CHECK (("cause" = 'PAID_AFTER_CANCELLATION') = ("attemptId" IS NOT NULL));
CREATE UNIQUE INDEX "RefundDue_one_per_attempt" ON "RefundDue"("attemptId") WHERE "cause" = 'PAID_AFTER_CANCELLATION';
DROP INDEX "RefundDue_one_whole_order";
CREATE UNIQUE INDEX "RefundDue_one_whole_order" ON "RefundDue"("orderId") WHERE "lineId" IS NULL AND "cause" <> 'PAID_AFTER_CANCELLATION';
