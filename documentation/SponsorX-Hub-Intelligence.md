# SponsorX Sponsor and Property Hubs

**Task `3S7-BE-02` · Version 1.0 · 2026-10-15 · Phase 3, Sprint 7**

Two reads serve the hubs HeckerCreatives built:
- `GET /intelligence/sponsor`, for the sponsor's results page (`3S7-FE-01`, `/sponsor/intelligence`);
- `GET /intelligence/property`, for a team's or school's page (`3S7-FE-02`, `/property/intelligence`).

They answer the shapes in `frontend/src/lib/sponsor-intelligence-live.ts`
and `frontend/src/lib/property-intelligence-live.ts`
(`SponsorX-Phase3-Screen-Contracts.md`).

**Who** (RBAC matrix §32):
- **The sponsor hub:** a sponsor's admins and analysts, for their own org only.
- **The property hub:** a property's manager, for their own property only.
- **Neither read takes an id.** The org or property comes from the caller, so there is nothing to tamper with.
- **No BTG role reads either.**

**Sources:**
- the fact ledger's daily summaries (never the warehouse);
- redemption events;
- the tenant's benchmark;
- the forecasts;
- the CPM engine's stored suggestions;
- the property's own inventory and sold lines.

## 1 · The sponsor hub

`GET /intelligence/sponsor?range=7d|30d|90d|all`. The default is 30 days. "All"
also counts bookings filed before the first campaign started.

**Campaigns.** The sponsor's campaigns, excluding drafts. Cancelled campaigns
are left out of the count. "Active" means currently running.

**The four attribution classes, never added together** (user, 2026-10-15):

| Class | Count | Money |
|---|---|---|
| Fans who redeemed (`VERIFIED_REDEMPTION`) | REDEEM events on the sponsor's rewards | none |
| Sales matched to you (`VERIFIED_TRANSACTION`) | partner sales matched exactly to the sponsor's campaigns in the range (3S6-BE-03); 0 until a partner sends any | sales less refunds, as the partner reported them |
| Sales likely from you (`MODELLED`) | partner sales a model linked to them, always "likely" | sales less refunds |
| Estimated media value (`ESTIMATED_MEDIA_VALUE`) | verified views | verified views × the tenant's benchmark median per 1,000. An estimate, never revenue. Null with no benchmark. |

**Formats.** The ledger's inventory keys are read as inventory kinds:

| NIL job | Kind |
|---|---|
| Story Drop, Sponsored Post | SOCIAL_POST |
| Athlete Reel, Product Experience, Content Day | VIDEO |
| Local Appearance | APPEARANCE |
| Monthly Ambassador | PACKAGE |

A listed item reads as its own kind, and an ad slot as AD_SLOT.

For each format:
- **Verified impressions:** API and manual only.
- **Redemptions:** each redemption goes with the athlete's order in that campaign. If there are several, it goes with the largest booking.
- **Cost per redemption:** net booked spend ÷ redemptions.
- **Provenance:** API or manual, whichever is larger.

**Partners:**
- **Athletes** score the average of what applies:
  - **delivery:** published ÷ due;
  - **reach:** their verified views per published deliverable, against this sponsor's average.

  Each part is capped at 1. Confidence grows to full at 5 published deliverables.
- **Teams and schools** (from the sponsor's marketplace orders) score the share of their paid lines that were fulfilled.
- Highest first.

**Audience segments are always empty.** Nothing on file names a real source
for an audience breakdown, and a segment without one is never shown (user,
2026-10-15).

**Renewal advice.** Covers campaigns ending in the next 45 days or ended in
the last 30, that have a forecast:
- **The share:** the forecast's projection ÷ the guarantee.
- **The advice,** at the forecast's thresholds (user, 2026-10-15):
  - 80% or more: **renew**;
  - 50% or more: **renew with changes**;
  - under 50%: **let it end**.
- **The reasons** are plain sentences: delivered against the promise, fans who redeemed, and the advice.
- **Soonest ending first.** Model `renewal-rules@1.0.0`.

## 2 · The property hub

`GET /intelligence/property`. The property's inventory is the items it owns
and its roster athletes' items, active only.

| Part | Is |
|---|---|
| Suggested prices | Each item's latest stored suggestion from the CPM engine (it prices athletes' items, so these are the roster's), with its three largest factors |
| Open opportunity | Items with nothing sold in 12 months, at their listed price. Marked an estimate. |
| Sell-through | Per format: items, and those with a sale in 12 months |
| Category fit | Per brand category: 0.4, plus 0.3 if items are listed for it, plus 0.3 × sales to its brands (full at 3). A category restricted for the property fits 0; so does an age-gated one for a school, with the reason. |
| Quality (0–100) | The average of: listings complete (a description and a category), on sale (a published listing) and, once there are paid orders, orders fulfilled |

## 3 · Where it lives

- `backend/src/domain/sponsor-intelligence.ts` and `backend/src/domain/property-intelligence.ts`.
- `backend/src/routes/v1/intelligence.ts`: the two endpoints.
- **Proof:** `backend/tests/hub-intelligence.test.ts`. It covers:
  - every figure worked out by hand;
  - the four classes kept apart;
  - the window;
  - a rival sponsor in the same tenant, and another tenant;
  - another property;
  - every other role refused.
