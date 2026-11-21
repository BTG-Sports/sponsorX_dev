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
