# SponsorX — Phase 3 · Intelligence & Attribution

**BTG SPORTS GROUP · SPONSORX · PHASE 3 · INTELLIGENCE & ATTRIBUTION**

| | |
|---|---|
| **Goal** | Make SponsorX intelligent. Recommend prices, identify best-fit sponsors, forecast delivery, flag underperformance before a campaign ends, detect suspicious metrics and ingest verified commerce attribution. |
| **Tasks** | 44 · 184 person-days |
| **Blueprint timeline** | 18–22 weeks |
| **Balanced budget** | $105K–$160K |
| **Depends on** | Phase 2 transaction history, campaign performance data, marketplace activity, reliable event ingestion |
| **Source** | Phases 2–4 Detailed Developer Specifications v1.0 (Spec § references) + Blueprint §33 |

### The four phase documents

| Phase | File | Tasks | Timeline |
|---|---|---|---|
| 1 | [`SponsorX-Phase1-Managed-Marketplace.md`](./SponsorX-Phase1-Managed-Marketplace.md)  | 186 | 14–18 weeks |
| 2 | [`SponsorX-Phase2-Marketplace-Commerce.md`](./SponsorX-Phase2-Marketplace-Commerce.md)  | 64 | 16–20 weeks |
| 3 | [`SponsorX-Phase3-Intelligence-Attribution.md`](./SponsorX-Phase3-Intelligence-Attribution.md) **← you are here** | 44 | 18–22 weeks |
| 4 | [`SponsorX-Phase4-INFINEX-Integration.md`](./SponsorX-Phase4-INFINEX-Integration.md)  | 51 | 18–22 weeks |

---

## ⚙️ How this project is tracked — read this first

Three artefacts, three jobs. Keeping them straight is what stops them drifting apart.

| Artefact | Owns | When it changes | Who touches it |
|---|---|---|---|
| **These four Markdown files** | The **plan** — what each task is, in plain English, and what *done* means | Only when scope or a task's meaning changes | Anyone, by pull request, reviewed like code |
| **`SponsorX-Full-Programme-Task-Board.xlsx`** | The **working tracker** — all four phases consolidated in one file | Continuously, during the day | Every developer, as they work |
| **Google Sheet** [SponsorXFullProgrammeTaskBoard](https://docs.google.com/spreadsheets/d/10PGtZb3jGBBHhbNOWwl__hS0b_HKN7EL0KRHrnSVoI0/) | The **published status** — what the team and stakeholders see | Once a day, at end of day | Whoever worked that day |

### 🔁 The daily rule

> **During the day:** tag your task **In progress** in the consolidated **xlsx**. Set your name in `Owner` and fill in `Date Started`. Move it to `Code review`, then `Done`, as it advances.
>
> **At end of day:** whatever state your tasks are in — finished, half-done, blocked, untouched — **update the Google Sheet to match.** That is the copy other people read. A task left `Blocked` in the Sheet when you have actually finished it is a teammate sitting idle tomorrow for no reason.
>
> **Reference the task ID** (e.g. `2S5-BE-04`) in your branch name and commit message so the row and the code can be matched later.

If a task's *definition* turns out to be wrong — the acceptance criteria don't hold, or it should be two tasks — fix it **here**, in the Markdown, by pull request. Don't quietly reinterpret it in the tracker.

**No spreadsheet is committed to this repository.** `documentation/*.xlsx` is gitignored: a committed binary goes stale against the Sheet the moment anyone edits it, and cannot be reviewed in a diff.

---

## Reading a task

| Field | Meaning |
|---|---|
| **ID** | `3S{sprint}-{CAT}-{nn}`, e.g. `3S5-BE-04` — Phase 3, Sprint 5, Backend, task 04. |
| **Order** | Sequence within the phase, following the blueprint's own sprint plan. |
| **Where** | Where the work physically happens — see the table below. A document task and a dashboard task look identical in a list; this is what separates them. |
| **Weight** | S=1 · M=3 · L=5 person-days. Estimates for one person, not calendar commitments. |
| **Status** | `Ready` no unmet prerequisites · `In progress` · `Code review` · `Blocked` · `Done`. |
| **Done when** | The observable condition that closes the task. If you cannot demonstrate it, it is not done. |

## Where the work happens

| Value | Meaning |
|---|---|
| **Document** | A written decision or specification. No system is touched — the output is a document people agree on. |
| **Zoho dashboard** | Configuration clicked through the Zoho CRM admin UI (Setup → Modules and Fields, API credentials, users). |
| **Vendor console** | Configuration in a vendor's own UI — Railway, Cloudflare, Clerk, the payment or email provider. |
| **Code** | Work in the repository: schema, domain logic, routes, worker jobs, UI, tests, CI. |
| **Code + console** | Both: something configured at the vendor AND wired in the codebase. |
| **Design tool** | Visual design work producing artwork, diagrams or screen designs. |
| **Document + code** | A written policy that must then be enforced in the codebase. |
| **External · counsel** | Performed by a lawyer, not the team. Longest lead times in the programme — start these early. |

## Categories

| Code | Category | Covers |
|---|---|---|
| **FE** | Frontend Engineering | Next.js routes, server components, client islands, forms, charts, responsive and theme work |
| **BE** | Backend Engineering | Prisma schema and migrations, domain functions, route handlers, worker jobs, queue, scoping |
| **INT** | Integrations | Zoho CRM + Books, Clerk, R2, transactional email, social-platform APIs, webhooks |
| **OPS** | DevOps & Infrastructure | Railway project and services, environments, CI/CD, migrations, backups, monitoring, runbooks |
| **ART** | Design & Art | Brand system, theme tokens, logo and asset production, screen design, illustration, QR and report design, marketing visuals |
| **QA** | Quality Assurance & Testing | Unit, authorisation matrix, E2E, accessibility, performance, UAT scripts |
| **SEC** | Security & Compliance (engineering) | Tenant isolation, field-level authz, consent capture, PII handling, audit logging, MFA |
| **DATA** | Data & Analytics | Metric provenance, rollups, Content Value Score, seed and import jobs, reporting datasets |
| **LEG** | Legal & Policy | Counsel-approved templates, guardian authorisation, privacy review, reward terms, payment policy. Not developer work — but it blocks developer work. |
| **PMO** | Product, Docs & Delivery | Gate decisions, §38 deliverables, RBAC matrix, ERD, Zoho field mapping, admin guide, handoff documentation |

---

# The tasks

## Sprint 0 · Analytics architecture

*Warehouse schema, event taxonomy audit, model governance and — critically — what the word 'attribution' is allowed to mean.*

*6 tasks · 20 person-days*

### ⏸ `3S0-PMO-01` · Define what attribution is permitted to claim

**Order** 1 · **PMO** · **Where:** Document · **3d** · **Blocked**

The most important decision in Phase 3 and it is a language decision, not a technical one. Verified redemption, verified transaction, modelled attribution and estimated media value are four different things and must never be blended in a sponsor report.

- **Depends on:** Phase 2 complete
- **Done when:** Written definitions for every attribution class, with the reporting language each is allowed to use
- **Reference:** Spec §17.4, §22

### ⏸ `3S0-PMO-02` · Model governance policy

**Order** 2 · **PMO** · **Where:** Document · **3d** · **Blocked**

How a model version is proposed, validated, activated, rolled back and compared. Without this, nobody can explain why a price changed.

- **Depends on:** Phase 2 complete
- **Done when:** Governance policy written: versioning, confidence, explanation, override, monitoring and rollback
- **Reference:** Spec §15

### ⏸ `3S0-DATA-01` · Event taxonomy audit

**Order** 3 · **DATA** · **Where:** Document · **3d** · **Blocked**

Audit every event Phases 1 and 2 emit before building a warehouse on top of them. Inconsistent event definitions are what make analytics untrustworthy later.

- **Depends on:** Phase 2 complete
- **Done when:** Every event type inventoried with its definition, source and known gaps
- **Reference:** Spec §21

### ⏸ `3S0-DATA-02` · Design the warehouse schema and semantic layer

**Order** 4 · **DATA** · **Where:** Document · **5d** · **Blocked**

Facts and dimensions separated from the transactional database, so analytical queries never slow down the product.

- **Depends on:** 3S0-DATA-01
- **Done when:** Warehouse schema designed and reviewed; the daily campaign fact table and its dimensions are specified
- **Reference:** Spec §19

### ⏸ `3S0-OPS-01` · Select the warehouse and transformation layer

**Order** 5 · **OPS** · **Where:** Vendor console · **3d** · **Blocked**

Snowflake, BigQuery, Redshift or Postgres depending on scale, plus dbt or equivalent for versioned transformations.

- **Depends on:** 3S0-DATA-02
- **Done when:** Warehouse and transformation tooling selected, provisioned and cost-modelled
- **Reference:** Spec §20

### ⏸ `3S0-LEG-01` · Attribution, consent and partner terms review

**Order** 6 · **LEG** · **Where:** External · counsel · **3d** · **Blocked**

Counsel reviews the attribution claims, the consent basis for using fan data this way, and what partner contracts actually permit.

- **Depends on:** 3S0-PMO-01
- **Done when:** Written approval of attribution claims, consent basis and sponsor-facing reporting language
- **Reference:** Spec §23

## Sprint 1 · Warehouse & benchmarks

*Get the data out of the transactional database and into an analytical model that can be trusted.*

*4 tasks · 16 person-days*

### ⏸ `3S1-DATA-01` · Warehouse ingestion pipeline

**Order** 7 · **DATA** · **Where:** Code · **5d** · **Blocked**

Move transactional data into the warehouse on a schedule, idempotently, so a re-run never double-counts.

- **Depends on:** 3S0-DATA-02
- **Done when:** Ingestion runs on schedule and is safe to re-run
- **Reference:** Spec §21

### ⏸ `3S1-DATA-02` · Daily campaign fact and dimension tables

**Order** 8 · **DATA** · **Where:** Code · **5d** · **Blocked**

The core analytical model: one row per campaign per day, with conformed dimensions for property, sponsor, channel and inventory.

- **Depends on:** 3S1-DATA-01
- **Done when:** Warehouse metrics reconcile to transactional campaign, order and payment totals within defined tolerance
- **Reference:** Spec §19, §22

### ⏸ `3S1-DATA-03` · Benchmark pipeline

**Order** 9 · **DATA** · **Where:** Code · **3d** · **Blocked**

Percentile benchmarks by sport, market, format and audience — p25, median, p75 with sample size, so a small sample is visibly small.

- **Depends on:** 3S1-DATA-02
- **Done when:** Benchmarks compute with sample sizes exposed and refresh on schedule
- **Reference:** Spec §19

### ⏸ `3S1-QA-01` · Warehouse reconciliation tests

**Order** 10 · **QA** · **Where:** Code · **3d** · **Blocked**

Automated proof that the warehouse agrees with the source system. Run it every night, not once at launch.

- **Depends on:** 3S1-DATA-02
- **Done when:** Reconciliation tests run nightly and alert on drift beyond tolerance
- **Reference:** Spec §22

## Sprint 2 · Dynamic CPM engine

*Recommended pricing with a visible factor breakdown, a confidence score and governed overrides.*

*4 tasks · 18 person-days*

### ⏸ `3S2-BE-01` · Feature store and snapshot service

**Order** 11 · **BE** · **Where:** Code · **5d** · **Blocked**

Assemble the inputs a pricing model needs — audience, engagement, historical delivery, demand, seasonality, geography, scarcity — and snapshot them so a past recommendation can always be explained.

- **Depends on:** 3S1-DATA-02
- **Done when:** Feature snapshots generate on schedule and are retrievable by entity and date
- **Reference:** Spec §19

### ⏸ `3S2-BE-02` · Dynamic CPM engine v1 (rules-based)

**Order** 12 · **BE** · **Where:** Code · **5d** · **Blocked**

Start with rules and statistics, not machine learning. The spec is explicit: do not build ML pricing before there is enough clean history.

- **Depends on:** 3S2-BE-01
- **Done when:** Every recommended price exposes model version, confidence and factor breakdown
- **Reference:** Spec §17.1, §22

### ⏸ `3S2-BE-03` · Pricing recommendation and override records

**Order** 13 · **BE** · **Where:** Code · **3d** · **Blocked**

Store the recommendation immutably. An override is a separate record with a required reason — it never edits the original.

- **Depends on:** 3S2-BE-02
- **Done when:** Admin can override a price only with the right permission and a recorded reason; the recommendation is unchanged
- **Reference:** Spec §17.1, §22

### ⏸ `3S2-FE-01` · Build the pricing intelligence panel

**Order** 14 · **FE** · **Where:** Code · **5d** · **Blocked**

Recommended CPM, current rate, factor breakdown, confidence, historical range and the override control.

- **Depends on:** 3S2-BE-02
- **Done when:** Panel shows the full factor breakdown and confidence for any inventory item
- **Reference:** Spec §16 P3-01

## Sprint 3 · Sponsor matching

*Rank inventory against a sponsor brief, with human-readable reasons.*

*4 tasks · 16 person-days*

### ⏸ `3S3-BE-01` · Sponsor brief model

**Order** 15 · **BE** · **Where:** Code · **3d** · **Blocked**

Objective, budget, geography, sport, audience, included and excluded categories, dates and channels — the input to matching.

- **Depends on:** 3S2-BE-01
- **Done when:** A sponsor brief captures all matching inputs including exclusions
- **Reference:** Spec §19

### ⏸ `3S3-BE-02` · Match scoring service

**Order** 16 · **BE** · **Where:** Code · **5d** · **Blocked**

Score audience fit, geography, format, category affinity, historical performance, budget fit, sponsor history and inventory quality — then explain the score in words a salesperson can repeat.

- **Depends on:** 3S3-BE-01
- **Done when:** Brief produces ranked recommendations with explanation factors within the agreed response time
- **Reference:** Spec §17.2, §22

### ⏸ `3S3-BE-03` · Eligibility filter ahead of scoring

**Order** 17 · **BE** · **Where:** Code · **3d** · **Blocked**

Filter out unavailable, conflicted and brand-unsafe inventory before scoring. Ranking something that cannot be sold wastes everyone's time.

- **Depends on:** 3S3-BE-02
- **Done when:** Match explorer never returns unavailable or category-conflicted inventory
- **Reference:** Spec §22

### ⏸ `3S3-FE-01` · Build the sponsor match explorer

**Order** 18 · **FE** · **Where:** Code · **5d** · **Blocked**

Ranked athletes, properties and inventory with match scores and readable reasons, plus shortlist saving.

- **Depends on:** 3S3-BE-02
- **Done when:** Explorer ranks, explains and saves shortlists
- **Reference:** Spec §16 P3-02

## Sprint 4 · Forecasting & pacing

*Predict whether a campaign will hit its guarantee, and say so before it is too late to act.*

*4 tasks · 16 person-days*

### ⏸ `3S4-DATA-01` · Daily pacing job

**Order** 19 · **DATA** · **Where:** Code · **3d** · **Blocked**

Compare elapsed campaign time against delivered metrics, every day.

- **Depends on:** 3S1-DATA-02
- **Done when:** Pacing computes nightly for every active campaign
- **Reference:** Spec §17.3

### ⏸ `3S4-BE-01` · Delivery forecast service

**Order** 20 · **BE** · **Where:** Code · **5d** · **Blocked**

Estimate final impressions and the probability of hitting the guarantee, and keep every historical forecast so the model can be judged later.

- **Depends on:** 3S4-DATA-01
- **Done when:** Forecast refreshes automatically and persists historical forecasts
- **Reference:** Spec §17.3, §22

### ⏸ `3S4-BE-02` · Risk thresholds and alerting

**Order** 21 · **BE** · **Where:** Code · **3d** · **Blocked**

Campaigns crossing a risk threshold raise an alert with a recommended action — accelerate content, add a deliverable, change channel, or reserve make-good inventory.

- **Depends on:** 3S4-BE-01
- **Done when:** At-risk campaigns generate actionable alerts before campaign end, not after
- **Reference:** Spec §17.3, §22

### ⏸ `3S4-FE-01` · Build the campaign forecast dashboard

**Order** 22 · **FE** · **Where:** Code · **5d** · **Blocked**

Projected final delivery, probability of guarantee, pacing chart, risk factors and recommended actions.

- **Depends on:** 3S4-BE-01
- **Done when:** Dashboard shows pacing and risk for every active campaign
- **Reference:** Spec §16 P3-03

## Sprint 5 · Make-good optimiser

*When a campaign falls short, recommend equivalent substitute inventory.*

*3 tasks · 13 person-days*

### ⏸ `3S5-BE-01` · Make-good recommendation engine

**Order** 23 · **BE** · **Where:** Code · **5d** · **Blocked**

Given a shortfall, find substitute inventory of equivalent value that is actually available and does not create a category conflict.

- **Depends on:** 3S4-BE-01
- **Done when:** Recommendations respect sponsor target, availability, exclusivity and estimated value equivalence
- **Reference:** Spec §22

### ⏸ `3S5-BE-02` · Make-good approval workflow

**Order** 24 · **BE** · **Where:** Code · **3d** · **Blocked**

A make-good changes what a sponsor was sold, so it needs approval and an audit trail.

- **Depends on:** 3S5-BE-01
- **Done when:** Make-good approval is recorded, audited and reflected in the campaign
- **Reference:** Spec §18

### ⏸ `3S5-FE-01` · Build the make-good recommendation centre

**Order** 25 · **FE** · **Where:** Code · **5d** · **Blocked**

Shortfall amount, substitute options, equivalency score, cost impact and the approval action.

- **Depends on:** 3S5-BE-01
- **Done when:** Centre surfaces shortfalls and lets a manager approve a substitution
- **Reference:** Spec §16 P3-04

## Sprint 6 · Attribution framework

*Ingest commerce events from partners — and never present modelled revenue as verified.*

*5 tasks · 23 person-days*

### ⏸ `3S6-BE-01` · Attribution adapter framework

**Order** 26 · **BE** · **Where:** Code · **5d** · **Blocked**

Attribution is pluggable, never universal. Each adapter declares its method, lookback window and match approach.

- **Depends on:** 3S0-PMO-01
- **Done when:** A new attribution partner can be added as an adapter without changing the engine
- **Reference:** Spec §17.4

### ⏸ `3S6-BE-02` · Normalised attribution event model

**Order** 27 · **BE** · **Where:** Code · **5d** · **Blocked**

Partner events normalise into one shape carrying source, method, window, confidence and the matched entities.

- **Depends on:** 3S6-BE-01
- **Done when:** Attribution events identify source, method and confidence; modelled revenue is never labelled verified
- **Reference:** Spec §19, §22

### ⏸ `3S6-BE-03` · Deterministic-first matching engine

**Order** 28 · **BE** · **Where:** Code · **5d** · **Blocked**

Try the exact match first — reward token, order ID, partner click ID. Only fall back to probabilistic matching, and mark it explicitly when you do.

- **Depends on:** 3S6-BE-02
- **Done when:** Deterministic matches are attempted first; probabilistic matches carry an explicit method and confidence
- **Reference:** Spec §17.4

### ⏸ `3S6-BE-04` · Reconciliation queue for unmatched events

**Order** 29 · **BE** · **Where:** Code · **3d** · **Blocked**

Events that cannot be matched stay visible rather than disappearing. Silent data loss is worse than visible gaps.

- **Depends on:** 3S6-BE-03
- **Done when:** Unmatched and ambiguous events remain in a reviewable queue
- **Reference:** Spec §17.4

### ⏸ `3S6-FE-01` · Build the attribution dashboard

**Order** 30 · **FE** · **Where:** Code · **5d** · **Blocked**

Attributed transactions, revenue, method, window, confidence and unmatched events — with the four classes visually distinct.

- **Depends on:** 3S6-BE-02
- **Done when:** Dashboard distinguishes verified redemptions, verified transactions, modelled attribution and estimated media value
- **Reference:** Spec §16 P3-05

## Sprint 7 · Intelligence dashboards

*Sponsor and property hubs, and the scenario planner.*

*5 tasks · 23 person-days*

### ⏸ `3S7-FE-01` · Build the sponsor intelligence hub

**Order** 31 · **FE** · **Where:** Code · **5d** · **Blocked**

Cross-campaign insights, audience segments, best-performing formats and properties, renewal recommendations.

- **Depends on:** 3S1-DATA-02
- **Done when:** Hub renders cross-campaign intelligence for a sponsor
- **Reference:** Spec §16 P3-06

### ⏸ `3S7-FE-02` · Build the property intelligence hub

**Order** 32 · **FE** · **Where:** Code · **5d** · **Blocked**

Rate recommendations, revenue opportunity, sell-through, sponsor-category fit and a quality score.

- **Depends on:** 3S2-BE-02
- **Done when:** Hub renders rate and opportunity intelligence for a property
- **Reference:** Spec §16 P3-07

### ⏸ `3S7-BE-01` · Scenario planning service

**Order** 33 · **BE** · **Where:** Code · **5d** · **Blocked**

What-if: change budget, CPM, audience and inventory mix, and compare expected delivery and revenue.

- **Depends on:** 3S4-BE-01
- **Done when:** A scenario can be created, calculated and compared against another
- **Reference:** Spec §18

### ⏸ `3S7-FE-03` · Build the scenario planner

**Order** 34 · **FE** · **Where:** Code · **5d** · **Blocked**

The sales-conversation screen: adjust the inputs live while a sponsor watches.

- **Depends on:** 3S7-BE-01
- **Done when:** Planner calculates and compares scenarios interactively
- **Reference:** Spec §16 P3-08

### ⏸ `3S7-INT-01` · Push intelligence into Zoho

**Order** 35 · **INT** · **Where:** Code · **3d** · **Blocked**

Renewal scores, sponsor health and recommended next action flow back to the CRM where the sales team already works.

- **Depends on:** 3S7-FE-01
- **Done when:** Zoho shows renewal score and recommended next action on the sponsor record
- **Reference:** Spec §20

## Sprint 8 · Anomaly detection & model admin

*Catch bad data before a sponsor sees it; manage model versions without a deploy.*

*5 tasks · 23 person-days*

### ⏸ `3S8-DATA-01` · Anomaly detection rules

**Order** 36 · **DATA** · **Where:** Code · **5d** · **Blocked**

Improbable spikes, duplicate events, bot-like behaviour, suspicious redemption patterns and manual-entry inconsistencies.

- **Depends on:** 3S1-DATA-02
- **Done when:** Anomaly console identifies seeded duplicate, bot and redemption test patterns
- **Reference:** Spec §15, §22

### ⏸ `3S8-FE-01` · Build the data quality and anomaly console

**Order** 37 · **FE** · **Where:** Code · **5d** · **Blocked**

Flagged streams, suspicious redemptions, data-quality issues and the reviewer's disposition.

- **Depends on:** 3S8-DATA-01
- **Done when:** Reviewer can triage and resolve every flagged anomaly
- **Reference:** Spec §16 P3-09

### ⏸ `3S8-BE-01` · Model registry and activation

**Order** 38 · **BE** · **Where:** Code · **5d** · **Blocked**

Versions activate, roll back and compare without a code deployment. Pricing that requires a release to change is pricing nobody will trust.

- **Depends on:** 3S0-PMO-02
- **Done when:** A model version can be activated, rolled back and compared without deploying code
- **Reference:** Spec §22

### ⏸ `3S8-FE-02` · Build the model and rule administration screen

**Order** 39 · **FE** · **Where:** Code · **5d** · **Blocked**

Pricing factors, model versions, thresholds, benchmarks, rollouts and feature flags.

- **Depends on:** 3S8-BE-01
- **Done when:** Admin can manage model versions and thresholds from the UI
- **Reference:** Spec §16 P3-10

### ⏸ `3S8-OPS-01` · Per-tenant feature flags for intelligence

**Order** 40 · **OPS** · **Where:** Code · **3d** · **Blocked**

Every intelligence feature must be disableable per tenant. Not every customer should see a forecast.

- **Depends on:** 3S8-BE-01
- **Done when:** All intelligence features can be disabled per tenant through feature flags
- **Reference:** Spec §22

## Sprint 9 · Backtesting & rollout

*Validate the models against history before anyone makes a decision on them.*

*4 tasks · 16 person-days*

### ⏸ `3S9-QA-01` · Backtest the pricing and forecast models

**Order** 41 · **QA** · **Where:** Code · **5d** · **Blocked**

Run the models against historical campaigns and check whether they would actually have been right. This is what separates intelligence from decoration.

- **Depends on:** 3S8-BE-01
- **Done when:** Backtest results documented with accuracy and confidence calibration per model
- **Reference:** Spec §21

### ⏸ `3S9-QA-02` · Benchmark and reconciliation validation

**Order** 42 · **QA** · **Where:** Code · **3d** · **Blocked**

Confirm benchmarks are statistically meaningful and warehouse totals still tie out.

- **Depends on:** 3S1-DATA-03
- **Done when:** Benchmarks validated for sample size; reconciliation within tolerance
- **Reference:** Spec §22

### ⏸ `3S9-PMO-01` · Phase 3 UAT and staged rollout

**Order** 43 · **PMO** · **Where:** Document · **5d** · **Blocked**

Roll out per tenant behind flags, starting with BTG's own data, before any external property sees a recommendation.

- **Depends on:** 3S9-QA-01
- **Done when:** All 12 Phase 3 acceptance criteria demonstrated and signed off
- **Reference:** Spec §22

### ⏸ `3S9-OPS-01` · Model and pipeline monitoring

**Order** 44 · **OPS** · **Where:** Vendor console · **3d** · **Blocked**

Job failures, model drift, pipeline lag and data freshness all need alerts. A silently stale forecast is worse than none.

- **Depends on:** 3S9-QA-01
- **Done when:** Monitoring and alerting live for every scheduled job and model service
- **Reference:** Spec §20, §38

---

## Phase acceptance criteria

Every one of these must be demonstrated before the phase is signed off.

1. Every recommended price exposes model/rule version, confidence and factor breakdown.
2. Admin can override a price only with appropriate permission and required reason.
3. Match explorer never returns unavailable or category-conflicted inventory.
4. Sponsor brief produces ranked recommendations and explanation factors within agreed response-time target.
5. Campaign forecast refreshes automatically and persists historical forecasts.
6. At-risk campaign thresholds generate actionable alerts before campaign end.
7. Make-good recommendation respects sponsor target, availability, exclusivity, and estimated value equivalence.
8. Attribution events identify source, method and confidence; estimated/modelled revenue is never labeled as verified.
9. Warehouse metrics reconcile to transactional campaign/order/payment totals within defined tolerance.
10. Anomaly console identifies seeded duplicate/bot/redemption test patterns.
11. Model version can be activated, rolled back and compared without code deployment.
12. All intelligence features can be disabled per tenant through feature flags.

---

*Plan of record for Phase 3 · Intelligence & Attribution. Daily tracking happens in `SponsorX-Full-Programme-Task-Board.xlsx`; published status lives in the Google Sheet [SponsorXFullProgrammeTaskBoard](https://docs.google.com/spreadsheets/d/10PGtZb3jGBBHhbNOWwl__hS0b_HKN7EL0KRHrnSVoI0/). See the workflow rule at the top of this file.*
