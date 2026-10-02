-- 2S4-BE-13 — "a row for every refund of money actually received": a card
-- payment the provider confirms after its order was cancelled is owed back
-- too. A whole-order row (lineId null) for the amount received.
ALTER TABLE "RefundDue" DROP CONSTRAINT "RefundDue_cause_check";
ALTER TABLE "RefundDue" ADD CONSTRAINT "RefundDue_cause_check" CHECK ("cause" IN (
  'SPONSOR_CANCELLED', 'SELLER_CANCELLED', 'CANCELLATION_AGREED', 'PROBLEM_AGREED', 'BTG_DECIDED', 'BTG_REFUNDED_ORDER',
  'PAID_AFTER_CANCELLATION'));
