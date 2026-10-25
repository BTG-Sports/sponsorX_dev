# 2026-10-25

## Zoho Books → SponsorX invoice webhook: tested end to end on staging (P8-OPS-04, new)

- **New task `P8-OPS-04`** was raised for this. There was no task ID. It's in the Phase 1 plan (Stage 8) and the tracker (Phase 1 row 320, In progress).

- **The Books rule:** the workflow rule "Send to SponsorX" in The Coffee Stage (Books org `763851111`) is saved and Active. It fires when an invoice's `CRM Deal ID` field (`cf_crm_deal_id`) is set.
- **The test:** made through the Zoho Books connector.
  - Customer "Test Sponsor (SponsorX test)".
  - Invoice **INV-000001** (`2943911000013569001`): one line, $10.00, CRM Deal ID `7554807000012994002`.
  - The deal belongs to staging marketplace order `cmuw8iols005i0cljbk6hz86g`.
- **Each step reached staging** (`WebhookDelivery`, signature verified, all APPLIED):
  - Draft at 04:10 UTC.
  - Sent at 04:17 UTC. The user sent the invoice by email, which marks it Sent; the connector has no "mark as sent" action.
  - Paid at 04:20 UTC. A $10.00 payment was recorded (payment `2943911000013573002`, Undeposited Funds, reference `SPONSORX-TEST`); balance 0.
  - `MarketplaceOrderInvoice` followed it: draft → sent → paid.
- **Two limits of this test:**
  - The order was already PAID (since 2026-10-06), so this test did not show an order moving AWAITING_PAYMENT → PAID. The code leaves an order that is already paid alone, as designed.
  - The paid update arrived without `paidAt`, so the invoice copy's `paidAt` is empty. Paid status is taken from `status`, so nothing breaks.
- **Paid-date fix (open):**
  - **Cause:** the function already sends `last_payment_date`, but the invoice Books hands a workflow rule leaves that field empty. The full invoice has it (2026-10-25).
  - **The fix:** `~/Desktop/sponsorx-books-script.txt` now reads the full invoice with `zoho.books.getRecordsByID` when a paid invoice has no date, and falls back to today.
  - **Next:** paste it into Books, retest, and move P8-OPS-04 to Done.
- **How to check staging:** `railway ssh --environment staging --service api`, then `cd /app/backend && npm run -s db:read -- "<SQL>"`. The staging database has no public address.
- **Test records left in the live Books org:** the customer, INV-000001 and its payment. They are marked as tests.
