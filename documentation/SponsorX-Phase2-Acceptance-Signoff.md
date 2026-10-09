# SponsorX Phase 2 · Acceptance sign-off record

**Task:** `2S8-PMO-01` · Phase 2 UAT and production rollout
**Done when:** All 14 Phase 2 acceptance criteria demonstrated and signed off
**Prepared:** 2026-10-07, from `main_development` at `0f5d66a`
**Status:** **Signed off 2026-10-09** — Phase 2 accepted: 13 criteria demonstrated, #11 (wallet) deferred, and the simulated-user test passed on staging (all 17 steps). Signed by rcfworks with Rodney's delegated authority.

## Summary

Of the 14 Phase 2 acceptance criteria, **13 are demonstrated** and **1 is
deferred** (the optional wallet, #11, parked until further notice with
Rodney's approval). On 2026-10-09 the simulated-user test ran on staging and
passed every step: new people signed up through the normal pages, bought,
paid on Stripe, delivered and were paid out by Stripe transfer. Its evidence
is in [uat-evidence/phase2-2610090617](uat-evidence/phase2-2610090617/evidence.md),
and it closed Zoho (#13). What follows below "The UAT result" is the record
as it stood before the test.

Before the test: The 12 are proven by automated
tests that run in CI. The marketplace path (`e2e/marketplace-path.spec.ts`) ran
green in CI run 37281259338 on 2026-10-05. Payment (#6, #7) and payout
onboarding (#10) were also shown on staging with real Stripe sandbox
transactions. Two things block sign-off:

- **#11, the wallet reward pass, is parked (2026-10-08).** The wallet is
  optional: fans already claim and redeem rewards through the QR web page.
  Because the Apple Developer fee and Apple's company verification cost time
  and money, the wallet is taken out of Phase 2's sign-off for now. Its tasks
  stay on the tracker and resume when the owner confirms.
- **#13, Zoho, is proven only against a simulated Zoho.** Nobody has checked a
  marketplace order arriving in the real Zoho sandbox.
- **The task's own bar is not met yet.** It says "Real external properties
  onboard on staging, transact, and get paid, before anything goes live." So
  far only internal test accounts have done this. Those accounts were created
  by the tester facility directly in the database, not through sign-up.

The real-user test below closes the last point and can close the Zoho one.

## How to read this

- **Demonstrated** means it is proven by an automated test that runs in CI, by a recorded staging run, or by both. Both are cited where both exist.
- **Partly demonstrated** means some of it is proven. The entry says what is missing.
- **Not demonstrated** means it is not proven, and the entry says why.
- **CI** is the GitHub Actions run of the whole backend suite (Postgres-backed) plus the Playwright e2e specs. It runs daily and before each deploy.
- **Staging** facts come from the shared log in `Memory/` or from the tracker's notes, and each one names its source.
- Test references read `file` › describe › it. Every name was checked against the source on 2026-10-07.
- **Task status** comes from the tracker `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx`, not from the ⏸/✅ markers in the Phase 2 plan, which are out of date for many rows.

## The 14 criteria at a glance

| # | Criterion (short) | Status | Main evidence |
|---|---|---|---|
| 1 | External property onboards, is reviewed and approved with no database work | **Demonstrated** | [phase2-org-auto-approval.test.ts](../backend/tests/phase2-org-auto-approval.test.ts), [property-onboarding.test.ts](../backend/tests/property-onboarding.test.ts), [marketplace-path.spec.ts](../e2e/marketplace-path.spec.ts) step 1 |
| 2 | Inventory can be created, but not published until governance passes | **Demonstrated** | [phase2-marketplace.test.ts](../backend/tests/phase2-marketplace.test.ts), [phase2-listing-auto-publish.test.ts](../backend/tests/phase2-listing-auto-publish.test.ts), [phase2-independent-listing.test.ts](../backend/tests/phase2-independent-listing.test.ts), e2e step 4 |
| 3 | Search shows only what this sponsor/tenant may see | **Demonstrated** | [phase2-purchase.test.ts](../backend/tests/phase2-purchase.test.ts) (2S3-BE-04, 2S3-SEC-01), [phase2-listing-publish-gaps.test.ts](../backend/tests/phase2-listing-publish-gaps.test.ts) |
| 4 | Reservations prevent overselling and expire on their own | **Demonstrated** | [phase2-orders.test.ts](../backend/tests/phase2-orders.test.ts) (2S4-BE-02), [payment-failures.test.ts](../backend/tests/payment-failures.test.ts) |
| 5 | Exclusivity and date conflicts block purchases | **Demonstrated** | [phase2-purchase.test.ts](../backend/tests/phase2-purchase.test.ts) (2S3-BE-03, 2S2-BE-02) |
| 6 | Sponsor completes a purchase through the payment/order flow | **Demonstrated** | e2e steps 5–6, [stripe-payments.test.ts](../backend/tests/stripe-payments.test.ts), staging order **SX-BK6HZ86G** paid on Stripe ([Memory 2026-10-06](../Memory/2026-10-06/tasks-completed.md)) |
| 7 | Payment webhooks are idempotent and update state correctly | **Demonstrated** | [payment-webhooks.test.ts](../backend/tests/payment-webhooks.test.ts), [stripe-payments.test.ts](../backend/tests/stripe-payments.test.ts), [payment-failures.test.ts](../backend/tests/payment-failures.test.ts), staging webhook for SX-BK6HZ86G, sandbox smoke run |
| 8 | Commission snapshot is fixed at contract time | **Demonstrated** | [phase2-ledger.test.ts](../backend/tests/phase2-ledger.test.ts), [phase2-marketplace.test.ts](../backend/tests/phase2-marketplace.test.ts), e2e step 5 |
| 9 | Athlete accepts an offer, delivers and sees earnings | **Demonstrated** | [phase2-marketplace.test.ts](../backend/tests/phase2-marketplace.test.ts) (2S2-BE-03), [phase2-delivery.test.ts](../backend/tests/phase2-delivery.test.ts), [earnings.list.test.ts](../backend/tests/earnings.list.test.ts), e2e steps 7–8 and the loop-p4/p5/p7 specs |
| 10 | Payout blocked on unsettled payment, incomplete delivery, incomplete onboarding or an open dispute | **Demonstrated** | [payout-eligibility.test.ts](../backend/tests/payout-eligibility.test.ts), [phase2-payouts.test.ts](../backend/tests/phase2-payouts.test.ts), staging Stripe onboarding to READY ([Memory 2026-10-06](../Memory/2026-10-06/tasks-completed.md)) |
| 11 | Wallet reward pass issued and updated from SponsorX | **Deferred** (parked until further notice, approved by Rodney 2026-10-09) | Optional, out of Phase 2 sign-off; 2S6-INT-01, 2S6-INT-02, 2S6-BE-01, 2S6-FE-01 and 2S6-QA-01 resume when the owner says so |
| 12 | Property dashboard reconciles booked, ledger, paid and pending | **Demonstrated** | [phase2-ledger.test.ts](../backend/tests/phase2-ledger.test.ts), [phase2-reconciliation.test.ts](../backend/tests/phase2-reconciliation.test.ts), [phase2-payouts.test.ts](../backend/tests/phase2-payouts.test.ts), browser check 2026-10-07 (team page = ledger) |
| 13 | Zoho holds linked Account/Contact/Deal for marketplace sales | **Demonstrated** (2026-10-09) | [phase2-orders.test.ts](../backend/tests/phase2-orders.test.ts) (2S7-INT-01); UAT step 12: order SX-OA44ZADS's five linked records read back from the Zoho sandbox |
| 14 | Cross-tenant access tests pass for sponsor, athlete/property and admin | **Demonstrated** | [tenant-isolation.test.ts](../backend/tests/tenant-isolation.test.ts), [authz.matrix.test.ts](../backend/tests/authz.matrix.test.ts), [tenant-scope.static.test.ts](../backend/tests/tenant-scope.static.test.ts) |

## Evidence, criterion by criterion

### 1 · An external property can onboard, submit required information, be reviewed, and be approved without direct database intervention.

**Demonstrated.** Since the 2026-10-03 Phase 2 automation rule, an
organisation is approved by the system when every check passes. The checks are
every document, a confirmed email and a free name. BTG then reviews afterwards
and can Reject or Reinstate. Held applications still go to BTG's desk with the
reason.

- **End to end in CI.** `e2e/marketplace-path.spec.ts` › "a team and an athlete join, list, sell, deliver, get paid — and the order closes, with nobody approving".
  - Step 1 walks `/onboarding` in a real browser: organisation, contacts, team details, payout, documents, terms, review and submit, then the contact's email link.
  - It asserts `state: "APPROVED", autoApproved: true` and that a Property was created.
- **API, onboarding without the database** (`property-onboarding.test.ts`):
  - › "2S1-BE-01" › "an organisation completes and submits through the API alone — saving progress step by step";
  - › "2S1-BE-03" › "PENDING_REVIEW → APPROVED grants listing access and is audited". This is BTG's manual review path for held applications.
  - › "2S1-BE-04 · approval provisions an outside tenant" › "an approved property's users see only their own tenant's data".
- **Automatic approval and BTG's after-review** (`phase2-org-auto-approval.test.ts`):
  - › "2S1-BE-06 · approved without BTG" › "every document, a confirmed email and a free name: approved, the login created, BTG told — no person involved";
  - › "2S1-BE-06 · BTG reviews afterwards: Reject and Reinstate" › "Reject withdraws access, ends listings, holds payouts and emails the reason; Reinstate reverses it".
- **Tasks Done:** 2S1-BE-01, -02, -03, -04, -06, -07; 2S1-FE-01, -02, -04, -05; 2S1-INT-01.
- **Gap, which the UAT closes:** no outside organisation has used the wizard on staging. The staging test team "Stripe Test Hawks" was created by the tester facility directly in the database ([Memory 2026-10-05](../Memory/2026-10-05/tasks-completed.md)).

### 2 · A verified athlete or property can create inventory but cannot publish it unless marketplace-governance rules are satisfied.

**Demonstrated.**

- `phase2-marketplace.test.ts`:
  - › "2S2-BE-01 · athlete inventory" › "an athlete creates, edits and prices their own items";
  - › "2S3-BE-01 · listings and governance" › "a verified property creates a listing — and cannot publish it until governance is satisfied".
- `phase2-listing-auto-publish.test.ts`:
  - › "a clean submit goes live on its own" › "governance still refuses the submit outright, with the list";
  - › "flagged: restricted words" › "held with the words named; BTG is emailed a link; the seller is told the words so they can edit";
  - › "flagged: the seller's standing" › "a team's listing of an athlete in the coming-of-age pause, or of a minor whose guardian isn't verified: held".
- `phase2-independent-listing.test.ts` › "only an approved athlete, only their own item" › "an athlete BTG hasn't approved cannot list".
- **CI e2e:** in marketplace-path step 4, the athlete adds a clinic, the team lists it, and the test asserts it was "published automatically, its checks passed".
- **Tasks Done:** 2S2-BE-01, 2S3-BE-01, 2S3-BE-05, 2S3-BE-06, 2S3-FE-01, 2S3-FE-02, 2S3-FE-04.

### 3 · Marketplace search returns only inventory available to the requesting sponsor/tenant and respects visibility restrictions.

**Demonstrated.**

- `phase2-purchase.test.ts` › "2S3-BE-04 · search returns only what this sponsor, in this marketplace, may buy":
  - › "a sponsor sees the live, public listings of its own marketplace — and nothing else";
  - › "two sponsors see different catalogues — restricted against their category, it is not shown";
  - › "filters narrow within what is visible, and never widen it".
- Same file › "2S3-SEC-01 · no listing leaks across tenants or visibility":
  - › "the listing itself is refused where search would not show it";
  - › "a sponsor cannot put another marketplace's, or a hidden, listing in its cart".
- `phase2-listing-publish-gaps.test.ts` › "(c) what a sponsor's read leaves out" › "no BTG notes, no pause or end reason, no blockers, no hold — the seller and BTG still see them".
- **Tasks Done:** 2S3-BE-04, 2S3-SEC-01.

### 4 · Reservations prevent overselling and automatically release expired inventory.

**Demonstrated.**

- `phase2-orders.test.ts` › "2S4-BE-02 · reservations":
  - › "a hold takes the stock for fifteen minutes, all or nothing, and freezes the cart";
  - › "prevents overselling when two sponsors reserve the last unit at the same instant";
  - › "an expired hold releases its stock automatically — at once, and the sweep records it".
- The worker runs the sweep every minute: › "the order machine and the approval policy, as written (pure)" › "the worker sweeps holds every minute and pushes contracted orders to Zoho".
- `payment-failures.test.ts` › "expired reservations" › "a hold that expires can't become an order; nothing is booked and the stock is free again".
- **Tasks Done:** 2S4-BE-01, 2S4-BE-02, 2S4-FE-01.

### 5 · Category-exclusivity and date conflicts block invalid purchases.

**Demonstrated.** The availability check runs on every path that buys: adding
to or changing a cart line ([cart.ts](../backend/src/domain/cart.ts)), the
hold ([reservation.ts](../backend/src/domain/reservation.ts)) and a campaign
offer ([offer.ts](../backend/src/domain/offer.ts)).

- `phase2-purchase.test.ts` › "2S3-BE-03 · the availability check, through the paths that buy":
  - › "rejects date overlap on an exclusive item";
  - › "rejects category conflict — the item's own restricted categories".
- Same file › "2S2-BE-02 · a restricted category blocks the offer and the purchase, for the overlapping dates":
  - › "the listing purchase: a team's league rule, only for its dates";
  - › "an accepted offer's exclusivity blocks the sponsor's rivals — and the athlete cannot remove it".
- Same file › "every cart line is a checked purchase (static)" › "only cart.ts writes cart lines, and every write there follows the availability check".
- **Tasks Done:** 2S2-BE-02, 2S3-BE-03.

### 6 · Sponsor can complete a purchase or reservation through the configured payment/order flow.

**Demonstrated, in CI and on staging.**

- **CI e2e:** in marketplace-path steps 5–6 the sponsor carts, holds, accepts the order terms and places the order. It is approved automatically within the spending limit, paid on the stand-in provider's page, and shows "Paid ✓ · confirmed by the payment provider".
- `stripe-payments.test.ts` › "2S5-INT-01 · the sponsor pays on Stripe's hosted Checkout, and the order reflects it":
  - › "Pay by card answers with Stripe's page; the Checkout Session carries the attempt; card data never touches SponsorX";
  - › "checkout.session.completed (paid) marks the order PAID — recorded once, applied by the worker, never on the request path".
- `phase2-orders.test.ts` › "2S4-FE-02 · the contract gate — terms accepted, billing confirmed, or no order" › "placing without the acceptance, or without a billing contact, is a 422 — and the hold is untouched".
- **Staging, 2026-10-06** ([Memory](../Memory/2026-10-06/tasks-completed.md)):
  - The test sponsor "Stripe Test Coffee" placed order **SX-BK6HZ86G** for $1,000.
  - Declined card 0002 was refused. Card 4242 then paid on `checkout.stripe.com`.
  - SponsorX showed "Paid ✓" within two seconds of the webhook (PaymentIntent `pi_3UNQsiKA9GZ8RRgK1bwYh0FH`), and the split was exact.
  - This was Stripe's sandbox, so no real money moved.
- **Tasks Done:** 2S4-BE-03, 2S4-FE-02, 2S5-INT-01.
- **Open item next to this criterion (2S5-FE-05, Code review):** on staging no payment receipt email has been delivered, because the test sponsors use `@example.com` addresses. The receipt also goes to the signed-in user rather than the billing contact.

### 7 · Payment webhooks are idempotent and correctly update order/payment state.

**Demonstrated, in CI and against real Stripe events.**

- `payment-webhooks.test.ts`:
  - › "a signed delivery is recorded once, and applied by the worker — never on the request path" › "a duplicate delivery is a no-op: one row, one job, one payment, one receipt";
  - same block › "a second event with a new id for a payment already confirmed is ignored — the order is paid once";
  - › "state moves only forward under out-of-order delivery" › "a late failure after success is ignored — the order stays paid";
  - › "only the provider's signed, fresh word is recorded" › "a bad signature, a missing one, or a body altered after signing: 401, recorded as REJECTED, nothing queued".
- `stripe-payments.test.ts` › "duplicates and reordering: the same Stripe event twice is one; a late expiry or failure never undoes paid".
- `payment-failures.test.ts` › "duplicate webhooks" › "every event delivered three times, and every job run twice: one payment, one dispute, one payout".
- **Real Stripe sandbox, 2026-10-06:**
  - The staging webhook for SX-BK6HZ86G moved the order to Paid.
  - The manual smoke run [`stripe-sandbox-smoke.mts`](../backend/scripts/stripe-sandbox-smoke.mts) fed the events Stripe actually emitted through SponsorX's webhook handling: 16/16 checks, then 17/17 on the restricted key. Its checks 6a–6f cover an expired session, a refund, a transfer, account events and a dispute ([Stripe-Integration §7](SponsorX-Stripe-Integration.md)).
- **Found on staging and fixed:** 59 sandbox events for Stripe accounts SponsorX never opened failed and emailed BTG admins.
  - Fix `7105256` now ignores them, and it has been on staging since 2026-10-07. Test: `stripe-adapter.test.ts` › "a Checkout session or transfer SponsorX didn't open is acknowledged and ignored".
  - The 59 FAILED rows are still on staging's exceptions list ([Memory 2026-10-07](../Memory/2026-10-07/tasks-completed.md)).
- **Tasks Done:** 2S5-INT-02.

### 8 · Commission snapshot is created at contract time and remains unchanged if future rate cards are edited.

**Demonstrated.**

- `phase2-ledger.test.ts` › "2S4-BE-04 / 2S5-BE-02 · booked at contract time, reconciled exactly":
  - › "the design's worked example, contracted: every figure frozen, every journal balanced";
  - › "editing a rule later alters no snapshot, no entry, no dashboard — and applies to the next order";
  - › "Postgres keeps them: no rule, snapshot or entry can be rewritten, and status only moves forward". The database itself refuses a rewrite, not only the app.
- `phase2-marketplace.test.ts` › "2S2-BE-03 · the formal offer" › "accepting freezes the terms and schedules the deliverables — and later rate-card edits do not alter it".
- **CI e2e:** marketplace-path step 5 asserts the split frozen at approval, to the cent: the athlete's $604.24 and the team's $151.05.
- **Tasks Done:** 2S4-BE-04, 2S5-BE-01, 2S5-BE-02, 2S5-FE-01.

### 9 · Athlete can accept a campaign offer, complete deliverables, and view earnings.

**Demonstrated.**

- **Accept:** `phase2-marketplace.test.ts` › "2S2-BE-03 · the formal offer":
  - › "accepting freezes the terms and schedules the deliverables — and later rate-card edits do not alter it". The athlete accepts through `POST /offers/:id/respond`; another athlete is refused.
  - › "a sent offer's terms are fixed before acceptance too; decline and withdraw close it".
- **Deliver:** `phase2-delivery.test.ts` › "2S4-BE-07 · the seller marks it delivered; the sponsor confirms within 24 hours" › "Jordan marks his line delivered: the sponsor is emailed with 24 hours to answer, and the order is in delivery".
- **Earnings:**
  - `phase2-delivery.test.ts` › "2S4-BE-06 · sellers see and are told about their sales" › "the team and its athlete each read the line they sell, with their OWN share only";
  - `earnings.list.test.ts` › "GET /earnings" › "gives the athlete their own net amount — never the sponsor price or commission".
- **CI e2e:**
  - marketplace-path steps 7–8: the athlete marks it delivered, the sponsor confirms, and the athlete's money page shows $542.58 available, then the $61.66 reserve after the close;
  - `loop-p4-matching.spec.ts` › "a sponsor brief is approved, staffs itself, and is answered — accept, decline and expiry";
  - `loop-p5-delivery.spec.ts` › "an accepted invite becomes a signed order, a reviewed and revised deliverable, and a published post";
  - `loop-p7-earnings-report.spec.ts` › "a verified post releases the earning, shows in finance, and lands in the sponsor's report".
- **Browser check, 2026-10-07:** the athlete and the team each set up payouts, requested, and followed the payout to Paid, on the stand-in provider. This is recorded in the tracker notes for 2S5-FE-03, in commit `a17b4f7` on `development/bob/be_batch_0924`, not yet merged into `main_development`.
- **Tasks Done:** 2S2-BE-03, 2S2-FE-03, 2S4-BE-06, 2S4-BE-07, 2S4-FE-03, 2S4-FE-04, 2S5-FE-02, 2S5-FE-03.

### 10 · Payout cannot be released if payment is unsettled, deliverables are incomplete, account onboarding is incomplete, or a dispute is open.

**Demonstrated.** Each of the four blocks has its own test in
`payout-eligibility.test.ts` › "2S5-BE-04 · a payout is released only when all five hold":

- › "payment unsettled: an order not yet paid has nothing to release — awaiting payment, not requestable";
- › "deliverables incomplete: paid but not delivered and confirmed — not requestable; delivered, it is";
- › "onboarding incomplete: no payout is requested to an account that isn't READY, and an approved one isn't released until it is";
- › "dispute open: the disputed order's money can't be requested, approved or sent; the rest can; resolved, it is free again".

More evidence:

- `phase2-payouts.test.ts` › "2S5-BE-04 · a payout is requestable only when every rule is met" › "delivered, but the payout account isn't set up: refused until it is (2S5-INT-03)".
- `payment-disputes.test.ts` › "disputes: frozen, worked by BTG support, never resolved by themselves" › "opened: the order's money is frozen and BTG support has the item; the provider's decision changes nothing until a BTG admin resolves it; WON sends the waiting payout".
- **Staging, 2026-10-06** ([Memory](../Memory/2026-10-06/tasks-completed.md)):
  - The test team "Stripe Test Hawks" was recorded NEEDS_INFO until the owner finished Stripe's hosted onboarding by hand.
  - SponsorX then turned the account READY by itself, from Stripe's webhook, at 07:54:46 UTC.
  - Stripe shows an hCaptcha to automated browsers, so a person has to do this step.
- **Tasks Done:** 2S5-BE-03, 2S5-BE-04, 2S5-BE-05, 2S5-INT-03.

### 11 · Wallet reward pass can be issued and updated from SponsorX.

**Parked until further notice, approved by Rodney on 2026-10-09; out of
Phase 2's sign-off.** Parked on 2026-10-08 pending his word. The wallet is
optional: the QR web page below already covers claim and redemption. Setting it
up needs a paid Apple Developer account (US$99 a year), Apple's company
verification and a Google Wallet issuer account, so the work waits for the
owner's confirmation. The set-up guide is the doc "Apple & Google Wallet Issuer
Setup". The rest of this entry is the state it was parked in.

**Not built.** No Apple or Google Wallet code
exists in `backend/src` or `frontend/src`. All four tasks that make up this
criterion are **Blocked** in the tracker:

- 2S6-INT-01, the Apple Wallet adapter;
- 2S6-INT-02, the Google Wallet adapter;
- 2S6-BE-01, the pass lifecycle and device registrations;
- 2S6-FE-01, the wallet reward manager.

Their outage test, 2S6-QA-01, is Blocked too. The tracker note says they wait on
the payment provider choice. That choice is now made: 2S0-PMO-03 and 2S5-INT-01
were Done on 2026-10-06, so the note is out of date. What actually remains is
the build and each wallet vendor's console set-up.

What exists today is the Phase 1 QR reward, which is not a wallet pass:

- `worker.images.test.ts` › "P6-BE-06 · a QR PNG per token, in the private bucket";
- `e2e/redeem-flow.spec.ts` › "a fan scans, lands, claims and redeems — once";
- the redemption limits in `reward.reservations.test.ts`;
- `payment-failures.test.ts` › "reward outages (the wallet pass provider does not exist yet — 2S6-INT-01)".

**To close #11:** build 2S6-INT-01 → 2S6-BE-01 → 2S6-FE-01 (plus 2S6-INT-02),
or the owner records in writing that #11 moves to a later phase and signs Phase
2 without it.

### 12 · Property dashboard accurately reconciles booked revenue, ledger balance, paid earnings, and pending earnings.

**Demonstrated.**

- `phase2-ledger.test.ts`:
  - › "the property dashboard reconciles exactly — through payment and the reserve's release";
  - › "a refund reverses what was booked — and the dashboard still reconciles";
  - › "2S7-DATA-01 · property analytics reconcile to the ledger and the order records" › "revenue, completion, sell-through, sponsor mix and payouts — each from its source, summing to it".
- `phase2-reconciliation.test.ts` › "2S8-QA-03 · a full marketplace cycle reconciles to the cent" › "each payee's balance identity: booked − reversed − paid = ledger balance = what its payout page shows, and the closed orders are paid out in full".
- `phase2-payouts.test.ts` › "the team is paid its $151.05 the same way, and its ledger still reconciles".
- **Browser check, 2026-10-07:** the team's page equals the ledger: **$151.05 booked, $135.64 paid, $15.41 reserve** (pending), reconciles: true. This is recorded in the tracker notes for 2S5-FE-03, commit `a17b4f7` as above.
- **Caveat:** that check used the stand-in payment provider. No team has yet received Stripe money on staging and checked its page against the ledger. The UAT does that.
- **Tasks Done:** 2S5-BE-02, 2S5-FE-02, 2S5-FE-03, 2S7-DATA-01, 2S7-FE-01, 2S8-QA-03.

### 13 · Zoho contains linked Account/Contact/Deal data for external marketplace transactions.

**Demonstrated on 2026-10-09** by UAT step 12 (see "The UAT result"): staging
order SX-OA44ZADS, from a sponsor and team who signed up themselves, reached
the Zoho sandbox as five linked records, read back by id. Before the test it
was:

**Partly demonstrated.**

**What is proven.** Every move of a contracted marketplace order queues the
`zoho.pushMarketplaceOrder` job (`backend/src/domain/marketplace-order.ts`).
The worker ([zoho-sync.ts](../backend/src/domain/zoho-sync.ts)) then pushes
four things:

- the sponsor's Account and primary Contact;
- each outside property as a Partner Account, with its manager as a Contact under it;
- a Deal `mkt-order:<id>`, linked to the sponsor's Account and Contact, that names each property Account.

It never pushes before the order is contracted, and a repeat sends only the
Stage. The mapping is in [Zoho Field Mapping §12.2](SponsorX-Zoho-Field-Mapping.md).
An athlete who sells with no team is named in the Deal but is not a Zoho
Account, by design: Zoho holds who we sell to.

Tests (`phase2-orders.test.ts` › "2S7-INT-01 · the contracted order in Zoho, linked"):

- › "the sponsor's Account and Contact, the property's own Account and manager, and the Deal linking them";
- › "a refund moves the Deal to Closed Lost; an order not yet contracted never reaches Zoho".

**What is missing:**

- Both tests run against `FakeZoho`, a simulated org. The 2026-09-28 log says "A live sandbox check is still open" ([Memory 2026-09-28](../Memory/2026-09-28/tasks-completed.md)), and no later record closes it.
- The Zoho CRM sandbox `SponsorX-Dev` is connected to staging (2026-09-24), and Phase 1 deals, contacts, accounts and inbound changes were run live against it ([Memory 2026-09-24](../Memory/2026-09-24/tasks-completed.md)). The marketplace push was built after that and has not been run live.
- Nobody has checked whether staging order SX-BK6HZ86G reached the sandbox. Its sponsor was a tester-facility account, and those skip Zoho sync.
- BTG's Zoho Books is not connected. The test Books org has been requested from the Zoho One admin ([Memory 2026-10-02](../Memory/2026-10-02/tasks-completed.md)). Books is not part of #13, but invoice-paid tests also use a simulated Zoho.

**To close #13:** run one marketplace order on staging with a sponsor and a
team made through sign-up (not the tester facility). Then confirm in the
`SponsorX-Dev` sandbox that the sponsor Account and Contact, the team's
Partner Account and manager Contact, and the linked Deal `mkt-order:<id>` are
there. Record the Zoho record ids. UAT step 12 does this.

**Task Done:** 2S7-INT-01 (closed on the simulated org).

### 14 · Cross-tenant data access tests pass for sponsor, athlete/property and admin roles.

**Demonstrated.**

- `tenant-isolation.test.ts` › "P8-SEC-02 · tenant B cannot reach tenant A through any route":
  - › "every route, as every tenant-B actor: never a success, never a tenant-A value";
  - › "2S8-SEC-01 · the outside organisation is its own tenant, and its manager reaches it";
  - › "2S8-SEC-01 · and no other tenant's sponsor, athlete, property or admin role reaches the outside tenant";
  - › "2S8-QA-07 · same tenant: another sponsor admin and another athlete read and write none of the first's records";
  - › "and nothing tenant A owns changed, in any table".
- `authz.matrix.test.ts` › "tenancy sits above everything (matrix §2)" › "gives cross-tenant reach to SUPER_ADMIN and nobody else".
- `tenant-scope.static.test.ts` › "every request-path read carries its tenant, or says why not":
  - › "finds no unscoped read";
  - › "finds no unscoped write — update, delete, upsert or raw SQL (2S8-QA-07)".
- **Tasks Done:** 2S3-SEC-01, 2S8-SEC-01, 2S8-QA-07.

## The UAT result · 2026-10-09

**Passed, all 17 steps**, run `2610090617` of `npm run uat:phase2`
([evidence](uat-evidence/phase2-2610090617/evidence.md), with screenshots).
The task's bar changed on 2026-10-09, with the owner's authority, from "real
external properties" to **simulated outside users**. These are new people who
sign up through the normal pages (`/onboarding`, `/join`, `/brief`), never the
tester facility. The first real outside team is checked at go-live instead, as
`2S8-PMO-03`.

| Step | Shown on staging | Criteria |
|---|---|---|
| 1–3, 5 | The team, the athlete and two sponsors signed up themselves; each was approved automatically. BTG's desk shows the team with its five checks passed. | 1 |
| 4 | The team invited the athlete at 20%; the athlete accepted. | 9 |
| 6 | Payouts refused before set-up ("Set up your payout account first"); both accounts READY from Stripe's webhook after Stripe's hosted onboarding. | 10 |
| 7 | A listing with "casino" was held for BTG with the word named; edited, it went live automatically. | 2 |
| 8 | The sponsor's search showed the live clinic, but neither the held listing nor one that won't sell to restaurants. | 3 |
| 9 | Sponsor B held the last unit; sponsor A was refused ("0 left of 1"); the hold expired after 15 minutes and A bought the unit. | 4 |
| 10 | An exclusive item on overlapping dates and an item barred to the sponsor's category were both refused with the reason. | 5 |
| 11 | Order **SX-OA44ZADS**, $800, approved automatically within the spending limit. Card 0002 was declined on Stripe's page; card 0077 paid (PaymentIntent `pi_3UOYBEKA9GZ8RRgK00XPlbct`). The receipt went to the billing contact. | 6, 7 |
| 12 | In the Zoho sandbox: the sponsor's Account `7554807000013049001` and Contact `7554807000013050001`; the team's Partner Account `7554807000013054002` (MD) and manager Contact `7554807000013049003`; Deal `7554807000013055001`, `mkt-order:…`, $800, Closed Won, linked to the sponsor and naming the team's Account. | 13 |
| 13 | The platform fee was raised 1% and put back; the order's split did not move. | 8 |
| 14–15 | Payout refused before the sponsor confirmed ("Nothing is ready to pay out yet"). After delivery and confirmation, both payouts were approved automatically and paid by Stripe transfer: athlete $434.02 `tr_1UOYJrKA9GZ8RRgKdFIIEdPe`, team $108.50 `tr_1UOYJtKA9GZ8RRgKV0Wi39bU`. | 9, 10 |
| 16 | The team's Earnings page equals its ledger: booked $120.83 (its share in the split), paid $108.50, reserve $12.33, balance $12.33, "Reconciles". | 12 |
| 17 | Seven reads across people and tenants (orders, payment, hold, payouts, ledger, another team's listing): all refused, 403. | 14 |

The decline and the payouts used Stripe's sandbox, so no real money moved. The
30-day reserve release stays proven by the automated tests.

## The task's own bar: real external users on staging

`2S8-PMO-01` asks for more than the 14 criteria: "Real external properties
onboard on staging, transact, and get paid, before anything goes live."

*Superseded on 2026-10-09: the bar is now simulated outside users, met by
the UAT result above; real outside users move to `2S8-PMO-03` at go-live.
The rest of this section is the record before the test.*

**Plain fact (2026-10-07): this has not happened.** Every staging run so far used internal
test accounts. They are the "Stripe Test" admin, team, athlete and sponsor,
created by the tester facility directly in the staging database and Clerk
([Memory 2026-10-05](../Memory/2026-10-05/tasks-completed.md),
[2026-10-06](../Memory/2026-10-06/tasks-completed.md)). The money was Stripe
sandbox money. The automated tests make their own people.

**Production takes no payments yet.** `PAYMENT_PROVIDER` is `none` there, no
live webhooks are registered, and the owner has deferred going live, possibly
until after Phase 4. That part of "production rollout" waits for the owner's
go-live decision. The steps are in [Memory 2026-10-06](../Memory/2026-10-06/tasks-completed.md).

## Real-user test (UAT) plan

### Who

| Role | Who | Time needed |
|---|---|---|
| External team (property) | A real organisation's manager, with a real work email and the organisation's real documents | about 2–3 hours over 3 days |
| Athlete | A real adult athlete on that team (optionally a second, independent athlete) | about 1–2 hours |
| Sponsor | A real business contact with a real email address | about 1–2 hours |
| BTG admin + Finance | One person each, watching the desks, Zoho and the ledger | about 1 day |
| Programme owner | Watches the result and signs below | about 1 hour |
| Developer on call | Answers problems and records evidence | about 2 days |

### Before day 1

- Staging runs on **Stripe's sandbox**. Tell participants:
  - pay with Stripe test cards (4242 4242 4242 4242 pays; 4000 0000 0000 0002 is declined);
  - in Stripe's payout onboarding, enter Stripe's test values, never a real bank account or SSN;
  - no real money moves.
- Participants **sign up themselves** through `/onboarding`, `/join` and the sponsor request form. Do not use the tester facility. That is the point of the test, and tester-made accounts skip Zoho sync.
- Confirm staging has its five commission rules (`/admin/commission`) and that the Zoho CRM sandbox credentials are still valid.
- Optionally, clear the 59 FAILED sandbox events from staging's exceptions list so real problems stand out.
- Decide #11 first: either the wallet tasks are built before UAT, or the owner defers it in writing.

### The script

| Step | Who | What they do | What should happen | Criteria |
|---|---|---|---|---|
| 1 | Team | Apply at `/onboarding`: organisation, contacts, team, documents, terms; click the email link | Approved automatically, or held with a reason BTG can act on. Sign-in works. | 1 |
| 2 | BTG admin | Open the new organisation on the sign-ups desk | It is there with its checks; Reject and Reinstate are available | 1 |
| 3 | Athlete | Apply at `/join` with a government ID; click the email link | Approved and active with no BTG step | 1 |
| 4 | Team, athlete | Team invites the athlete at a share; athlete accepts | Athlete is on the roster at that share | 9 |
| 5 | Sponsor | Fill in the sponsor request form, upload proof, confirm email | Sponsor account opens automatically | — |
| 6 | Team, athlete | Each sets up payouts on Stripe from SponsorX; try Request payout before it is READY | Refused with the reason until READY, then READY | 10 |
| 7 | Athlete, team | Athlete adds an item; team lists it once with a restricted word, then clean | First is held for BTG with the words named; clean one goes live | 2 |
| 8 | Sponsor | Search the marketplace | Sees the team's live listing; does not see paused, held or other-marketplace listings | 3 |
| 9 | Sponsor | Hold the last unit; a second sponsor (BTG can play it) tries to hold the same unit; wait 15 minutes on another hold | Second hold refused; the expired hold's stock comes back | 4 |
| 10 | Second sponsor | Try to buy an exclusive item for overlapping dates, or in a restricted category | Refused with the reason | 5 |
| 11 | Sponsor | Accept the order terms, place the order, pay: card 0002, then 4242 | Approved within the spending limit; decline shown; then "Paid ✓"; receipt email arrives | 6, 7 |
| 12 | BTG admin | In the Zoho CRM sandbox `SponsorX-Dev`, find the order | Sponsor Account and Contact, the team's Partner Account and manager Contact, and Deal `mkt-order:<id>` linked to them | 13 |
| 13 | BTG admin | Edit a commission rule, then reopen the order's split | The order's split is unchanged; only new orders use the new rule | 8 |
| 14 | Athlete, sponsor | Athlete marks it delivered; sponsor confirms (or waits 24 hours) | Earnings show for the athlete and the team | 9 |
| 15 | Athlete, team | Request payout before the sponsor confirms, then after | Refused before; after, approved automatically (under $2,000), sent by Stripe transfer, Paid | 10 |
| 16 | Team, Finance | Team opens its Earnings page; Finance reads the ledger | Booked, paid, reserve (pending) and balance match the ledger to the cent | 12 |
| 17 | Each person | Open a link to another tenant's order, listing or payout (BTG supplies them) | Refused every time | 14 |
| 18 | BTG admin | Issue a wallet pass for a reward, then change it (only if #11 is built) | The pass installs and updates | 11 |

Disputes (#10) and duplicate or out-of-order webhooks (#7) are hard to cause by
hand. They stay proven by the automated tests above, and step 11 shows the
normal webhook path live.

### How long

- **About one working week.** Day 1 is steps 1–6, day 2 is steps 7–13, day 3 is steps 14–17, day 4 is for re-runs and anything held, and day 5 is the sign-off. This matches the task's 5-day estimate.
- **The 30-day reserve.** An order closes and releases its reserve 30 days after delivery is confirmed. The automated tests prove that release. Seeing it live means checking the team's page again 30 days later.
- **Lead time.** Recruiting a real external team, athlete and sponsor is outside the week and is BTG's to arrange.

### What to record

For each step, record:

- the order number;
- the Stripe ids (PaymentIntent and transfer);
- the Zoho record ids;
- a screenshot of the team's Earnings page next to the ledger figures;
- anything held or refused, with its reason.

Add a line to that day's `Memory/` log, then bring the evidence here before
signing.

## Sign-off

To be completed by the programme owner, or by the user signing with Rodney's
delegated authority (2026-10-09). Each line confirms the criterion was
demonstrated, or was explicitly accepted as deferred, with the reason written
next to it.

1. External property onboards and is approved without database work. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-09
2. Inventory not publishable until governance passes. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-09
3. Search returns only what the sponsor/tenant may see. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-09
4. Reservations prevent overselling and release on expiry. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-09
5. Exclusivity and date conflicts block purchases. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-09
6. Sponsor completes a purchase through the payment/order flow. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-09
7. Payment webhooks idempotent and update state correctly. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-09
8. Commission snapshot fixed at contract time. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-09
9. Athlete accepts an offer, delivers and views earnings. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-09
10. Payout blocked on the four conditions. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-09
11. Wallet reward pass issued and updated from SponsorX. **Deferred** — parked until further notice, approved by Rodney 2026-10-09; out of Phase 2's sign-off. Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-09
12. Property dashboard reconciles to the ledger. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-09
13. Zoho holds linked Account/Contact/Deal for marketplace sales. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-09
14. Cross-tenant access tests pass for every role. **Demonstrated.** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-09

**Overall: Phase 2 accepted (all 14 criteria demonstrated or explicitly deferred, and the simulated-user test completed on staging).** Signed: rcfworks, with Rodney's delegated authority · Date: 2026-10-09
