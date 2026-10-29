# 2026-10-29 — tasks completed

### Pulled and synced (HeckerCreatives)

- `feature/P8-FE-10-featured-athletes` had merged (PR #310); `main_development` is even with `main` at bc12bc0b.
- New since the last sync: the polish list (`documentation/polish.md`, the **Polish** tracker sheet), `P8-BE-09/10/11` done, `POL-BE-01` and `POL-BE-04` done, the Stripe live key installed with payments still off.
- **The owner's call stands:** the polish list before anything else on the board.

### Twenty frontend tasks built, on `feature/POL-FE-batch-P8-FE-11-12` (HeckerCreatives)

Every frontend task whose backend is done, or that needs no backend, in five commits by task group. All at **Code review** in the tracker: built and tested, not yet walked in a browser.

- **`P8-FE-11` document checks on screen.** `lib/document-checks-live.ts` + `components/document-check.tsx` + `legal-name-decision.tsx`. Uploads show "Checking your document…", the API's 422 reason with Try again, and "BTG asked for a new one: …" where the person's own read carries the sent-back document. BTG's four review screens show Clear / Flagged with findings / "Couldn't read — check it by eye", a Send back button with a reason dialog, and no View on a sent-back document. Held legal names get Apply, Decline and Send ID back.
  - **Limit:** the intake status, guardian set-up, coming-of-age, public handoff status and `GET /property/documents` filter sent-back documents out, so there the row goes back to "still needed" and the reason arrives by email. The `returned` prop is wired for when the API exposes it.
- **`P8-FE-12` cancel and change a campaign.** `lib/campaign-change-live.ts` types the `P8-BE-12` contract; `server/campaign-change.ts` makes the six calls and **turns a 404 into "Not available yet"**, so the screens ship before the API. Change campaign and Cancel campaign on `/sponsor/campaigns/{id}` (sponsor admin) and `/admin/campaigns/{id}` (BTG by role and stage); the impact modal (headline, groups, money, hold note, Send to BTG, refusals); the outcome dialog; and `/admin/campaign-requests`, BTG's desk with Approve and Decline, in the admin nav and access list.
  - **For rcfworks:** the contract gives no row shape for `GET /campaign-requests`; the desk reads `requests` or `campaignRequests` with optional `state`, `decision`, `requestedBy`, `proposed`, `impact`. Budget is sent in cents.
- **Sponsor polish `POL-FE-04, 13, 20, 21, 28, 31, 32`.** Held orders say "Held for you — card payment opens soon; we'll email your pay-by date" with no countdown; `/sponsor/invoices` from the dashboard count and Billing; "Needs your OK" only when a post waits in `SPONSOR_REVIEW`, and `APPROVAL` reads "Ready to start"; request steps follow the real state; Confirm delivered asks first; failed card payments read in plain words; "Welcome" on a first sign-in.
- **Athlete, guardian and /join polish `POL-FE-01, 16, 24, 25, 26, 27, 33, 34`.** The Payouts page asks the new holder to set up their own account when payouts wait; `handoffCarryOver` reworded; Change guardian email at /join; `/athlete/orders` Campaign Orders list with Accept and a confirmed Decline (menu: "Campaign orders", marketplace "Sales"); Earnings and Payouts say the same; minors see "your guardian sets this up"; declining an invitation asks first; no sample screens for real athletes; Sign in on "You're approved".
- **`POL-FE-23, 30, 35`.** "Review by" on the content desk and a posts-to-review list on the BTG board, each opening the post at `/admin/approvals?open=<id>`; the unsubscribe fallback emails support; "Contact BTG" on the team's Documents and Roster pages emails support.

**Checked:** the whole frontend suite (159 files, 1,814 tests), `eslint` and `next build` pass on the branch.

### Gaps found for the backend (rcfworks) — each noted in `documentation/polish.md`

- **`POL-FE-04`:** nothing tells checkout payment is closed before an order exists. One line in `backend/src/domain/reservation.ts` (`paymentsOpen: paymentsOpen()` on the `checkout` object, around line 127) makes the checkout notice live.
- **`POL-FE-13`:** `GET /earnings/invoices` is gated on `earning` read, which sponsors don't have, so the page reads each campaign's invoices; and `CampaignInvoice` carries no pay URL, so "Pay →" is a `mailto:` to support until a `payUrl` field exists.
- **`POL-FE-23`:** the API returns no review deadline; the screen computes `waitingSince` + 48 h, never past `dueDate`. A `reviewBy` field would replace one function. The BTG reminder email could deep-link to `/admin/approvals?open=<id>`.
- **`POL-FE-24`:** there is no `GET /orders` list; the page is built from `GET /invitations?state=accepted`.

### Still open for the frontend

- Waiting on a backend row: `POL-FE-02, 03, 05, 06, 07, 08, 10, 11, 12, 15, 17, 18, 19, 22, 36`.
- Unowned: `5S1-FE-01`, `5S1-FE-02` (Certified Recruiting); `2S6-FE-01` blocked.
