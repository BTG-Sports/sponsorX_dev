# 2026-11-21 · tasks completed

## POL-BE-119 / POL-BE-120 · fee statements before acceptance (rcfworks) — Code review
- **Why:** Rodney's new partnership agreement, "Platform access and service orders": no upfront or monthly access fee; before campaign acceptance, disclose the applicable transaction fee, fee payer and processing costs in writing; name any fee in the signed order; any change needs written acceptance before it applies. Raised by the programme owner, who stressed the disclosure before acceptance. polish.md item 119.
- **Owner decisions:**
  - The athlete's statement on a managed campaign: no fee deducted; the sponsor pays it, in the sponsor's price; no processing.
  - The sponsor confirms a managed campaign's price before launch, once it is fully staffed. At creation only the budget exists; asked, the owner chose "before launch".
- **Built:**
  - **Statements:** one per acceptance, with figures, words and a hash. Covers the athlete's Campaign Order and Offer, the seller's listing submit or resume and order accept, Deal Chat (written into DEAL v2's text), the sponsor's checkout, and the new campaign price confirmation (`GET/POST /campaigns/{id}/price[/confirm]`).
  - **Rates frozen at placement:** kept on `MarketplaceOrder.feeTerms`; the ledger books from them. Before this, rates were looked up when BTG approved the order, after the seller had accepted.
  - **Changed rates go back to the seller:** an order whose rates differ from those the seller accepted for the listing asks that seller first. `POST /listings/{id}/accept-fees` lets a seller re-accept a live listing without pausing it.
  - **The switch:** `FEE_STATEMENT_REQUIRED`, off until POL-FE-119; recorded in SponsorX-Switches.md.
  - **New agreement versions:** CAMPAIGN_ORDER v4, DEAL v2, MARKETPLACE_ORDER v3, PROPERTY_TERMS v3. Property terms no longer state fixed percentages, and the 30-day-notice rate change is gone.
- **Checked locally:**
  - the scanners, secret scan, audit, both builds and lint;
  - backend 292 files / 4,097 tests and frontend 220 / 2,742 on a portable Postgres 17, including the new tests;
  - e2e left to CI.
- **For HeckerCreatives:** POL-FE-119, the fee box on every acceptance screen, the sponsor's confirm-the-price screen and the PDF. Routes and fields are in polish.md item 119.
- **Tracker:** Polish rows POL-BE-119 and POL-BE-120 at Code review, rcfworks; POL-FE-119 Ready, HeckerCreatives.

## POL-BE-119 / POL-BE-120 · follow-ups the owner asked for (rcfworks)
- **Seller email when rates change:** a commission rule created or revised queues `notify.feeRatesChanged`, and the worker runs the same check daily. Each seller whose live listings' accepted fees no longer match gets one email naming them, never twice for the same set. Sent only with the switch on.
- **Existing sellers accept the new seller terms:** `GET /seller-terms` and `POST /seller-terms/accept`. With the switch on, a team on older terms can't list or accept orders until it accepts. The "new terms" screen is added to POL-FE-119.
- **The switch:** the owner first chose to wait for POL-FE-119, then asked for it on now. `FEE_STATEMENT_REQUIRED=on` is set on staging's api service (rcfworks); production's is the owner's to set. It takes effect when #511 deploys, and from then every acceptance is refused until POL-FE-119's screens send the statement.
- **Agreement display, checked:** every acceptance screen already shows the agreement's full text, loaded from the version in force, with a tick box before Accept or Sign: the athlete's order and offer, the sponsor's checkout, Deal Chat signing and seller onboarding. The new versions appear there once deployed. The gap was existing sellers, now covered by the seller-terms step above.

## POL-BE-119 / POL-BE-120 Done and deployed (rcfworks)
- **Merged and promoted:** #511 and #512 into main_development; #513 into main.
- **Deployed:** release = main = a85b4935 on staging and production. Main's CI and the deploy run passed.
- **Switch:** `FEE_STATEMENT_REQUIRED=on` on staging (rcfworks). Production is the owner's to set; I'm not permitted to read production's variables, so it's unconfirmed here. From this deploy, wherever it's on, every acceptance waits for POL-FE-119's screens.
- **Tracker:** Polish rows POL-BE-119 and POL-BE-120 Done 2026-11-21. Stage Progress row for 2026-11-21: 324 Done (S9 44), 21 days left, unchanged.

## Switch back off — staging matches production (POL-BE-119)

- **Why:** with the switch on, every acceptance is refused until POL-FE-119's screens send the fee statement. The owner wants staging to behave like production.
- **Done:** `FEE_STATEMENT_REQUIRED=off` on staging's api service (rcfworks, confirmed by reading the variable back). Production stays the owner's to set; it should be `off` too.
- **Effect:** the app works as before; every acceptance still records the fee statement it would have shown, marked not shown, and a hash that is sent is still checked.
- **Next:** turn it on in staging and production together once POL-FE-119 is live. SponsorX-Switches.md updated to match.

## POL-FE-121 · The rules wording on Confirmations gets its closing quotation mark (infinex1) — Code review (first committed as POL-FE-116, a number taken the same day)

- **What:** step 1 of `/athlete/confirmations` ("Your own rules") showed a large opening quotation mark and no closing one, so on a PC the box looked cut off and testers tried to scroll it. The box is not meant to scroll: it grows to fit the whole statement. It now ends with a matching closing mark, bottom-right, and the bottom padding is wider so the mark sits under the last line instead of on it.
- **Where:** `frontend/src/app/(app)/athlete/confirmations/confirmations.css`, `.sx-cw-quote` and the new `.sx-cw-quote::after`. CSS only.
- **Step 2 (Content Collaboration Agreement) was checked and already scrolls:** its reader is capped at `min(28rem, 55vh)` and scrolls inside. In Chrome a mouse wheel scrolled a mock of it 600px at 1280px wide, and a touch swipe scrolled it 500px on an iPhone 13 viewport.
- **Checked:** rendered the box at 1280px and on an iPhone 13; the closing mark clears the last line on both. `npm run build` (frontend) passes. Frontend tests: 2,522 pass, 2 fail in `tests/deal-chat.test.ts`. Those two fail the same way on `main_development` without this change (the live-socket work of 2026-11-19), so they are not caused by it.
- **Tracker:** Polish row `POL-FE-121` (row 171), added with POL-FE-122 (#519).
