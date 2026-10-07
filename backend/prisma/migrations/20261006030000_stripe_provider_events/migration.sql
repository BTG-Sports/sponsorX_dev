-- 2S5-INT-01 / 2S5-INT-03 — Stripe. Two more provider-neutral event types
-- (contracts/payment-events.ts): a payee's payout account at the provider,
-- ready or not (account.updated), and something the provider reported that
-- SponsorX must not act on by itself, always held for BTG (provider.notice).
ALTER TABLE "PaymentEvent" DROP CONSTRAINT "PaymentEvent_type_check";
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_type_check" CHECK ("type" IN (
  'payment.processing', 'payment.succeeded', 'payment.failed', 'payment.refunded',
  'dispute.opened', 'dispute.closed', 'payout.paid', 'payout.failed', 'payout.returned',
  'account.updated', 'provider.notice'));
