# SponsorX Forecasting and Pacing

**Tasks `3S4-DATA-01`, `3S4-BE-01`, `3S4-BE-02` · Version 1.0 · 2026-10-14 · Phase 3, Sprint 4**

Every night, for every active campaign, SponsorX:
1. records how delivery is pacing against plan;
2. forecasts where the campaign will end up, and the chance of it reaching its guarantee;
3. raises an alert, with a recommended action, while there is still time to act.

The admin forecast dashboard (`3S4-FE-01`, `/admin/intelligence/forecasts`)
shows all of it.

It builds on `delivery-health.ts` (P7-DATA-04). That check still serves the
operations dashboard, and its fixed rules are unchanged. The forecast is the
forward-looking version.

## 1 · The guarantee

What a campaign is promised to reach by its end date. BTG can set one per
campaign: a number of **impressions**, **engagements**, **redemptions** or
**deliverables** (`PUT /intelligence/forecasts/{campaignId}/guarantee`; BTG
admins and campaign managers; audited as `campaign.guaranteeSet`).

**Unset, it is every deliverable booked, published and verified by the end
date** (user, 2026-10-14). That's what sponsors are contracted for today, so
every active campaign has a forecast from its first day.

**Delivery is verified delivery only:**
- impressions and engagements: the fact ledger's API-verified and manually verified labels;
- redemptions: `REDEEM` events;
- deliverables: verified deliverables.

A self-reported figure never counts.

## 2 · Pacing (`3S4-DATA-01`)

One `CampaignPacing` row per active campaign per day:
- the share of the flight gone;
- the cumulative delivery;
- what the plan expected by then: the guarantee spread evenly for a flow, or the deliverables due by that day.

The nightly run fills any day missing since the campaign started. The
dashboard draws its pacing chart from these rows.

## 3 · The forecast (`3S4-BE-01`)

**Flows (impressions, engagements, redemptions).**
- **Projection:** today's total plus a daily rate over the days left.
- **Early on, the plan weighs in.** The observed rate is blended with the
  plan's rate, and fully trusted once 30% of the flight has gone. Two days of
  nothing is not yet a forecast of nothing.
- **Range and probability:** the spread of the daily figures gives an 80%
  range (low, high). It also gives the probability of reaching the guarantee,
  through a normal approximation.

**Deliverables.** Each deliverable still to verify has a chance of landing
before the end date:

| Situation | Chance |
|---|---|
| Not yet due | 98%, lower for an athlete who has been late (0.5 + 0.5 × their on-time rate) |
| Overdue, a week or more left | 75% |
| Overdue, under a week left | 40% |

The guarantee needs every one, so the probability is their product.

**Risk** (user, 2026-10-14):

| Probability | Risk |
|---|---|
| 80% or more | on track |
| 50% to 80% | watch |
| under 50% | at risk |

**Kept as history.** `CampaignForecast` holds one forecast per campaign per
day, as made, with the model version (`forecast-rules@1.0.0`), so the model
can be judged later. A second run the same day changes nothing.

## 4 · Risk, reasons and actions (`3S4-BE-02`)

**Reasons** (`riskFactors`):
- **behind pace:** under 80% of what was expected by today;
- **overdue work;**
- **projected shortfall;**
- **channel lagging:** one channel delivering under 30% of the campaign's average per deliverable;
- **running out of time:** 80% of the flight gone with a shortfall.

**Recommended actions**, only for a campaign that isn't on track:

| Action | When |
|---|---|
| Accelerate content | Deliverables are overdue |
| Change channel | A channel is lagging (names the better one) |
| Add a deliverable | A shortfall with time left (says how many cover the gap) |
| Reserve make-good inventory | A shortfall with under 20% of the flight left |

**Alerts** (`CampaignForecastAlert`):
- **When.** An alert is raised when a campaign crosses into watch or at risk:
  - **before its end date**, never after;
  - **not in the first 20% of the flight**, because early on delivery lags the posts. The risk still shows on the dashboard.
- **At risk is emailed once** to the tenant's BTG admins and campaign managers
  (`forecast.atRisk`), with the recommended actions.
- **It's held through a dip to watch,** so a campaign hovering at a threshold
  doesn't email every night.
- **Back on track closes it,** and an at-risk alert that was emailed sends one
  "back on track" email (`forecast.recovered`).
- **The switch.** Emails go only where `FORECAST_EMAILS=on`. The forecast and
  the dashboard alert run either way.

## 5 · When, reads and who

**When.** Every night, after the fact check, benchmarks, snapshots and
suggested prices. A tenant whose fact check failed forecasts nothing that
night. `npm run forecasts:refresh -- [--tenant <id>]` does the same by hand.

**Reads:**
- `GET /intelligence/forecasts?risk=all|at_risk|watch|on_track&page&size`
  returns every active campaign's latest forecast, riskiest first (then lowest
  probability, then soonest end), with counts over the tenant.
- `GET /intelligence/forecasts/{campaignId}` returns that forecast plus:
  - the pacing;
  - the projected band to the end date;
  - the reasons and actions;
  - the open alert;
  - every past forecast, newest first.

**Who** (`campaignForecast`, RBAC matrix §30):
- BTG admins, campaign managers and Sales read.
- BTG admins and campaign managers set guarantees.
- No sponsor sees a forecast.
- A campaign in another tenant answers 404.

## 6 · Where it lives

- `backend/src/domain/forecast-rules.ts`: the flight, both forecasts, risk, reasons, actions, alerts. No database access.
- `backend/src/domain/forecast-engine.ts`: gathering the facts, the nightly run, the reads, the guarantee.
- `backend/src/routes/v1/intelligence.ts`: the three endpoints.
- Migration `20261014210000_forecasting`: the campaign's guarantee, `CampaignPacing`, `CampaignForecast`, `CampaignForecastAlert`.
- **Proof:** `backend/tests/forecast.test.ts`. It covers:
  - every figure worked out by hand;
  - three simulated campaigns through the real nightly run: on watch, at risk and emailed, and too early to alert;
  - a recovery the next night;
  - the history;
  - emails off;
  - roles and tenants.
