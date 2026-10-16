# SponsorX Phase 3 · Acceptance and Rollout

**Task `3S9-PMO-01` · Version 1.0 · 2026-10-16 · Phase 3, Sprint 9**

**Done when:** all 12 Phase 3 acceptance criteria are demonstrated and signed
off. **The rollout rule:** roll out per tenant behind the feature flags, BTG's
own data first, before any outside property sees a recommendation.

This document shows each criterion working, says how the rollout goes, and
ends with the sign-off.

## 1 · How each criterion was demonstrated

- **The proof is the automated test** that exercises the criterion against a
  real Postgres database, migrated exactly as CI and production are.
- **Run on 2026-10-16** against release `11d0a316` (the code deployed that
  morning): **196 of 196 tests passed** across the 18 test files below.
- **The same tests run on every pull request and on `main`** before any
  deploy, so a criterion that stops holding blocks the release.
- **Live:** staging and production run that release. The health check
  (`/health/full`, every 15 minutes) includes the nightly pipeline
  (3S9-OPS-01).

## 2 · The 12 criteria

### 1 · Every recommended price exposes its version, confidence and factors

**Built by** 3S2-BE-01/02/03. Every suggested price carries:
- its model stamp (`cpm-rules@1.0.0`);
- a confidence from 0 to 1;
- its factors, which add up exactly to the price.

The sell floor shows as its own factor.

**Proof** (`pricing-engine.test.ts`, 17/17; `pricing-learning.test.ts`, 17/17):
- "one item's detail: base, factors that add up, floor, range and stamp";
- "never goes below the sell floor; the floor shows as its own factor, and the
  sum still adds up".

### 2 · A price is overridden only with permission and a reason

**Built by** 3S2-BE-03:
- only BTG admins may override;
- the reason must be 10 to 500 characters;
- an override can never go below the floor;
- every attempt is audited;
- the suggestion itself is never edited.

**Proof** (`pricing-engine.test.ts`):
- "an override: BTG admins only, with a reason of 10–500 characters, never
  below the floor (and the attempt is audited)";
- "the database refuses any edit of a suggestion or an override".

### 3 · Matching never returns unavailable or category-conflicted inventory

**Built by** 3S3-BE-03. The filter runs **before** any score. It removes the
unavailable, the category-conflicted and the brand-unsafe; they are counted,
never shown. A minor or a school is never matched to a sensitive category.

**Proof** (`match-engine.test.ts`, 14/14; `match-score.test.ts`, 19/19):
- "removes the unavailable, the category-conflicted and the brand-unsafe";
- "ranks athletes best first, removing the unavailable, the conflicted and the
  unsafe — only counted, never shown";
- "a minor or a school is never matched to a sensitive category".

### 4 · A brief gets ranked recommendations with reasons, in the agreed time

**Built by** 3S3-BE-01/02.
- **Each recommendation** shows its 8 factors, which sum to its score.
- **The agreed target** is under 2 seconds for about 1,000 candidates (user,
  2026-10-14; [`SponsorX-Match-Engine.md`](./SponsorX-Match-Engine.md)).

**Proof** (`match-engine.test.ts`):
- "answers within the agreed time: a thousand athletes ranked in under 2
  seconds";
- "an athlete: eight factors out of 100, contributions summing to the score
  exactly".

### 5 · Forecasts refresh automatically and keep their history

**Built by** 3S4-BE-01/02. The nightly run makes:
- the pacing for every day so far;
- one forecast per active campaign per night.

Past forecasts are kept, never overwritten.

**Proof** (`forecast.test.ts`, 17/17):
- "nightly: pacing for every day so far, a forecast per active campaign, and
  the alerts";
- "the next night: … the history keeps both forecasts".

[`SponsorX-Forecasting.md`](./SponsorX-Forecasting.md)

### 6 · At-risk campaigns raise actionable alerts before they end

**Built by** 3S4-BE-03.
- **When an alert is raised:** a campaign below 80% chance of meeting its
  guarantee is on watch, and below 50% it is at risk. The alert is raised
  once, before the end, never in the first fifth of the flight.
- **Who is told:** BTG admins and campaign managers get one email, with the
  reason and the action to take.
- **When it clears:** recovery closes the alert.

**Proof** (`forecast.test.ts`):
- "alerts: raised once, before the end and after the first fifth";
- "deliverables by default: watch at 72%, with the overdue one as the reason
  and chasing it as the action";
- "an alert is raised before the end, never in the first fifth".

### 7 · Make-goods respect the target, availability, exclusivity and value

**Built by** 3S5-BE-01/02. Substitutes must fit:
- the sponsor's target;
- what is free for the window;
- exclusivity;
- an equivalent value.

Automatic approval needs every safety check to pass; otherwise the make-good
is held for a person, with the reason. A decided make-good can never change.

**Proof** (`makegood.test.ts`, 16/16):
- "the substitutes respect the target, availability, exclusivity and
  equivalence";
- "an option failing a check is never approved";
- "a decided make-good can never change — the database refuses".

[`SponsorX-Make-Goods.md`](./SponsorX-Make-Goods.md)

### 8 · Attribution names source, method and confidence; modelled is never verified

**Built by** 3S6-BE-01/02/03/04.
- **What every partner sale carries:** its source, method, matched key, window
  and confidence.
- **The database refuses a modelled sale labelled verified.**
- **The four classes are never added together.**

**Proof** (`attribution-matching.test.ts`, 12/12; `attribution-framework.test.ts`, 7/7):
- "02 · the database refuses a modelled sale labelled verified, and a verified
  one that is not certain";
- "03 · the modelled fallback … marked as modelled with its version and
  confidence";
- "03/04 · the desk: four totals never added together".

[`SponsorX-Attribution-Matching.md`](./SponsorX-Attribution-Matching.md)

### 9 · The reported figures reconcile to orders and payments within tolerance

**Built by** 3S1-BE-01, 3S1-QA-01/03 and 3S9-QA-02.
- **What is reported from:** the fact ledger in the app database, not the
  warehouse (3S1-OPS-02 keeps the warehouse on hold, unused).
- **The nightly fact check** compares every figure against the live campaign,
  order and payment records.
- **The tolerance is exact:** any difference fails, and BTG admins are emailed.
- **Payments** are reconciled against the ledger to the cent.

**Proof** (`fact-app-check.test.ts`, 6/6; `fact-nightly.test.ts`, 7/7;
`phase2-reconciliation.test.ts`, 10/10; `backtest.test.ts`, 7/7):
- "catches a summary changed by hand";
- "catches a record changed without its action";
- "a mismatch emails each of the tenant's active BTG admins once";
- "payouts ↔ ledger: every paid payout is one PAYOUT journal per order it
  covered, to the cent";
- "reconciliation is within tolerance only when the fact check ran recently
  and matched exactly".

[`SponsorX-Backtest.md`](./SponsorX-Backtest.md)

### 10 · The anomaly console finds seeded duplicate, bot and redemption patterns

**Built by** 3S8-DATA-01. The test seeds each pattern, runs the nightly rules,
and reads the console:
- a duplicate post;
- 40 clicks in 40 seconds;
- 12 redemptions in 3 minutes;
- one fan redeeming 3 times;
- a view spike;
- an over-reported manual entry.

**Proof** (`anomalies.test.ts`, 9/9):
- "nightly: every seeded pattern is flagged once; the duplicate post is
  excluded automatically and audited";
- "the console: open highest severity first, counts by kind".

[`SponsorX-Anomalies.md`](./SponsorX-Anomalies.md)

### 11 · A model version is activated, rolled back and compared without a release

**Built by** 3S8-BE-01. Settings are numbered versions per tenant.
- **Inside the safe range:** a change goes live automatically.
- **Outside it:** a second person must validate the change before it goes live.
- **Rollback and compare:** any retired version can be made active again, and
  versions are compared side by side, with their backtests.

**Proof** (`model-registry.test.ts`, 7/7; `backtest.test.ts`):
- "a change inside the safe range goes live at once, automatically — and the
  engine uses it from its next run";
- "roll back to any retired version, with no deployment; compare versions by
  their settings";
- "the models screen: each version's backtest beside its outputs".

[`SponsorX-Model-Governance.md`](./SponsorX-Model-Governance.md)

### 12 · Every intelligence feature can be switched off per tenant

**Built by** 3S8-OPS-01. There are ten features: pricing, matching,
forecasts, make-goods, anomalies, scenarios, the sponsor hub, the property
hub, the Zoho push and attribution.
- **Off:** the feature's pages answer that it is switched off, and its nightly
  run skips the tenant.
- **Every switch is audited.**

**Proof** (`phase3-feature-flags.test.ts`, 11/11, added for this
acceptance). It switches **each of the ten** off and back on for one tenant:
- refused while off;
- another tenant untouched;
- answering again once back on.

A feature added later without a check fails the test.

## 3 · The staged rollout

**What "staged" means here.** The switches are per tenant. Inside BTG's
tenant, the **internal** desks are seen only by BTG staff:
- pricing, matching, forecasts, make-goods, anomalies, scenarios, attribution,
  the model registry.

The **outside-facing** features are seen by sponsors and properties:
- the sponsor hub, the property hub, and the Zoho push (BTG's sales team).

| Stage | What is on | Who sees it | Move on when |
|---|---|---|---|
| **1 · BTG's data, internal** | the internal desks | BTG staff only | a week of nightly runs is clean: `/health/full` stays ok, with no failed step, no stale forecast and no drift |
| **2 · Outside-facing, BTG's own accounts** | the sponsor and property hubs | test sponsor and property accounts BTG controls | BTG has read both hubs and found nothing wrong or unsourced |
| **3 · Outside properties and sponsors** | everything | real sponsors and properties | your sign-off below |
| **Zoho push** | from stage 1 in staging (sandbox) | BTG's sales team in Zoho | the sandbox Account shows the score (3S7-INT-01); production fields at go-live |

**Today's position.** There are no outside sponsors or properties in
production before go-live, and production Zoho is not connected. So stages 1
and 2 run now on staging and BTG's own production data, and stage 3 is
go-live.

**Holding back one feature.** If you want one held back at go-live, switch it
off for the tenant on the models page (`PATCH /intelligence/flags`). It takes
effect at once and is audited.

**If something goes wrong** in any stage:
- switch the feature off for that tenant;
- roll the model back to its last good version on the models page.

Neither needs a code release.

## 4 · Sign-off

| | |
|---|---|
| **Criteria 1–12** | demonstrated above, 196/196 tests passing on release `11d0a316` |
| **Rollout plan** | §3 |
| **Signed off** | by the user, under the programme owner's delegated authority: "if it meets the acceptance criteria, move it to done" |
| **Date** | 2026-10-16 |
