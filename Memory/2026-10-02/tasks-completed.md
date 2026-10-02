# 2026-10-02 — tasks completed

## BTG admin review item 7: approving new sponsors
Already handled. Sponsors are approved automatically (2S1-BE-17), and exceptions go to BTG's Sponsor requests queue (2S1-BE-05). The "BTG Admin Interventions" doc in Drive still says "Keep" for item 7; offered the user new wording.

## BTG admin review item 8: listings publish automatically (2S3-BE-06, 2S3-FE-04, both Done)

The owner's rule: automate. Every listing that passes the checks goes live, the first one included. There is no price check, left out on purpose.

**Backend** (`backend/src/domain/listing.ts`):
- **Submit:** `submitListing` runs `goLive` → `listingChecks`. That covers governance and seller problems (a failure is refused 422, as before), the restricted-words check on the title and description, and standing reasons.
  - Clean: `publishAutomatically` publishes it (`publishedAutomatically`, audit `listing.autoPublish`, seller emailed `listing.live`).
  - Flagged: `holdForBtg` moves it to PENDING_APPROVAL with `reviewReasons` and `heldWords`. The seller and BTG are emailed.
- **The same checks run on every other way back to live:**
  - the seller resuming a paused listing;
  - BTG's "Put back live" (holds it if restricted words were edited in);
  - account reactivation (`relistAfterReactivation`).
- **Refused outright** (unchanged): a seller who is closed, rejected, ended, unapproved or has no listing access, and a minor's own login.
- **Held for BTG** (standing): an organisation flagged for a missing document, payouts on hold, an athlete in the coming-of-age pause, or a minor's unverified guardian.
- **What the seller is told:** restricted words in full, so they can fix them. Standing problems only as "BTG is checking your account".
- **BTG's controls:**
  - `POST /listings/:id/btg-action` PAUSE, END or RESUME, with a reason that is emailed. A listing BTG paused goes back live only through BTG.
  - `GET /listings/auto-published` covers the last 30 days; `GET /listings/live` lists all live listings, paged.
  - Decisions on a held listing: APPROVE, REQUEST_CHANGES or REJECT.
- **Daily summary:** `sendListingDigests`, run hourly by the worker from 13:00 UTC, sends one email per BTG tenant per day, idempotent through the `ListingDigest` table.
- **What sponsors see:** none of BTG's notes or holds.

**Migration:** `20261003100000_listing_auto_publish`.

**Frontend:**
- Both seller editors say "This goes live as soon as the checks pass", then show Live or "BTG is taking a look".
- The marketplace console has tabs Held for BTG, Published automatically and Live listings, with Pause and End.
- The restricted-words page now says listings are checked.
- Removed every line saying BTG approves each listing.

**Plan:**
- `2S3-BE-06` and `2S3-FE-04` were added to the Phase 2 document, which now has 108 tasks.
- The `2S3-BE-06` definition was corrected: closed and rejected sellers are refused outright, not queued for BTG.
- `SponsorX-Phase2-State-Machines.md` §2 was updated.
- Tracker rows 110 and 111 were added, with every range extended.

**Review:** the first review found two ways a listing could go live unchecked (reactivating an account, and BTG's "Put back live"), plus BTG notes visible to sponsors. All are fixed (`cdfac6a`) and rechecked.

**Checks:** backend 2164 of 2165 pass (only QA-02 fails), frontend 957, and the build is clean.

**Housekeeping:** the scratchpad was cleared overnight, so the local Postgres was reinstalled (v18 embedded), along with the venv and `q.cjs`.

## BTG admin review items 9 to 11: order approval, payment and delivery, automated (2S4-BE-09, -10, -11 and 2S4-FE-05, all Done)

**The owner's decisions:**
- the spending limit starts at $5,000 and is capped at $25,000;
- a listing that asks for approval is decided by its seller;
- an unpaid order is cancelled after 3 days;
- each side gets 72 hours to answer a delivery problem.

### 2S4-BE-09: approval
- **The spending limit is never stored.** It is replayed from the sponsor's own records (`backend/src/domain/spending-limit.ts`, `spendingLimit()`):
  - it starts at $5,000 and rises to max($5,000, 2 × the largest completed order), capped at $25,000;
  - the first refund or upheld problem freezes it, whether BTG decided it or the two sides agreed a line refund.
- **Within the limit:** the order is approved automatically, the first one included.
- **Above it:** the order waits for BTG, with the reason, and BTG is emailed.
- **A listing that asks for approval:**
  - the order goes to `PENDING_SELLER`, with an `OrderSellerApproval` row per seller;
  - the seller has 48 hours, and silence declines (worker);
  - one decline cancels the order;
  - seller first, then BTG if the order is also above the limit.
- **Daily summary:** BTG gets one per day of orders approved automatically.
- **New policy resource** `orderSellerApproval`. The RBAC Matrix gains §24.

### 2S4-BE-10: payment
- **Awaiting payment** is set automatically when the order is approved.
- **Zoho Books:** a paid invoice moves the order to PAID through the queued `zoho.ingestInvoice` and the new `MarketplaceOrderInvoice` mirror. A short invoice, the wrong currency, or an order that isn't waiting is audited as unmatched and never pays.
  - BTG's Zoho Books is not connected. The MCP reaches only "The Coffee Stage" Books org, which is not BTG's. Books credentials are deferred (credentials doc §6, O-1). This part is tested against a simulated Zoho.
- **Unpaid orders:** reminders at 1 and 2 days, cancelled at 3 (`cancelReason` UNPAID). Never cancelled while a card payment is in progress.
- **Manual "Mark paid":** BTG_ADMIN or FINANCE only, with a method, a reference and the date received.
- **One way to PAID:** card, Zoho and manual all go through `payOrderIn`.

### 2S4-BE-11: delivery problems
- New `DeliveryIssue` table, one row per problem round.
- **The seller has 72 hours** to deliver again (the sponsor's 24 hours restart after the new delivery), refund the line, or disagree.
- **The sponsor then has 72 hours** to accept or reject. An accepted answer settles without BTG.
- **BTG steps in** only when the sponsor rejects or either side is silent.
- **Late sellers:** a second reminder at 3 days, then BTG at 7.

### Race fixes (c678ed5, from review)
- Every order state move is conditional on the state it was read in, and the order row is locked (`lockOrder`). Without this, a cancel could have been overwritten by a payment.
- Two sellers accepting at once no longer leave the order stuck, and the sweep acts as a backstop.
- A payment can't start for an order that isn't waiting for one. A payment confirmed after a cancel is flagged to BTG for a refund (`payment.refundNeeded`).
- A cancel while a card payment is processing gets 409.

### 2S4-FE-05: the screens, from Claude Design
- **Sellers:** approvals at `/athlete/sales/approvals/[id]` and `/property/sales/approvals/[id]`, plus the problem answer on the sale page.
- **Sponsor order page:** a status card with the pay-by deadline, and the answer to the seller's reply.
- **BTG Delivery issues:** Needs BTG, Settled and Overdue.
- **BTG order page:** the spending-limit card with the held order, and the Mark paid dialog.
- **Review fix:** a coded 403 (for example `guardian_must_act`) now shows the API's reason instead of "not your line".

### Plan and tests
- **Plan:** 2S4-BE-09, -10, -11 and 2S4-FE-05 added (Phase 2 now has 113 tasks). `SponsorX-Phase2-State-Machines.md` §4 updated.
- **2S8-QA-04 raised** for intermittent cross-suite test failures: next-public-apply (the advisor's login answers 403), notification-preferences and pilot-school.
- **Test fix:** the listing-hold email test now finds the emails by template (`9be8c92`).

### Checks
- Backend: 2235 of 2236 on two runs; only QA-02 fails.
- Frontend: 988 tests pass.
- The build is clean.

### Owner steps
- Connect BTG's Zoho Books, and switch on the invoice webhook there.
- Choose Stripe. Real card payments, and refunds actually returned to the card, wait for it.
