# SponsorX Scenario Planner

**Task `3S7-BE-01` · Version 1.0 · 2026-10-15 · Phase 3, Sprint 7**

A what-if for BTG's planning desk and Sales. It answers "if a sponsor spends
this budget at this price per 1,000 views, on this audience, split across
these formats, what happens?" The planner screen (`3S7-FE-03`,
`/admin/intelligence/scenarios`) shows it. The contract is
`frontend/src/lib/scenarios-live.ts`.

## 1 · The answer

| Step | How |
|---|---|
| **What the budget buys** | Each format's share of the budget ÷ its price per post. The price is the tenant's median booked sell price for that format over the last year, or the NIL job catalogue's sell band midpoint before anything is booked. |
| **What that delivers** | Posts × the audience's verified views per published post: low (25th percentile), likely (median) and high (75th). These come from the matching athletes' latest feature snapshots. With fewer than 3 matches, it uses every athlete's. |
| **What is sold** | Budget ÷ CPM × 1,000: the views the sponsor would be promised |
| **Chance of delivering in full** | A normal approximation. The spread is taken from the 25th–75th percentile band, as the forecast does. |
| **Expected revenue** (user, 2026-10-15) | The budget, reduced in proportion when the likely delivery falls short of what is sold. That reduction is what a make-good would cost. |

**The formats** are social posts (Story Drop, Sponsored Post) and videos
(Athlete Reel, Product Experience, Content Day). These are the formats it can
both price and measure in views. Appearances and packages aren't offered.

**The audience** is sport, states and age band, matched against bookable
athletes.

**With no verified delivery history at all,** the views are assumed to match
the price, and the chance is shown as 50% with a note saying it is unknown.
Confidence is 0.2. Otherwise it is 0.8 for the audience's own history and 0.6
for the whole network's.

Every fallback is named in the answer's `notes`. Model `scenario-rules@1.0.0`.

## 2 · Endpoints

- `GET /intelligence/scenarios?page&size` returns:
  - the saved scenarios, newest first;
  - the suggested starting inputs: $10,000, the tenant's benchmark CPM (or $20), 60% posts and 40% videos;
  - what it can calculate for: formats, sports, states and age bands.
- `POST /intelligence/scenarios/calculate { inputs }` returns the answer. **Nothing is stored.**
- `POST /intelligence/scenarios { name, inputs }` calculates and keeps the scenario, with its answer and model stamp, so two can be compared exactly as they were made.
- **Errors:** 422 with the problems in words. For example: the mix doesn't add up to 100%, a format it can't price, or a state code that isn't two capitals.

**Who** (`scenario`, RBAC matrix §33): BTG admins, campaign managers and Sales.

## 3 · Where it lives

- `backend/src/domain/scenario-rules.ts`: the arithmetic. No database access.
- `backend/src/domain/scenario-engine.ts`: prices, views per post, the saved scenarios.
- The `Scenario` table (migration `20261015150000_scenarios_anomalies_zoho_intel`).
- **Proof:** `backend/tests/scenarios.test.ts`. It covers:
  - every figure worked out by hand;
  - the audience and network fallbacks;
  - the catalogue price;
  - two saved scenarios compared;
  - roles and tenants.
