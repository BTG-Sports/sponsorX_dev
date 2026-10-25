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
  - **Retested and fixed:** the user pasted the new function into Books. An edit to INV-000001 reached staging at 04:32 UTC, signed and APPLIED, with `paidAt` 2026-10-25, and the invoice copy now carries the date. **P8-OPS-04 is Done.**
  - The retest can't show which source supplied the date (the full invoice, or the today fallback), because both give 2026-10-25. If the read failed, Books' Workflow Logs would show "Could not read the full invoice".
- **How to check staging:** `railway ssh --environment staging --service api`, then `cd /app/backend && npm run -s db:read -- "<SQL>"`. The staging database has no public address.
- **Test records left in the live Books org:** the customer, INV-000001 and its payment. They are marked as tests.

## P8-SEC-05 — body-parser, zod and fast-uri advisories patched → Done

- **Why:** new advisories turned CI's dependency scan red on every branch (#297 included).
  - `body-parser` 2.3.0, through express (high, production).
  - `zod` 4.6.5 (high, production).
  - `fast-uri` 3.1.8, through ajv (moderate ×4, dev only).
- **Fix (#298):** `body-parser` 2.4.0, `zod` 4.6.7 (pinned in both workspaces) and `fast-uri` 3.1.9; no major-version changes.
- **Checked locally:**
  - `audit:check` and `secrets:scan` clean; both builds and lint pass.
  - Backend 3,511 and frontend 1,681 tests pass.
  - e2e `redeem-flow`, `public` and `public-links`: 31 pass, 1 skipped by design.
  - Ran on a portable Postgres 17 again (the memory note's recipe).
- **CI pinned to `ubuntu-24.04`:** `ubuntu-latest` moved to Ubuntu 26.04 today, and Playwright 1.63 won't install Chromium there ("does not support chromium on ubuntu26.04-x64"). Both test jobs failed before any test ran. A comment in `ci.yml` says to remove the pin once Playwright supports 26.04.
- **Merge order:** #299 (the sync to `main`) merged 19 s before #297, so `main` missed the P8-OPS-04 Done records. The sync PR #300 brings them over (docs only).
- **Deployed:** `deploy-daily.yml` moved `release` to `a87b4713`, and all four services (api and web, staging and production) deployed successfully.
  - Staging runs `zod@4.6.7` and `body-parser@2.4.0`.
  - Health, `/join`, the webhook paths (401 unsigned) and the protected API (401) answer as expected in both environments.
- **Disk:** the Mac ran out of space mid-check. With the user's OK, `frontend/.next`, the npm cache and the VS Code and Skype updater caches were deleted, leaving about 7 GB free.

## Tracker sync — the Sheet endpoint has been 404 since mid-October (diagnosed, not fixed)

- **Last good write:** 2026-10-11 22:09 UTC (`Sheet: 0 cell(s) updated, 2 row(s) added`). Every run that has written to the Sheet since 2026-10-15 got `HTTP Error 404`. The two "successful" runs in between (10-15 09:40, 10-19 03:30) only did the end-of-day summary and never touched the Sheet.
- **Not our side:** the GitHub secret `SHEET_ENDPOINT_URL` was last set 2026-09-25. The Apps Script web app behind it was most likely archived or redeployed under a new URL between 10-11 and 10-15.
- **Can't be checked from here:** the Drive connector's account (infinex1) can't see the Sheet. Listing the script's deployments with the 2026-09-25 clasp login was blocked by the safety check.
- **Fix (Sheet owner):** Extensions → Apps Script → Deploy → Manage deployments. If the web app is gone, create a new Web app deployment (execute as me, access: anyone). Then set the new `/exec` URL as `SHEET_ENDPOINT_URL` and re-run the failed workflow.
