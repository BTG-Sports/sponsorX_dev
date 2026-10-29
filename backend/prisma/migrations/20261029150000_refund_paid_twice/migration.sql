-- POL-BE-06 — a sponsor who pays twice is refunded. A card payment confirmed
-- after the order was refunded (PAID_AFTER_REFUND), or after it was already
-- paid (PAID_TWICE), gets a row on "Refunds to send" per card attempt, as one
-- confirmed after a cancellation does: the rows name the attempt, are unique
-- by it, and leave the one-whole-order-row rule.
ALTER TABLE "RefundDue" DROP CONSTRAINT "RefundDue_cause_check";
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_cause_check" CHECK ("cause" IN (
  'SPONSOR_CANCELLED', 'SELLER_CANCELLED', 'CANCELLATION_AGREED', 'PROBLEM_AGREED', 'BTG_DECIDED', 'BTG_REFUNDED_ORDER',
  'PAID_AFTER_CANCELLATION', 'PAID_AFTER_REFUND', 'PAID_TWICE',
  'EDITION_CANCELLED', 'PAID_AFTER_EDITION_CANCELLED', 'PROVIDER_REFUNDED'));
ALTER TABLE "RefundDue" DROP CONSTRAINT "RefundDue_attempt_check";
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_attempt_check"
  CHECK (("cause" IN ('PAID_AFTER_CANCELLATION', 'PAID_AFTER_REFUND', 'PAID_TWICE', 'PAID_AFTER_EDITION_CANCELLED')) = ("attemptId" IS NOT NULL));
DROP INDEX "RefundDue_one_per_attempt";
CREATE UNIQUE INDEX "RefundDue_one_per_attempt" ON "RefundDue"("attemptId")
  WHERE "cause" IN ('PAID_AFTER_CANCELLATION', 'PAID_AFTER_REFUND', 'PAID_TWICE');
DROP INDEX "RefundDue_one_whole_order";
CREATE UNIQUE INDEX "RefundDue_one_whole_order" ON "RefundDue"("orderId")
  WHERE "lineId" IS NULL AND "cause" NOT IN ('PAID_AFTER_CANCELLATION', 'PAID_AFTER_REFUND', 'PAID_TWICE');
