# 2026-09-30 — tasks completed

## Raised: independent athletes can't sell (2S3-BE-05, 2S3-FE-02) — rcfworks, via Claude

Found while reviewing the walkthrough: only a property manager can put an item on
sale, so an athlete with no team can create inventory items that can never reach
the marketplace, and nothing tells them. The user called this dangerous — not all
athletes have a team — and chose **Option A**: independent athletes list their own
items, approved by BTG under the same rules, keeping the whole share.

- `2S3-BE-05` · Independent athletes list their own items (BE, 5d, Ready) —
  listings stop assuming a property; search, cart, orders, availability and the
  ledger split handle an athlete-owned listing; roster athletes still go through
  their team.
- `2S3-FE-02` · Listing screen for independent athletes (FE, 3d, Blocked on BE-05).

Added to `documentation/SponsorX-Phase2-Marketplace-Commerce.md` (Sprint 3 now
8 tasks · 34 person-days; Phase 2 69 · 275) and to the committed tracker (Phase 2
rows 71–72, Orders 27.5 / 28.5; Dashboard, autofilter, conditional formatting and
the Status list extended to row 72). Not built yet — the build plan goes to the
user first. The walkthrough presentation is left as-is for now, at the user's
request.

## Also today
- Branch brought level with main_development (the landing-page P1-ART-09/10/11 work).
- Staging and production redeployed on `faceeb5` (main had not auto-deployed).
- Presenter's guide `SponsorX-Presenter-Guide.xlsx` (run of show, script, the
  money split with live formulas, gaps, Q&A, logins) — in the user's Downloads;
  the Google Drive connector was disconnected, so the user uploads it.
- Walkthrough presentation: step 2 as the athlete's step-by-step application,
  step 6 as how Riley creates his clinic (6a–6c), step 7 split into 7a–7c.

## Raised: payout screens (2S5-FE-03, 2S5-FE-04) — rcfworks, via Claude

The walkthrough's steps 5, 14 and 15 had no screens. Agreed with the user:
- `2S5-FE-03` · Athlete and team payout screens (FE, 4d, Blocked on 2S5-BE-04 and
  the designs) — payout-account set-up first: the page says a Stripe account is
  needed and links out to Stripe; then available / held / paid out, Request payout,
  and a history to "Paid, confirmed by the payment provider" plus an email.
  Stripe is named only for the account set-up; transactions stay hidden.
- `2S5-FE-04` · BTG payout approval screen (FE, 3d, Blocked on 2S5-BE-05).
- `2S5-BE-04` corrected to Ready (its prerequisite 2S5-BE-02 is Done).
- The backend (2S5-BE-04/05) will use a stand-in payment provider on staging only
  (the user agreed); production moves no money until Stripe is connected.
- Claude Design prompt for all the payout screens (A–D plus 0a–0c account set-up)
  given to the user.

Phase 2 now 71 tasks · 282 person-days (Sprint 5: 13 · 56). Tracker rows 73–74,
ranges extended to row 74.

## Raised: sponsor pay-by-card button (2S5-FE-05) — rcfworks, via Claude

Rule set by the user today: **every step that involves Stripe gets a call-to-action
button on our page that takes the user there** (payout account set-up, paying by
card, retrying a failed payment). `2S5-FE-05` · Sponsor pays for an order (FE, 2d,
Blocked on 2S5-INT-01 and the designs): "Pay $… by card ↗" on the approved order,
then confirming → Paid / didn't go through with the button again, plus the sponsor's
email. Claude Design addendum (section E) given to the user. Phase 2 now 72 · 284;
tracker row 75.

## Built: card payment and payouts, with a staging stand-in provider (rcfworks, via Claude)

Backend (2S5-BE-04, 2S5-BE-05, 2S5-INT-01, 2S5-INT-03 — all **In progress**,
honestly: the stand-in is not Stripe):
- `lib/payment-provider.ts` — the one place the provider is called. `standin` on
  staging/local (SponsorX's own labelled /test-provider pages, no money moves),
  `none` in production until Stripe is connected; the API refuses to boot with
  the stand-in in production. `PAYMENT_PROVIDER`, `STANDIN_PROVIDER_SECRET`,
  `PAYOUT_HOLD_DAYS` in env.
- Models PayoutAccount, PaymentAttempt, Payout, PayoutLine (+ order `fulfilledAt`),
  migration `20260930090000_payouts`. Policy: `payout` gains the payee request
  and BTG approve rows; new `payoutAccount` (RBAC matrix + digest updated).
- Sponsor pays an approved order on the provider's page → worker confirms →
  order PAID + receipt email. Payee requests its requestable balance (paid,
  delivered, past hold, account ready) → BTG approves / sends back → worker sends
  and confirms → PAID, PAYOUT journal, email. Refunds refused while a payout
  covers the order. BE-04's "dispute open" clause waits for 2S5-BE-03.
- tests/phase2-payouts.test.ts (14) reproduces the walkthrough figures:
  Riley $542.58 then the $61.66 reserve = $604.24; Hawks $151.05; ledger reconciles.

Frontend (from the Claude Design canvas):
- 2S5-FE-05 **Code review** — sponsor order page E1–E4 (Pay $… by card ↗,
  confirming, paid, Try again on Stripe ↗) and the stand-in's /test-provider pages.
- 2S5-FE-03 **In progress** — team Earnings: payout-account panel (Set up /
  Continue / Manage payouts on Stripe ↗), Request payout, history to "Paid ·
  confirmed by the payment provider"; athlete-home set-up banner. Riley's own
  "My money" page and BTG's payout approval screen (2S5-FE-04) wait for their
  Claude Design screens (prompt given to the user).
- Verified locally in the browser end to end: decline → retry → paid; delivered
  → Hawks set up payouts → request $135.64 → approved → Paid.

Local note: after a fresh local database, set `ALTER DATABASE sponsorx_test SET
sponsorx.audit_purge = on` (as CI does), or cleanup-heavy suites fail.

## Built: Riley's "My money" and BTG's payout approvals (2S5-FE-03, 2S5-FE-04) — Code review

From the Claude Design artboards MyMoney and Approvals (the second prompt was
needed: the first run of the payout prompt produced only the sponsor payment).
- `/athlete/money` (nav "My money"): tiles, payout account with Stripe ↗, the
  "before you can request" checklist with the set-up button, per-order shares,
  Request payout (with "$61.66 stays in reserve…"), history with the
  Requested → Approved by BTG → Sent → Paid tracker (shared with the team page).
- `/admin/payouts` (nav "Payouts", BTG admin + Finance): tabs with counts, each
  waiting request's checks; `/admin/payouts/[id]`: payee + account, the payee's
  part of the frozen split, checks, audit trail, Approve / Send back (note
  required), Retry for problems.
- Verified locally: Riley set up payouts → requested $542.58 → Finance approved
  → worker paid → all four steps done on Riley's page.

## Walkthrough deck redone with the payment and payout screens (+ three small fixes)

- The walkthrough artifact (claude.ai/artifact/LPLmw7XkLWnutu7fBjM6jq, v8) now shows all 16 steps on real screens: payout-account set-up (5a–5d), pay by card (11a–11c), payment confirmed plus receipt email (12), Riley's My money (13), payout request (14), BTG's approval queue, detail and paid state plus payout email (15a–15c), and reserve release and final payouts (16). The "not built" gap cards are gone. Stripe steps use the marked staging stand-in.
- Fixes found while shooting it:
  - BTG's order page Payments card said "Not tracked yet". It now reads `GET /marketplace-orders/:id/payment` and shows the real status and provider reference (2S5-INT-01).
  - The "Mark awaiting payment" and "Mark paid" hints no longer say there is no payment provider. Mark paid is for payments made another way.
  - The payout tracker's labels now wrap instead of truncating in narrow columns (the Hawks' "Approved by BTG").
  - Payout emails to athletes now link to `/athlete/money`, not `/athlete/earnings`.

## 2S3-BE-05 — independent athletes list their own items (Code review)

- **Schema.** A listing, and the order line bought from it, now has exactly one seller: a property, or an athlete with no team.
  - Nullable `propertyId` plus a new `sellerAthleteId` on `Listing` and `MarketplaceOrderLine`.
  - DB checks `Listing_one_seller` and `MarketplaceOrderLine_one_seller`, in migration `20260930150000_independent_athlete_listings`.
- **Permissions.** ATHLETE `listing.write`: deny → `own`.
  - For writes, `own` means only listings the athlete sells themselves. Reads still cover every listing of their items.
  - `whereFor` now passes the action to builders.
  - Matrix §18 updated; digest is now `9bfe4e2f8189268c`.
- **Rules.**
  - The athlete must be APPROVED or ACTIVE, with no team.
  - A roster athlete gets 409: "on a team — <team> lists your items".
  - `sellerProblems` / `sellerCanSell()` in `listing-rules.ts` are applied on submit, BTG approval, resume, the catalogue scope, search and `checkListing`. So an athlete who joins a team stops being sold.
- **Money.**
  - `bookOrder` forces team share 0 on an athlete-sold line, even when a TEAM_SHARE rule exists. That rule would otherwise pay a team that doesn't exist.
  - No PROPERTY ledger rows are posted, and payouts go to the athlete.
  - The split preview takes `independentAthlete`.
- **Other surfaces.**
  - Search, cart, orders and Zoho name the athlete through a `seller` object.
  - Search's state filter uses the athlete's state.
- **Tests.**
  - `tests/phase2-independent-listing.test.ts` (14 tests) covers the whole path, from listing through to payout, plus the refusals.
    - Worked example: $1,000 → $678.22 available + $77.07 reserve = $755.29 to the athlete, $0 to any team.
  - Seller-rule unit tests are in `phase2-marketplace`.
  - The tenant-isolation sweep now seeds an athlete-sold listing and order line.
  - The alignment test accepts the builder's action argument.
- **Frontend follow-up raised as 2S3-FE-03** (Ready). The shop, cart, checkout and BTG queue still assume a property; `propertyLine` in `lib/shop-live.ts` would fail on an athlete-sold listing. 2S3-FE-02 moved to Ready.
