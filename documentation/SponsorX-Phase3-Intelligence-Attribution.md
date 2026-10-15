# SponsorX — Phase 3 · Intelligence & Attribution

**BTG SPORTS GROUP · SPONSORX · PHASE 3 · INTELLIGENCE & ATTRIBUTION**

| | |
|---|---|
| **Goal** | Make SponsorX intelligent. Recommend prices, identify best-fit sponsors, forecast delivery, flag underperformance before a campaign ends, detect suspicious metrics and ingest verified commerce attribution. |
| **Tasks** | 63 · 206 person-days |
| **Blueprint timeline** | 18–22 weeks |
| **Balanced budget** | $105K–$160K |
| **Depends on** | Phase 2 transaction history, campaign performance data, marketplace activity, reliable event ingestion |
| **Source** | Phases 2–4 Detailed Developer Specifications v1.0 (Spec § references) + Blueprint §33 |

### The four phase documents

| Phase | File | Tasks | Timeline |
|---|---|---|---|
| 1 | [`SponsorX-Phase1-Managed-Marketplace.md`](./SponsorX-Phase1-Managed-Marketplace.md)  | 186 | 14–18 weeks |
| 2 | [`SponsorX-Phase2-Marketplace-Commerce.md`](./SponsorX-Phase2-Marketplace-Commerce.md)  | 72 | 16–20 weeks |
| 3 | [`SponsorX-Phase3-Intelligence-Attribution.md`](./SponsorX-Phase3-Intelligence-Attribution.md) **← you are here** | 63 | 18–22 weeks |
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

*13 tasks · 29 person-days*

### ✅ `3S0-PMO-01` · Define what attribution is permitted to claim

**Order** 1 · **PMO** · **Where:** Document · **3d** · **Done**

The most important decision in Phase 3 and it is a language decision, not a technical one. Verified redemption, verified transaction, modelled attribution and estimated media value are four different things and must never be blended in a sponsor report.

- **Depends on:** Phase 2 complete
- **Done when:** Written definitions for every attribution class, with the reporting language each is allowed to use
- **Delivered:** 2026-10-15, drafted for the owner's approval: [`SponsorX-Attribution-Claims.md`](./SponsorX-Attribution-Claims.md). It covers:
  - the four classes (verified redemption, verified transaction, modelled attribution, estimated media value): what each is, its evidence, money and confidence;
  - the words each may and must never use;
  - never summed, no ROI from modelled or estimated figures;
  - provenance;
  - zero rather than a guess.

  The legal review follows as `3S0-LEG-01`.
- **Reference:** Spec §17.4, §22

### ✅ `3S0-PMO-02` · Model governance policy

**Order** 2 · **PMO** · **Where:** Document · **3d** · **Done**

How a model version is proposed, validated, activated, rolled back and compared. Without this, nobody can explain why a price changed.

- **Depends on:** Phase 2 complete
- **Done when:** Governance policy written: versioning, confidence, explanation, override, monitoring and rollback
- **Delivered:** 2026-10-15, drafted for the owner's approval: [`SponsorX-Model-Governance.md`](./SponsorX-Model-Governance.md). It covers:
  - versioning per tenant, with the version as the stamp on every output;
  - draft → validated → active → retired;
  - automatic validation inside the safe ranges, and a second person for anything outside them (user, 2026-10-15: automation first);
  - confidence and explanation on every output;
  - overrides that never edit what the engine made;
  - rollback and comparison with no deployment;
  - per-tenant switches;
  - who may act;
  - monitoring.
- **Reference:** Spec §15

### ✅ `3S0-DATA-01` · Event taxonomy audit

**Order** 3 · **DATA** · **Where:** Document · **3d** · **Done**

Audit every event Phases 1 and 2 emit before building a warehouse on top of them. Inconsistent event definitions are what make analytics untrustworthy later.

- **Depends on:** Phase 2 complete
- **Done when:** Every event type inventoried with its definition, source and known gaps
- **Reference:** Spec §21
- **Delivered:** [`SponsorX-Event-Taxonomy-Audit.md`](./SponsorX-Event-Taxonomy-Audit.md) — 2026-10-12

### ✅ `3S0-BE-01` · Timestamp every metric row

**Order** 3.1 · **BE** · **Where:** Code · **1d** · **Done**

Raised by `3S0-DATA-01` (gap G7). `MetricDaily` had no time, and a same-source correction overwrote the row, so "what did we know on day X" could not be read from it. `createdAt` is when the figure was first recorded and never moves; `updatedAt` is the latest correction. Rows recorded before this are dated from their `metric.record` audit rows.

- **Depends on:** 3S0-DATA-01
- **Done when:** MetricDaily carries `createdAt` and `updatedAt`; a correction moves only `updatedAt`; earlier rows are dated from the audit log; `POST /deliverables/{id}/metrics` answers with both
- **Reference:** Spec §19, §22

### ✅ `3S0-BE-02` · Send the campaign-live email

**Order** 3.2 · **BE** · **Where:** Code · **3d** · **Done**

Raised by `3S0-DATA-01` (gap G1). Every launch queued `notify.campaignLive` and nothing consumed it: nobody outside BTG was told a campaign had gone live, and the rows waited forever. The worker now emails the sponsor's admins and every athlete on an active order, and a minor's guardian while a guardian is in control. Launches queued before this are closed as skipped, so the deploy sends no stale news.

- **Depends on:** 3S0-DATA-01
- **Done when:** A launch emails the sponsor admins and every athlete with an ACTIVE order (and a controlling guardian), once per address; a campaign no longer ACTIVE sends nothing; the backlog is marked skipped, not sent
- **Reference:** Spec §21

### ✅ `3S0-BE-03` · One audit name for archiving a listing

**Order** 3.3 · **BE** · **Where:** Code · **1d** · **Done**

Raised by `3S0-DATA-01` (gap G9). Archiving a listing was logged as `listing.archive` on two paths and `listing.archived` on the seller's. It is now `listing.archive` everywhere. Rows already written keep their name, because the audit log is append-only.

- **Depends on:** 3S0-DATA-01
- **Done when:** The seller archiving a listing is audited as `listing.archive`; no new `listing.archived` rows
- **Reference:** Spec §21

### ✅ `3S0-BE-04` · Count refused redemptions of a used code

**Order** 3.4 · **BE** · **Where:** Code · **1d** · **Done**

Raised by `3S0-DATA-01` (gap G4). Redemption is once per single-use code, enforced by the database; a used code presented again is refused and, until now, nothing recorded it. The code now counts those refusals and keeps the time of the latest, which is how a shared or screenshotted code shows itself. Only "already used" refusals count.

- **Depends on:** 3S0-DATA-01
- **Done when:** A used code tried again is still refused and its `refusedRedeems` / `lastRefusedRedeemAt` move; other refusals do not count; `GET /rewards/{id}` returns both per token
- **Reference:** Spec §21, §22

### ✅ `3S0-BE-05` · Reward venue: where an in-person reward is handed out

**Order** 3.5 · **BE** · **Where:** Code · **1d** · **Done**

Raised by `3S0-DATA-01` (gaps G2, G3). The fan funnel had no geography. A reward now takes an optional venue (city and US state) when it is created: the reward's location, never the fan's. Market geography for benchmarks comes from what is already registered: the athlete's and the property's city and state, and a brief's target states.

- **Depends on:** 3S0-DATA-01
- **Done when:** `POST /campaigns/{id}/rewards` accepts `venue {city, stateCode}` (US states only) and stores it; `GET /rewards/{id}` returns it, null when none was given
- **Reference:** Spec §19

### ✅ `3S0-BE-06` · Record a deliverable's platform at publish

**Order** 3.7 · **BE** · **Where:** Code · **1d** · **Done**

Raised by `3S0-DATA-02` (open item O1). No table recorded which platform a deliverable went out on, so the warehouse's channel could only be inferred. Marking a deliverable published now stores `platform` (INSTAGRAM, TIKTOK, YOUTUBE, X, FACEBOOK or OTHER) from the published URL's host. The athlete enters nothing new. Rows published earlier are backfilled by the same rule in SQL.

- **Depends on:** 3S0-DATA-01
- **Done when:** Publishing records `platform` from the URL host (a host matches only itself or its subdomains); earlier rows are backfilled identically; the database refuses any other value; the deliverable list returns it
- **Reference:** Spec §19

### ✅ `3S0-FE-01` · Reward form: venue field

**Order** 3.6 · **FE** · **Where:** Code · **1d** · **Done**

Split from `3S0-BE-05`, whose API is live. The reward create form gets an optional venue: a city and a US state.

- **Depends on:** 3S0-BE-05
- **Done when:** BTG can enter a venue city and state when creating a reward, and the reward detail shows it
- **Reference:** Spec §16
- **Delivered:** the live reward creator (`live-rewards-desk.tsx`) and the demo wizard share `reward-venue-fields.tsx`; half a venue is refused in the form and in the action; each reward shows "City, ST" or "Online only" — 2026-10-13

### ✅ `3S0-DATA-02` · Design the warehouse schema and semantic layer

**Order** 4 · **DATA** · **Where:** Document · **5d** · **Done**

Facts and dimensions separated from the transactional database, so analytical queries never slow down the product.

- **Depends on:** 3S0-DATA-01
- **Done when:** Warehouse schema designed and reviewed; the daily campaign fact table and its dimensions are specified
- **Reference:** Spec §19
- **Delivered:** [`SponsorX-Warehouse-Schema.md`](./SponsorX-Warehouse-Schema.md) — 2026-10-12, signed off the same day (rcfworks, with Rodney's delegated authority)

### ✅ `3S0-OPS-01` · Select the warehouse and transformation layer

**Order** 5 · **OPS** · **Where:** Vendor console · **3d** · **Done**

Snowflake, BigQuery, Redshift or Postgres depending on scale, plus dbt or equivalent for versioned transformations.

- **Depends on:** 3S0-DATA-02
- **Done when:** Warehouse and transformation tooling selected, provisioned and cost-modelled
- **Delivered:** `.claude/stack-decision.md` Addendum C; `Postgres-warehouse` (staging) and `Postgres-warehouse-production`, ingestion running hourly in both — 2026-10-12
- **Reference:** Spec §20

### ⏸ `3S0-LEG-01` · Attribution, consent and partner terms review

**Order** 6 · **LEG** · **Where:** External · counsel · **3d** · **Blocked**

> **Tracked on the Legal sheet of the task board, not in the delivery queue** (moved 2026-09-15). No development task depends on this; counsel lead times must never sit on the build's critical path.

Counsel reviews the attribution claims, the consent basis for using fan data this way, and what partner contracts actually permit.

- **Depends on:** 3S0-PMO-01
- **Done when:** Written approval of attribution claims, consent basis and sponsor-facing reporting language
- **Reference:** Spec §23

## Sprint 1 · Warehouse & benchmarks

*Get the data out of the transactional database and into an analytical model that can be trusted.*

*15 tasks · 26 person-days*

### ✅ `3S1-DATA-01` · Warehouse ingestion pipeline

**Order** 7 · **DATA** · **Where:** Code · **5d** · **Done**

Move transactional data into the warehouse on a schedule, idempotently, so a re-run never double-counts.

- **Depends on:** 3S0-DATA-02
- **Done when:** Ingestion runs on schedule and is safe to re-run
- **Delivered:** `backend/worker/warehouse/` — 2026-10-12. Hourly in the worker when `WAREHOUSE_DATABASE_URL` is set, so it starts in production once `3S0-OPS-01` provisions the warehouse
- **Reference:** Spec §21

### ✅ `3S1-DATA-02` · Daily campaign fact and dimension tables

**Order** 8 · **DATA** · **Where:** Code · **5d** · **Done**

The core analytical model: one row per campaign per day, with conformed dimensions for property, sponsor, channel and inventory.

- **Depends on:** 3S1-DATA-01
- **Done when:** Warehouse metrics reconcile to transactional campaign, order and payment totals within defined tolerance
- **Delivered:** `backend/worker/warehouse/` (model, transforms, `reconcile.mts`) — 2026-10-13; tolerance zero (design §8)
- **Reference:** Spec §19, §22

> **Changed 2026-10-13 (user review): facts are recorded by the app, not re-derived by a warehouse.** The separate warehouse (3S0-OPS-01, 3S1-DATA-01, 3S1-DATA-02) worked out business meaning a second time from copied tables. That meant two copies of the rules, a copy job that can fail, and edits it cannot see. It is replaced by a fact ledger the app writes in the same transaction as each action, with daily summaries kept up to date in that same transaction. The warehouse is retired by 3S1-OPS-02. Design: [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md) (written in 3S1-BE-01).

### ✅ `3S1-BE-01` · Fact ledger and daily summaries

**Order** 7.1 · **BE** · **Where:** Code · **2d** · **Done**

The same transaction that books, cancels, pays or delivers also writes one fact row: what happened, to which campaign, athlete, job, channel and market, how much, and when. The values come from the app's own code, so the meaning is defined once. The daily campaign summaries are updated in that same transaction. Corrections are new rows, never edits.

- **Depends on:** 3S0-DATA-01
- **Done when:** facts and summaries are written in the same transaction as the change (both or neither); the summaries always equal the sum of the facts; a correction adds rows and never edits one
- **Delivered:** [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md), `backend/src/domain/facts.ts` — 2026-10-13
- **Reference:** Spec §19, §21, §22

### ✅ `3S1-BE-02` · Record facts in every money and delivery action

**Order** 7.2 · **BE** · **Where:** Code · **2d** · **Done**

The fact writer, wired into every action that changes money or delivery:
- orders booked and cancelled;
- earnings paid;
- invoices issued and paid;
- deliverables due, published, verified and sent back for revision;
- metrics recorded and corrected;
- ad slots sold;
- marketplace milestones and financials.

Fan scans, clicks and edition views are already one row per event, so they are counted directly rather than copied.

- **Depends on:** 3S1-BE-01
- **Done when:** every listed action writes its fact in its own transaction; the daily summaries match the app's own totals for a seeded campaign
- **Delivered:** `backend/src/domain/fact-writers.ts`, wired into each action; `backend/tests/fact-wiring.test.ts` — 2026-10-13. Where each fact is written, and what reverses what: [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md) §4
- **Reference:** Spec §19, §22

### ✅ `3S1-QA-02` · Nothing slips through: action and status coverage tests

**Order** 7.3 · **QA** · **Where:** Code · **1d** · **Done**

Tests that fail the build in two cases: an action that changes money or delivery does not write its fact, or a new order state, payment type or metric source is added without being classified for the facts.

- **Depends on:** 3S1-BE-02
- **Done when:** removing a fact write, or adding an unclassified state, fails CI
- **Delivered:** `backend/tests/fact-coverage.static.test.ts` (with `tests/support/fact-coverage.ts`), `backend/src/domain/fact-classification.ts` — 2026-10-13. How it works: [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md) §6
- **Reference:** Spec §22

> **Split 2026-10-13 (user):** filling the history was one 1-day task. It is now five half-day tasks, each with its own PR. The "match the app" check comes first, so each fill is proven as it lands. Then three fills by area, then the run on the live databases. Every fill is re-runnable and uses the same fact writers as the live actions, so a history fact means exactly what a live one does.

### ✅ `3S1-QA-03` · "Match the app" check

**Order** 7.35 · **QA** · **Where:** Code · **0.5d** · **Done**

For every campaign, the daily summaries are compared with the app's own figures: bookings, cancellations, deliverables due, published, verified and sent back, views and engagements by label, earnings paid, invoices, and ad slots sold. For every tenant, the marketplace's sales and refunds are compared too. Each difference is named. It is used by each history fill, by the run on the live databases (`3S1-OPS-04`), and nightly by `3S1-QA-01`.

- **Depends on:** 3S1-BE-02
- **Done when:** after a campaign is run through the real actions, the check passes; a missing fact or a changed summary is reported by campaign and measure; a script runs it read-only against any database
- **Delivered:** `backend/src/domain/fact-check.ts`, `backend/scripts/check-facts.mts` (`npm run facts:check`), `backend/tests/fact-app-check.test.ts` — 2026-10-13. How it works: [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md) §7
- **Reference:** Spec §22

### ✅ `3S1-DATA-05` · Fill history: orders and deliverables

**Order** 7.4 · **DATA** · **Where:** Code · **0.5d** · **Done**

A re-runnable fill, through the live fact writers, for what happened before the ledger existed. It covers:
- orders booked and cancelled;
- deliverables due, published and verified;
- drafts sent back.

The dates come from the records and their audit history.

- **Depends on:** 3S1-QA-03
- **Done when:** after the fill, the check matches these measures for every campaign; re-running adds nothing
- **Delivered:** `backend/src/domain/fact-history.ts`, `backend/scripts/fill-fact-history.mts` (`npm run facts:fill -- orders`), `backend/tests/fact-history.test.ts` — 2026-10-13. How it works: [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md) §8
- **Reference:** Spec §21

### ✅ `3S1-DATA-06` · Fill history: views, payments and invoices

**Order** 7.41 · **DATA** · **Where:** Code · **0.5d** · **Done**

The same, for daily views and engagements (the final figure for each day and label, with earlier corrections counted from the audit log), earnings paid, and Zoho invoices issued and paid.

- **Depends on:** 3S1-QA-03
- **Done when:** after the fill, the check matches these measures for every campaign; re-running adds nothing
- **Delivered:** `fillViewHistory`, `fillPaymentHistory`, `fillInvoiceHistory` in `backend/src/domain/fact-history.ts`; `npm run facts:fill -- views payments invoices`; `backend/tests/fact-history-money.test.ts` — 2026-10-13. [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md) §8
- **Reference:** Spec §21

### ✅ `3S1-DATA-07` · Fill history: NEXT ad slots and the marketplace

**Order** 7.42 · **DATA** · **Where:** Code · **0.5d** · **Done**

The same, for:
- NEXT ad slots sold, including the sale and its reversal for slots a cancelled edition released, rebuilt from the cancelled-sale record;
- marketplace lines contracted and unwound;
- marketplace refunds sent.

- **Depends on:** 3S1-QA-03
- **Done when:** after the fill, the check matches these measures for every campaign and tenant; re-running adds nothing
- **Delivered:** `fillSlotHistory`, `fillMarketplaceHistory` in `backend/src/domain/fact-history.ts`; `npm run facts:fill -- slots marketplace`. Tests erase the live facts and refill them from history: the same facts come back — 2026-10-13. [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md) §8
- **Reference:** Spec §21

### ✅ `3S1-OPS-04` · Fill the history on staging and production

**Order** 7.43 · **OPS** · **Where:** Code / Vendor console · **0.5d** · **Done**

Run the three fills on staging, then on production with the owner's OK; the check must then pass for every campaign and tenant.

- **Depends on:** 3S1-DATA-05, 3S1-DATA-06, 3S1-DATA-07
- **Done when:** history is filled for all tenants in both environments; the check passes; a second run adds nothing
- **Delivered:** 2026-10-13, after the deploy of `f00d36a`:
  - **staging:** 7 facts filled (6 marketplace orders);
  - **production:** nothing to fill.
  - In both, the check passes and a second run adds nothing. [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md) §8
- **Reference:** Spec §21

### ⏸ `3S1-OPS-02` · Retire the warehouse

**Order** 7.5 · **OPS** · **Where:** Code / Vendor console · **1d** · **Blocked**

> **On hold (user, 2026-10-14).** "If no one is going to use it we just leave it there while we are in development." The warehouse databases, settings and hourly copy stay for now. Nothing reads them: analysis reads the fact ledger.

Stop the hourly copy, and remove the warehouse settings and code. Once the facts and summaries are live, delete `Postgres-warehouse` and `Postgres-warehouse-production`, with the owner's OK.

- **Depends on:** 3S1-OPS-04
- **Done when:** no warehouse service, setting or code remains; analysis reads the summaries; the design docs say so
- **Reference:** Spec §20

### ✅ `3S1-OPS-03` · Only the app writes to the live database

**Order** 7.6 · **OPS** · **Where:** Code / Vendor console · **1d** · **Done**

A dedicated login for the app with write access; developers get read-only access. Corrections go through admin actions, which record their facts, so no edit can bypass the ledger.

- **Depends on:** —
- **Done when:** in staging and production only the app's login can write; a read-only login exists for developers; the change is recorded in the deployment runbook
- **Built:** 2026-10-14. Two logins (user, 2026-10-14: the app's own login also applies new tables at deploy; no separate owner login):
  - `sponsorx_app`, which owns everything;
  - `sponsorx_readonly`, for developers (user, 2026-10-14: live data is for developers only).

  The code is `backend/src/db/logins.ts`, `npm run db:logins` and `npm run db:read`; the proof is `backend/tests/db-logins.test.ts`. The steps are in the Deployment Runbook §6, and the reasoning is in [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md) §10. - **Delivered:** 2026-10-14, after the deploy of `59ca246`, in staging and production:
  - 167 objects were handed to `sponsorx_app`, and all six checks pass;
  - the app runs as `sponsorx_app`, and only `sponsorx_app` and `sponsorx_readonly` are connected;
  - the fact check passes;
  - a write through `db:read` is refused.

  On staging, the tester site uses the app's login, and the master password was changed.
- **Reference:** Spec §26

### ✅ `3S1-DATA-03` · Benchmark pipeline

**Order** 9 · **DATA** · **Where:** Code · **3d** · **Done**

Percentile benchmarks by sport, market, format and audience — p25, median, p75 with sample size, so a small sample is visibly small.

- **Depends on:** 3S1-OPS-04
- **Done when:** Benchmarks compute with sample sizes exposed and refresh on schedule
- **Delivered:** 2026-10-14. Effective CPM is (paid, net of cancellations) × 1,000 ÷ verified views, computed per order from the fact ledger's summaries over the last 12 months.
  - **Dimensions:** sport, US state, NIL job and athlete tier, plus all orders together.
  - **Sample:** a figure from fewer than 10 orders is marked a small sample (user, 2026-10-14).
  - **Schedule:** rebuilt nightly after the fact check. A tenant whose check failed keeps yesterday's figures.
  - **Code:** `Benchmark` (migration `20261014090000_benchmark`), `backend/src/domain/benchmarks.ts` and `npm run benchmarks:refresh`.
  - **Proof:** `backend/tests/benchmarks.test.ts`.

  [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md) §11
- **Reference:** Spec §19

### ✅ `3S1-QA-01` · Nightly fact check

**Order** 10 · **QA** · **Where:** Code · **3d** · **Done**

Automated proof, every night, that the report figures agree with the app's own records: not once at launch. (Was "Warehouse reconciliation tests"; the warehouse is replaced by the fact ledger.)

- **Depends on:** 3S1-OPS-04
- **Done when:** a nightly check finds the daily summaries equal to the sum of the facts, and the facts agreeing with the app's current records. A mismatch emails BTG admins once, and again once on recovery, and shows in the admin integration-health data (user, 2026-10-13: email plus admin screen, no Slack)
- **Delivered:** 2026-10-13:
  - `backend/src/domain/fact-nightly.ts`;
  - the worker's nightly tick (19:00 UTC);
  - `FactCheckRun` (migration `20261013150000_fact_check_run`);
  - the `facts.checkFailed` / `facts.checkRecovered` emails, switched on by `FACT_CHECK_EMAILS`;
  - the `facts` section of `GET /operations/integration-health`;
  - `backend/tests/fact-nightly.test.ts`.

  [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md) §9
- **Reference:** Spec §22

### ✅ `3S1-FE-01` · Figures check on the integrations screen

**Order** 10.1 · **FE** · **Where:** Code · **0.5d** · **Done**

Raised by `3S1-QA-01` (2026-10-13). Show the nightly fact check on the admin integrations screen, beside Zoho, webhooks and the queue, from the `facts` section of `GET /operations/integration-health`:
- when it last ran;
- whether the report figures match the app;
- since when they have not;
- the differences, in words;
- whether emails are on.

- **Depends on:** 3S1-QA-01
- **Done when:** the integrations screen shows the section in its three states: never run, matching, and not matching with its differences. Only BTG can see it.
- **Delivered:** `frontend/src/lib/fact-check-live.ts` (the states, unit-tested) and the "Figures check · nightly" section on `/admin/integrations` — 2026-10-14. A fourth state is drawn too: the check could not run (`matches` null with `lastError`), shown as "not run", never as a mismatch. A mismatch or a failed run also joins the page's "needs attention" summary. Walked live on desktop and mobile with each state staged in `FactCheckRun`; Finance never reaches the screen. Built while the fact ledger is being revised (2026-10-14) — re-walk once that lands in case the `facts` shape moves.
- **Reference:** Spec §22, §23

## Sprint 2 · Dynamic CPM engine

*Recommended pricing with a visible factor breakdown, a confidence score and governed overrides.*

*4 tasks · 18 person-days*

### ✅ `3S2-BE-01` · Feature store and snapshot service

**Order** 11 · **BE** · **Where:** Code · **5d** · **Done**

Assemble the inputs a pricing model needs — audience, engagement, historical delivery, demand, seasonality, geography, scarcity — and snapshot them so a past recommendation can always be explained.

- **Depends on:** 3S1-OPS-04
- **Builds on:** `AthleteScore` (P3-BE-10), the existing snapshot pattern. Features read from the fact ledger's summaries and facts, and the app's athlete records — not the warehouse (re-pointed 2026-10-14, Fact Ledger §12).
- **Done when:** Feature snapshots generate on schedule and are retrievable by entity and date
- **Delivered:** 2026-10-14.
  - **What:** one snapshot per bookable athlete per UTC day, written once and never changed. It is taken nightly after the benchmarks; a tenant whose fact check failed takes none that day.
  - **Inputs:** audience (with labels), engagement, delivery (including on-time), demand, seasonality (only once there is a year of bookings), geography, scarcity and the segment's benchmarks. "Recent" means 90 days (user, 2026-10-14).
  - **Retrieval:** `getFeatureSnapshot` gives that day's snapshot or the latest before it; `listFeatureSnapshots` gives a range.
  - **Code:** `FeatureSnapshot` (migration `20261014120000_feature_snapshot`), `backend/src/domain/feature-snapshots.ts` and `npm run features:snapshot`.
  - **Proof:** `backend/tests/feature-snapshots.test.ts`.

  [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md) §12
- **Reference:** Spec §19

### ✅ `3S2-BE-02` · Dynamic CPM engine v1 (rules-based)

**Order** 12 · **BE** · **Where:** Code · **5d** · **Done**

Start with rules and statistics, not machine learning. The spec is explicit: do not build ML pricing before there is enough clean history.

- **Depends on:** 3S2-BE-01
- **Builds on:** `domain/pricing-learning.ts` (implied CPM, P7-DATA-03) and `domain/pricing.ts` / `margin-floor.ts` (tier multiplier and sell floor). A recommendation never goes below the floor. ([`SponsorX-Warehouse-Schema.md`](./SponsorX-Warehouse-Schema.md) §11)
- **Done when:** Every recommended price exposes model version, confidence and factor breakdown
- **Delivered:** 2026-10-14.
  - **Base:** the benchmark median of the most specific group with 10+ orders: job, then sport, tier, state, then all orders. Otherwise the largest group, or the item's current CPM.
  - **Factors:** engagement, delivery record, demand, seasonality and scarcity, from the feature snapshot. Each is capped at ±20%, and all together at ±40% (user, 2026-10-14).
  - **Floor:** never below the sell floor; when the floor lifts a price, it shows as its own factor.
  - **Stamp:** model version `cpm-rules@1.0.0` and a confidence from 0 to 1.
  - **Scope:** athlete items only in v1 (user, 2026-10-14).
  - **Code:** `backend/src/domain/pricing-engine.ts`; `GET /intelligence/pricing` and `GET /intelligence/pricing/{inventoryId}`, as the pricing panel's contract asks; new permission `pricingRecommendation` (RBAC matrix §28).
  - **Proof:** `backend/tests/pricing-engine.test.ts`.

  [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md) §13
- **Reference:** Spec §17.1, §22

### ✅ `3S2-BE-03` · Pricing recommendation and override records

**Order** 13 · **BE** · **Where:** Code · **3d** · **Done**

Store the recommendation immutably. An override is a separate record with a required reason — it never edits the original.

- **Depends on:** 3S2-BE-02
- **Builds on:** the unused `pricing.floorOverrideAttempt` audit action; `pricing_overrides` is new. ([`SponsorX-Warehouse-Schema.md`](./SponsorX-Warehouse-Schema.md) §11)
- **Done when:** Admin can override a price only with the right permission and a recorded reason; the recommendation is unchanged
- **Delivered:** 2026-10-14.
  - **Suggestions:** stored nightly, one per item per day (`PricingRecommendation`). The database refuses any edit or delete.
  - **Overrides:** `POST /intelligence/pricing/recommendations/{id}/overrides`, for BTG admins only (`pricingRecommendation` write).
    - A reason of 10–500 characters is required, and the price can never go below the sell floor. A below-floor attempt is audited as `pricing.floorOverrideAttempt`.
    - Each override is its own record (`PricingOverride`, append-only) plus a `pricing.override` audit row.
    - The newest override stays in force until replaced, including across tomorrow's suggestion. It never changes the listed price (user, 2026-10-14).
  - **Migration:** `20261014150000_pricing_records`.
  - **By hand:** `npm run pricing:refresh`.
  - **Proof:** `backend/tests/pricing-engine.test.ts`.

  [`SponsorX-Fact-Ledger.md`](./SponsorX-Fact-Ledger.md) §13
- **Reference:** Spec §17.1, §22

### ✅ `3S2-FE-01` · Build the pricing intelligence panel

**Order** 14 · **FE** · **Where:** Code · **5d** · **Done**

Recommended CPM, current rate, factor breakdown, confidence, historical range and the override control.

- **Depends on:** 3S2-BE-02
- **Done when:** Panel shows the full factor breakdown and confidence for any inventory item
- **Reference:** Spec §16 P3-01
- **Built (2026-10-13):** `/admin/intelligence/pricing`, against the proposed contract in [SponsorX-Phase3-Screen-Contracts.md](./SponsorX-Phase3-Screen-Contracts.md). Until the Dynamic CPM engine is mounted the screen says so and shows no figures. Marked Done by the owner 2026-10-13 with the UI complete and QA'd at phone, laptop and desktop widths; when the engine lands, walk the screen against it.

## Sprint 3 · Sponsor matching

*Rank inventory against a sponsor brief, with human-readable reasons.*

*4 tasks · 16 person-days*

### ✅ `3S3-BE-01` · Sponsor brief model

**Order** 15 · **BE** · **Where:** Code · **3d** · **Done**

Objective, budget, geography, sport, audience, included and excluded categories, dates and channels — the input to matching.

- **Depends on:** 3S2-BE-01
- **Builds on:** **`CampaignBrief`**, which already holds objective, budget, sports, states, categories and dates. Add exclusions, channels and audience target to it; no second brief table. ([`SponsorX-Warehouse-Schema.md`](./SponsorX-Warehouse-Schema.md) §11)
- **Done when:** A sponsor brief captures all matching inputs including exclusions
- **Delivered:** 2026-10-14.
  - **New brief fields:** `excludedCategories`, `channels`, `audienceTiers` and `audienceMinFollowers`.
  - **API:** accepted on create and edit, and returned on read. A category both wanted and excluded is refused (422).
  - **Proof:** migration `20261014180000_matching`; `backend/tests/match-engine.test.ts`.

  [`SponsorX-Match-Engine.md`](./SponsorX-Match-Engine.md) §1
- **Reference:** Spec §19

### ✅ `3S3-BE-02` · Match scoring service

**Order** 16 · **BE** · **Where:** Code · **5d** · **Done**

Score audience fit, geography, format, category affinity, historical performance, budget fit, sponsor history and inventory quality — then explain the score in words a salesperson can repeat.

- **Depends on:** 3S3-BE-01
- **Builds on:** `domain/match-score.ts` (P4-BE-08 ranking with reasons). Persist its output as `match_scores` with a model version. ([`SponsorX-Warehouse-Schema.md`](./SponsorX-Warehouse-Schema.md) §11)
- **Done when:** Brief produces ranked recommendations with explanation factors within the agreed response time
- **Delivered:** 2026-10-14.
  - **What it ranks:** athletes, properties and items (user, 2026-10-14).
  - **Factors:** eight, out of 100 — audience 15, geography 15, category 15, history 15, budget 15, format 10, sponsor history 10, quality 5. Factors that don't apply are weighted 0, and the score is the exact sum of the contributions.
  - **Runs:** stored (`MatchRun`, `MatchScore`) and reused for 10 minutes.
  - **Shortlists:** saved per brief (`BriefShortlist`).
  - **Endpoints:** `GET /intelligence/briefs/{briefId}/matches` and `POST /intelligence/briefs/{briefId}/shortlist`, with the new permission `briefMatch` (RBAC matrix §29).
  - **Agreed response time:** under 2 seconds for about 1,000 candidates (user, 2026-10-14), and proven in the test.

  [`SponsorX-Match-Engine.md`](./SponsorX-Match-Engine.md) §3–§4
- **Reference:** Spec §17.2, §22

### ✅ `3S3-BE-03` · Eligibility filter ahead of scoring

**Order** 17 · **BE** · **Where:** Code · **3d** · **Done**

Filter out unavailable, conflicted and brand-unsafe inventory before scoring. Ranking something that cannot be sold wastes everyone's time.

- **Depends on:** 3S3-BE-02
- **Builds on:** `domain/matching.ts`'s eligibility, extended to availability, category conflicts and brand safety. ([`SponsorX-Warehouse-Schema.md`](./SponsorX-Warehouse-Schema.md) §11)
- **Done when:** Match explorer never returns unavailable or category-conflicted inventory
- **Delivered:** 2026-10-14. Before scoring, three kinds of candidate are removed and only counted (`filteredOut`):
  - **unavailable:** not active, or not available on the brief's days;
  - **category conflict:** held exclusively in the brief's categories, or tied to a category the brief excludes;
  - **brand safety:** a restriction (the athlete's own, a league, school or team rule, the item's), or a minor or school in a sensitive category.

  An item available for only part of the brief is matched as `LIMITED`. [`SponsorX-Match-Engine.md`](./SponsorX-Match-Engine.md) §2
- **Reference:** Spec §22

### ✅ `3S3-FE-01` · Build the sponsor match explorer

**Order** 18 · **FE** · **Where:** Code · **5d** · **Done**

Ranked athletes, properties and inventory with match scores and readable reasons, plus shortlist saving.

- **Depends on:** 3S3-BE-02
- **Done when:** Explorer ranks, explains and saves shortlists
- **Reference:** Spec §16 P3-02
- **Built (2026-10-13):** `/admin/intelligence/matching`, against the proposed contract in [SponsorX-Phase3-Screen-Contracts.md](./SponsorX-Phase3-Screen-Contracts.md). Until the match scoring is mounted the screen says so and shows no figures. Marked Done by the owner 2026-10-13 with the UI complete and QA'd at phone, laptop and desktop widths; when the engine lands, walk the screen against it.

## Sprint 4 · Forecasting & pacing

*Predict whether a campaign will hit its guarantee, and say so before it is too late to act.*

*4 tasks · 16 person-days*

### ✅ `3S4-DATA-01` · Daily pacing job

**Order** 19 · **DATA** · **Where:** Code · **3d** · **Done**

Compare elapsed campaign time against delivered metrics, every day.

- **Depends on:** 3S1-DATA-02
- **Done when:** Pacing computes nightly for every active campaign
- **Delivered:** 2026-10-14. `CampaignPacing` holds, per active campaign per day, verified delivery against the plan (the guarantee spread evenly, or deliverables due by then). The worker writes it nightly after the fact check, filling any missing day since the start. [`SponsorX-Forecasting.md`](./SponsorX-Forecasting.md) §2
- **Reference:** Spec §17.3

### ✅ `3S4-BE-01` · Delivery forecast service

**Order** 20 · **BE** · **Where:** Code · **5d** · **Done**

Estimate final impressions and the probability of hitting the guarantee, and keep every historical forecast so the model can be judged later.

- **Depends on:** 3S4-DATA-01
- **Builds on:** `domain/delivery-health.ts` (P7-DATA-04). The forecast is its forward-looking version, with history in `campaign_forecasts`. ([`SponsorX-Warehouse-Schema.md`](./SponsorX-Warehouse-Schema.md) §11)
- **Done when:** Forecast refreshes automatically and persists historical forecasts
- **Delivered:** 2026-10-14.
  - **Guarantee:** BTG sets it per campaign (impressions, engagements, redemptions or deliverables). Unset, it is every deliverable booked (user, 2026-10-14).
  - **Forecast:** made nightly. Flows use the observed rate blended with the plan early on; deliverables use each one's chance of landing.
  - **Output:** low, mid and high, the probability of the guarantee, and the risk (on track ≥ 80%, watch ≥ 50%, at risk below; user, 2026-10-14).
  - **History:** every forecast is kept (`CampaignForecast`, one per campaign per day).
  - **Endpoints:** `GET /intelligence/forecasts`, `GET /intelligence/forecasts/{campaignId}` and `PUT …/guarantee`, with the new permission `campaignForecast` (RBAC matrix §30).

  [`SponsorX-Forecasting.md`](./SponsorX-Forecasting.md) §1, §3, §5
- **Reference:** Spec §17.3, §22

### ✅ `3S4-BE-02` · Risk thresholds and alerting

**Order** 21 · **BE** · **Where:** Code · **3d** · **Done**

Campaigns crossing a risk threshold raise an alert with a recommended action — accelerate content, add a deliverable, change channel, or reserve make-good inventory.

- **Depends on:** 3S4-BE-01
- **Builds on:** `domain/delivery-health.ts`'s fixed rules, which these thresholds replace. ([`SponsorX-Warehouse-Schema.md`](./SponsorX-Warehouse-Schema.md) §11)
- **Done when:** At-risk campaigns generate actionable alerts before campaign end, not after
- **Delivered:** 2026-10-14.
  - **Reasons:** behind pace, overdue work, projected shortfall, channel lagging, running out of time.
  - **Actions:** accelerate content, change channel, add a deliverable (says how many), reserve make-good inventory.
  - **Alerts** (`CampaignForecastAlert`): raised only before the end date and after the first 20% of the flight.
  - **Emails:** at risk is emailed once to BTG admins and campaign managers, held through a dip to watch, and followed by one "back on track" email (user, 2026-10-14). Emails go only where `FORECAST_EMAILS=on`.
  - **Not changed:** `delivery-health.ts` keeps its fixed rules for the operations dashboard.

  [`SponsorX-Forecasting.md`](./SponsorX-Forecasting.md) §4
- **Reference:** Spec §17.3, §22

### ✅ `3S4-FE-01` · Build the campaign forecast dashboard

**Order** 22 · **FE** · **Where:** Code · **5d** · **Done**

Projected final delivery, probability of guarantee, pacing chart, risk factors and recommended actions.

- **Depends on:** 3S4-BE-01
- **Done when:** Dashboard shows pacing and risk for every active campaign
- **Reference:** Spec §16 P3-03
- **Built (2026-10-13):** `/admin/intelligence/forecasts`, against the proposed contract in [SponsorX-Phase3-Screen-Contracts.md](./SponsorX-Phase3-Screen-Contracts.md). Until the delivery forecast is mounted the screen says so and shows no figures. Marked Done by the owner 2026-10-13 with the UI complete and QA'd at phone, laptop and desktop widths; when the engine lands, walk the screen against it.

## Sprint 5 · Make-good optimiser

*When a campaign falls short, recommend equivalent substitute inventory.*

*3 tasks · 13 person-days*

### ✅ `3S5-BE-01` · Make-good recommendation engine

**Order** 23 · **BE** · **Where:** Code · **5d** · **Done**

Given a shortfall, find substitute inventory of equivalent value that is actually available and does not create a category conflict.

- **Depends on:** 3S4-BE-01
- **Done when:** Recommendations respect sponsor target, availability, exclusivity and estimated value equivalence
- **Delivered:** 2026-10-15.
  - **Shortfall:** opened nightly, after the forecasts, for an active campaign the forecast says is at risk. It is the guarantee less the projection, valued at what the sponsor paid per unit. It is refreshed while open, and closes when the campaign recovers.
  - **Substitutes:** the tenant's inventory, through the match engine's own exclusivity and brand-safety filter, then the purchase paths' availability check.
    - **When:** over 14 days from tomorrow (user, 2026-10-15).
    - **Each one shows:** available, clear of exclusivity, on the sponsor's target; its estimated delivery, equivalency and cost to BTG.
    - **Shown:** up to 5 passing every check, plus up to 2 closer ones that fail one.
  - **Endpoint:** `GET /intelligence/make-goods`, with the new permission `makeGood` (RBAC matrix §31).

  [`SponsorX-Make-Goods.md`](./SponsorX-Make-Goods.md) §1–§4
- **Reference:** Spec §22

### ✅ `3S5-BE-02` · Make-good approval workflow

**Order** 24 · **BE** · **Where:** Code · **3d** · **Done**

A make-good changes what a sponsor was sold, so it needs approval and an audit trail.

- **Depends on:** 3S5-BE-01
- **Done when:** Make-good approval is recorded, audited and reflected in the campaign
- **Delivered:** 2026-10-15.
  - **By a person:** a BTG admin or campaign manager approves one substitute with a note (`POST /intelligence/make-goods/{id}/approve`).
  - **Automatically by SponsorX,** under the Phase 2 rule (user, 2026-10-15). It approves on its own only when the best substitute:
    - passes every check;
    - covers at least 90% of the gap;
    - costs BTG no more than the gap is worth;
    - involves no minor, school or age-gated category;
    - is estimated from verified figures;
    - and 80% of the flight has gone.

    Otherwise the shortfall is held, with every reason.
  - **Note:** the last two conditions (verified figures, 80% of the flight) were proposed during the build and approved by the user on 2026-10-15. They bind only the automatic approval; a person can approve any passing substitute at any time. [`SponsorX-Make-Goods.md`](./SponsorX-Make-Goods.md) §6
  - **Either way:**
    - the checks run again, live;
    - the units are committed so nobody else can buy them;
    - the decision is recorded and can never change (a database trigger);
    - it is audited (`makeGood.approve` / `makeGood.autoApprove`);
    - it shows on the campaign's detail and its forecast.

  [`SponsorX-Make-Goods.md`](./SponsorX-Make-Goods.md) §5–§6
- **Reference:** Spec §18

### ✅ `3S5-FE-01` · Build the make-good recommendation centre

**Order** 25 · **FE** · **Where:** Code · **5d** · **Done**

Shortfall amount, substitute options, equivalency score, cost impact and the approval action.

- **Depends on:** 3S5-BE-01
- **Done when:** Centre surfaces shortfalls and lets a manager approve a substitution
- **Reference:** Spec §16 P3-04
- **Built (2026-10-13):** `/admin/intelligence/make-goods`, against the proposed contract in [SponsorX-Phase3-Screen-Contracts.md](./SponsorX-Phase3-Screen-Contracts.md). Until the make-good engine is mounted the screen says so and shows no figures. Marked Done by the owner 2026-10-13 with the UI complete and QA'd at phone, laptop and desktop widths; when the engine lands, walk the screen against it.

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
- **Builds on:** nothing, but `SalesAttribution` (NEXT student credit) is a different thing. Name the new table distinctly. ([`SponsorX-Warehouse-Schema.md`](./SponsorX-Warehouse-Schema.md) §11)
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

### ✅ `3S6-FE-01` · Build the attribution dashboard

**Order** 30 · **FE** · **Where:** Code · **5d** · **Done**

Attributed transactions, revenue, method, window, confidence and unmatched events — with the four classes visually distinct.

- **Depends on:** 3S6-BE-02
- **Done when:** Dashboard distinguishes verified redemptions, verified transactions, modelled attribution and estimated media value
- **Reference:** Spec §16 P3-05
- **Built (2026-10-13):** `/admin/intelligence/attribution`, against the proposed contract in [SponsorX-Phase3-Screen-Contracts.md](./SponsorX-Phase3-Screen-Contracts.md). Until the attribution event model is mounted the screen says so and shows no figures. Marked Done by the owner 2026-10-13 with the UI complete and QA'd at phone, laptop and desktop widths; when the engine lands, walk the screen against it.

## Sprint 7 · Intelligence dashboards

*Sponsor and property hubs, and the scenario planner.*

*6 tasks · 26 person-days*

### ✅ `3S7-BE-02` · Serve sponsor and property intelligence

**Order** 30.5 · **BE** · **Where:** Code · **3d** · **Done**

Raised building `3S7-FE-01` / `3S7-FE-02` (2026-10-13). Both hubs depend on warehouse facts, but no task serves them: `GET /intelligence/sponsor` and `GET /intelligence/property`, scoped by the API to the caller's own sponsor org or property, reading the daily summaries of the fact ledger (`3S1-BE-01`, in the app database; never the warehouse) and the CPM engine.

- **Depends on:** 3S1-OPS-04, 3S2-BE-02
- **Done when:** both reads answer the shapes in [SponsorX-Phase3-Screen-Contracts.md](./SponsorX-Phase3-Screen-Contracts.md), cross-tenant and cross-org reads are refused, and the four attribution classes are returned separately
- **Delivered:** 2026-10-15.
  - **Endpoints:** `GET /intelligence/sponsor` and `GET /intelligence/property`, with the new permissions `sponsorIntelligence` and `propertyIntelligence` (RBAC matrix §32).
  - **Scope:** the org or property comes from the caller, never the request.
  - **Sponsor hub:** the four classes are kept apart. "Sales matched" and "sales likely" are 0 until partner-store data exists. Media value is verified views at the benchmark price, and labelled an estimate. Also: formats, partners, renewal advice at 80% / 50%, and no unsourced audience segments (user, 2026-10-15).
  - **Property hub:** the roster's suggested prices, open opportunity, sell-through, category fit (age-gated categories never fit a school) and quality.

  [`SponsorX-Hub-Intelligence.md`](./SponsorX-Hub-Intelligence.md)
- **Reference:** Spec §16 P3-06, P3-07; §19

### ✅ `3S7-FE-01` · Build the sponsor intelligence hub

**Order** 31 · **FE** · **Where:** Code · **5d** · **Done**

Cross-campaign insights, audience segments, best-performing formats and properties, renewal recommendations.

- **Depends on:** 3S1-DATA-02
- **Done when:** Hub renders cross-campaign intelligence for a sponsor
- **Reference:** Spec §16 P3-06
- **Built (2026-10-13):** `/sponsor/intelligence`, against the proposed contract in [SponsorX-Phase3-Screen-Contracts.md](./SponsorX-Phase3-Screen-Contracts.md). Until the sponsor read, 3S7-BE-02 is mounted the screen says so and shows no figures. Marked Done by the owner 2026-10-13 with the UI complete and QA'd at phone, laptop and desktop widths; when the engine lands, walk the screen against it.

### ✅ `3S7-FE-02` · Build the property intelligence hub

**Order** 32 · **FE** · **Where:** Code · **5d** · **Done**

Rate recommendations, revenue opportunity, sell-through, sponsor-category fit and a quality score.

- **Depends on:** 3S2-BE-02
- **Done when:** Hub renders rate and opportunity intelligence for a property
- **Reference:** Spec §16 P3-07
- **Built (2026-10-13):** `/property/intelligence`, against the proposed contract in [SponsorX-Phase3-Screen-Contracts.md](./SponsorX-Phase3-Screen-Contracts.md). Until the property read, 3S7-BE-02 is mounted the screen says so and shows no figures. Marked Done by the owner 2026-10-13 with the UI complete and QA'd at phone, laptop and desktop widths; when the engine lands, walk the screen against it.

### ✅ `3S7-BE-01` · Scenario planning service

**Order** 33 · **BE** · **Where:** Code · **5d** · **Done**

What-if: change budget, CPM, audience and inventory mix, and compare expected delivery and revenue.

- **Depends on:** 3S4-BE-01
- **Done when:** A scenario can be created, calculated and compared against another
- **Delivered:** 2026-10-15.
  - **How:** each format's share of the budget buys posts at the tenant's booked price (or the catalogue's). The audience's verified views per post (low, likely, high) give the expected views.
  - **Chance of delivering** what the CPM sells: as the forecast does it.
  - **Expected revenue:** the budget, reduced when delivery falls short (user, 2026-10-15).
  - **Endpoints:** `GET /intelligence/scenarios`, `POST …/calculate` (stores nothing) and `POST /intelligence/scenarios` (keeps it with its stamp, to compare). New permission `scenario` (RBAC matrix §33).

  [`SponsorX-Scenarios.md`](./SponsorX-Scenarios.md)
- **Reference:** Spec §18

### ✅ `3S7-FE-03` · Build the scenario planner

**Order** 34 · **FE** · **Where:** Code · **5d** · **Done**

The sales-conversation screen: adjust the inputs live while a sponsor watches.

- **Depends on:** 3S7-BE-01
- **Done when:** Planner calculates and compares scenarios interactively
- **Reference:** Spec §16 P3-08
- **Built (2026-10-13):** `/admin/intelligence/scenarios`, against the proposed contract in [SponsorX-Phase3-Screen-Contracts.md](./SponsorX-Phase3-Screen-Contracts.md). Until the scenario service is mounted the screen says so and shows no figures. Marked Done by the owner 2026-10-13 with the UI complete and QA'd at phone, laptop and desktop widths; when the engine lands, walk the screen against it.

### ◑ `3S7-INT-01` · Push intelligence into Zoho

**Order** 35 · **INT** · **Where:** Code · **3d** · **Code review**

Renewal scores, sponsor health and recommended next action flow back to the CRM where the sales team already works.

- **Depends on:** 3S7-FE-01
- **Done when:** Zoho shows renewal score and recommended next action on the sponsor record
- **Delivered:** 2026-10-15.
  - **What Zoho shows:** each sponsor's Account carries `SponsorX_Renewal_Score` (0–100) and `SponsorX_Next_Action`, from the same renewal advice as the sponsor's hub.
  - **Automatic:** the nightly run queues `zoho.pushIntelligence` only for sponsors in Zoho whose values changed.
  - **The fields** are made by `npm run zoho:intel-fields -- --create`: the sandbox first, then production with the owner's OK.

  [`SponsorX-Zoho-Field-Mapping.md`](./SponsorX-Zoho-Field-Mapping.md) §12.3
- **Reference:** Spec §20

## Sprint 8 · Anomaly detection & model admin

*Catch bad data before a sponsor sees it; manage model versions without a deploy.*

*5 tasks · 23 person-days*

### ✅ `3S8-DATA-01` · Anomaly detection rules

**Order** 36 · **DATA** · **Where:** Code · **5d** · **Done**

Improbable spikes, duplicate events, bot-like behaviour, suspicious redemption patterns and manual-entry inconsistencies.

- **Depends on:** 3S1-DATA-02
- **Done when:** Anomaly console identifies seeded duplicate, bot and redemption test patterns
- **Delivered:** 2026-10-15.
  - **Seven rules,** nightly over 30 days: spikes, duplicate posts, bot-like clicks, redemption bursts, a fan redeeming repeatedly, hand-entered figures 3× the API's, and more engagements than views.
  - **Decisions:** a person decides each flag with a note. A duplicate post is excluded from reporting automatically (user, 2026-10-15: automation first), and a person may replace that.
  - **Endpoints:** `GET /intelligence/anomalies` and `POST …/{id}/disposition`. New permission `anomaly` (RBAC matrix §34).

  [`SponsorX-Anomalies.md`](./SponsorX-Anomalies.md)
- **Reference:** Spec §15, §22

### ✅ `3S8-FE-01` · Build the data quality and anomaly console

**Order** 37 · **FE** · **Where:** Code · **5d** · **Done**

Flagged streams, suspicious redemptions, data-quality issues and the reviewer's disposition.

- **Depends on:** 3S8-DATA-01
- **Done when:** Reviewer can triage and resolve every flagged anomaly
- **Reference:** Spec §16 P3-09
- **Built (2026-10-13):** `/admin/intelligence/anomalies`, against the proposed contract in [SponsorX-Phase3-Screen-Contracts.md](./SponsorX-Phase3-Screen-Contracts.md). Until the anomaly rules is mounted the screen says so and shows no figures. Marked Done by the owner 2026-10-13 with the UI complete and QA'd at phone, laptop and desktop widths; when the engine lands, walk the screen against it.

### ✅ `3S8-BE-01` · Model registry and activation

**Order** 38 · **BE** · **Where:** Code · **5d** · **Done**

Versions activate, roll back and compare without a code deployment. Pricing that requires a release to change is pricing nobody will trust.

- **Depends on:** 3S0-PMO-02
- **Done when:** A model version can be activated, rolled back and compared without deploying code
- **Delivered:** 2026-10-15.
  - **Five engines' settings are versioned per tenant:** pricing caps, the match lookback, the forecast's risk lines, the make-good limits and the anomaly thresholds, each with a safe range.
  - **Changing settings saves the next version.** Inside the safe ranges it goes live at once, automatically. Outside them it is held for a second person to validate.
  - **Activate, roll back and compare** without a deployment. The engines read the active settings at each run and stamp their outputs with its version.
  - **Endpoints:** `GET /intelligence/models` and `PATCH …/thresholds`, `POST …/validate`, `…/activate` and `…/rollback`. New permission `modelRegistry` (RBAC matrix §35).

  [`SponsorX-Model-Governance.md`](./SponsorX-Model-Governance.md)
- **Reference:** Spec §22

### ✅ `3S8-FE-02` · Build the model and rule administration screen

**Order** 39 · **FE** · **Where:** Code · **5d** · **Done**

Pricing factors, model versions, thresholds, benchmarks, rollouts and feature flags.

- **Depends on:** 3S8-BE-01
- **Done when:** Admin can manage model versions and thresholds from the UI
- **Reference:** Spec §16 P3-10
- **Built (2026-10-13):** `/admin/intelligence/models`, against the proposed contract in [SponsorX-Phase3-Screen-Contracts.md](./SponsorX-Phase3-Screen-Contracts.md). Until the model registry is mounted the screen says so and shows no figures. Marked Done by the owner 2026-10-13 with the UI complete and QA'd at phone, laptop and desktop widths; when the engine lands, walk the screen against it.

### ✅ `3S8-OPS-01` · Per-tenant feature flags for intelligence

**Order** 40 · **OPS** · **Where:** Code · **3d** · **Done**

Every intelligence feature must be disableable per tenant. Not every customer should see a forecast.

- **Depends on:** 3S8-BE-01
- **Done when:** All intelligence features can be disabled per tenant through feature flags
- **Delivered:** 2026-10-15.
  - **Nine features can be switched off per tenant:** pricing, matching, forecasts, make-goods, anomalies, scenarios, both hubs and the Zoho updates.
  - **Off:** the nightly run skips that tenant, and the reads and writes answer 403 `feature_off`.
  - **Endpoint:** `PATCH /intelligence/flags`, with a reason, audited. BTG admins for their own tenant, super admins for any.

  [`SponsorX-Model-Governance.md`](./SponsorX-Model-Governance.md) §7
- **Reference:** Spec §22

## Sprint 9 · Backtesting & rollout

*Validate the models against history before anyone makes a decision on them.*

*4 tasks · 16 person-days*

### ✅ `3S9-QA-01` · Backtest the pricing and forecast models

**Order** 41 · **QA** · **Where:** Code · **5d** · **Done**

Run the models against historical campaigns and check whether they would actually have been right. This is what separates intelligence from decoration.

- **Depends on:** 3S8-BE-01
- **Done when:** Backtest results documented with accuracy and confidence calibration per model
- **Delivered:** 2026-10-15.
  - **The forecast:** accuracy (error of the projected final, within 10%, second half) and probability calibration (Brier score, by band) on ended campaigns.
  - **Pricing:** accuracy against achieved CPM, and within-20% by confidence band, on orders after a suggestion.
  - **Per version, nightly,** kept as `BacktestRun` and shown beside each version on the models screen.
  - **No real history yet.** On a seeded simulated history of 300 campaigns, the projection is good (4.7% error at ¾ of the flight), but the probability is overconfident early (95% given → 74% reached at ¼).
  - **Recommendations are documented,** and the decision is the owner's.

  [`SponsorX-Backtest.md`](./SponsorX-Backtest.md) §2–§4
- **Reference:** Spec §21

### ✅ `3S9-QA-02` · Benchmark and reconciliation validation

**Order** 42 · **QA** · **Where:** Code · **3d** · **Done**

Confirm benchmarks are statistically meaningful and warehouse totals still tie out.

- **Depends on:** 3S1-DATA-03
- **Done when:** Benchmarks validated for sample size; reconciliation within tolerance
- **Delivered:** 2026-10-15.
  - **Benchmarks:** each is validated for ordered quartiles, freshness (2 days), sample size (10 orders) and spread (4×), and flagged with its reasons.
  - **Reconciliation:** the nightly fact check, with an exact tolerance, run within 2 days.
  - **Where it shows:** on the models screen (`benchmarkValidation`), in the nightly log, and through `npm run benchmarks:validate`.

  [`SponsorX-Backtest.md`](./SponsorX-Backtest.md) §1
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
