# 2026-11-16 — rcfworks

## CI fix on #427
- `student-assignments.test.ts`'s audit test failed on #427's CI: two steps written in the same millisecond came back in the wrong order. It now orders by time, then by id. The fix was merged up through #428, #429 and today's branch.

## App review wave 5–6 (PR A, `fix/POL-71-75-app-review-waves-5-6`, stacked on #429)
- **POL-71:**
  - The empty sponsor dashboard shows "Needs you" (a Shop order to pay, requests with BTG).
  - `/brief` says what really happens.
  - Viewers can't request.
  - The role reads "Sponsor Viewer" everywhere.
  - `POST /sponsor/team/:id/restore` adds back a removed teammate. A login BTG switched off stays off.
- **POL-72:**
  - While payments are closed, approved orders read "Approved" (`paymentsOpen` on the orders summary and the sponsor overview).
  - The spending limit shows at checkout (`checkout.spendingLimitCents`).
  - Shop listings get "More", and "Order again" goes to the Shop.
  - Job names come from the live catalogue, with a "Ready to staff" filter.
  - Intelligence has one name.
  - Billing points Shop-only sponsors to Orders.
  - Staff see "Not in your role" on Packages.
  - BTG can edit a sponsor's categories.
- **POL-73:**
  - Payout emails link to `/payouts/<id>`, which opens each reader's own workspace.
  - Approved payouts get a `waiting` reason, and the API reports the active provider.
  - The Treasury tile opens the tab that has something in it (`needsYou.payouts.requested`).
  - Payouts has a "Sent back" tab.
  - VOIDED reads "Voided — nothing owed".
  - The refund wording is fixed.
  - Finance sees committed revenue on editions as a total only (no slot read).
- **POL-74:**
  - Integration health marks parked Zoho jobs, and the board says "Zoho not connected".
  - Pricing and Forecasts say they update nightly at 19:00 UTC.
  - Attribution gets a Partners panel.
  - New doc: `documentation/SponsorX-Testing-on-Staging.md`.
- **POL-75:**
  - The team manager's dashboard gets buttons, and Settings drops the sample links.
  - The item form gets Package rules. Bundle-only isn't enforced anywhere, so it isn't offered.
  - Each deal holding a closure links to where it's settled (`campaignId` and `orderId` on live deals).
  - Settings gets a Notifications section in every portal.
- **Leftovers:**
  - POL-68: confirmation links on offers and inventory.
  - POL-69: athletes can open their versions, one name per page, and Confirmations is in the menu.
- **Local CI:**
  - Lint, security scripts and secret scan all pass.
  - Both builds pass.
  - Backend: 265 files, 3,832 tests. Frontend: 186 files, 2,146 tests.
  - E2E wasn't run locally: it needs Redis and Clerk test keys. CI runs it.

## Next
- PR B: POL-76 (NEXT applicant emails), POL-77 (NEXT public pages, QR, "This edition", roster box), POL-BE-69 (a guardian's signature counts in profile completion), POL-78 (`polish.md` corrections).
