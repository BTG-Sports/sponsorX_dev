# 2026-10-12

## rcfworks — 3S0-DATA-01: event taxonomy audit (Code review)

Phase 3 has opened. Its Sprint 0 tasks waited only on "Phase 2 complete", which was met when 2S8-PMO-01 was signed off on 2026-10-09. **3S0-PMO-01 and 3S0-PMO-02 are now Ready.** Every other Phase 3 row stays Blocked behind Sprint 0.

- **Delivered:** `documentation/SponsorX-Event-Taxonomy-Audit.md`. It covers every event the backend writes, with its definition, source and known gaps.
  - **Nine families:** reward funnel, tracking-link clicks, edition engagement, MetricDaily, AuditLog, money, inbound provider events, outbox jobs and sweeps, and email.
  - **AuditLog:** 287 `audit()` sites in 77 files plus one raw insert. They produce about 320 action names in 72 families; Appendix A lists them all.
  - **Jobs:** 22 job names and 22 interval sweeps.
  - **No client-side analytics** exist in the frontend.
- **How it was counted:** a TypeScript-AST scan of `backend/src`, `worker` and `scripts`. It resolves constants such as `AUDIT_ACTIONS.x.y`. The 35 action names built at runtime were expanded by hand.
- **Gaps worth knowing now** (17 in total, G1–G17 in the doc):
  - **G1:** `notify.campaignLive` is enqueued on every launch and has no consumer, so the rows stay in `OutboxJob` forever.
  - **G2:** `RewardEvent.city`/`region` are never filled. The geo job only resolves `LinkEvent`.
  - **G3:** `GEOLITE2_CITY_PATH` is unset everywhere, so clicks have no geography either.
  - **G4:** refused repeat redemptions are not recorded.
  - **G7:** `MetricDaily` has no timestamp, and a same-source correction overwrites the row.
  - **G9:** one listing archive is logged as both `listing.archive` and `listing.archived`, and `listing.request_changes` is snake_case.
  - **G13:** `role.grant`/`role.revoke`/`tenant.accessGrant` are declared but never written. Roles are set only when an account is created or closed, and those acts are audited.
- **Follow-ups suggested, not raised:** code fixes for G1, G2, G4 and G9. G3 is already on P2-OPS-04. The rest are absorbed by 3S0-DATA-02, 3S1-DATA-01/03, 3S8-DATA-01 and 3S0-PMO-01.
- **Tracker:** Phase 3 rows 5–6 (PMO-01, PMO-02) are now Ready; row 7 (DATA-01) is Code review with owner rcfworks, started 2026-10-12. The Phase 3 plan's markers match. The Stage Progress snapshot is unchanged: today's row already exists and covers Phase 1, which this work doesn't touch.
- **PRs:** `main` and `main_development` hold the same content (main's four extra commits are only merge commits). This branch merged `main_development` before starting.

## rcfworks — 3S0-BE-01…05: five gaps from the event audit, fixed (Code review)

The user decided each one: market geography from registration plus a reward venue, build the live email, count refused redemptions, and use one archive name.

- **3S0-BE-01 · Metric timestamps.**
  - `MetricDaily.createdAt` is the first recording and never moves; `updatedAt` is the latest correction.
  - Migration `20261012100000_metric_daily_timestamps` dates existing rows from their `metric.record` audit rows.
  - `POST /deliverables/{id}/metrics` now answers with the `MetricEntry` schema (`recordedAt`, `updatedAt`).
- **3S0-BE-02 · Campaign-live email.**
  - `src/domain/campaign-live-mail.ts` consumes `notify.campaignLive`, now in `HANDLED_JOBS`, and sends template `campaign.live`.
  - Recipients: the sponsor's admins (that sponsor only, not disabled), and each athlete on an ACTIVE order at their own login, plus the guardian while `guardianControls` holds. One email per address; key `campaign.live:<campaign>:<email>`.
  - A campaign that is not ACTIVE sends nothing.
  - Migration `20261012100300_campaign_live_backlog` marks every waiting row dispatched, with `payload.skipped`, so the deploy sends no stale news.
- **3S0-BE-03 · Archive name.** The seller's archive is now `listing.archive`. Old `listing.archived` rows stay, since the audit log is append-only; the audit doc maps the old name to the new one.
- **3S0-BE-04 · Refused redemptions.**
  - `RewardToken.refusedRedeems` and `lastRefusedRedeemAt` move when a used code is tried again (ALREADY_USED or the unique index). Other refusals don't count.
  - The count is written after the refusal, and a failed count never changes the 409.
  - `GET /rewards/{id}` returns both per token.
  - Migration `20261012100100_reward_token_refused_redeems`.
- **3S0-BE-05 · Reward venue.**
  - `Reward.venueCity` and `venueStateCode`: an optional `venue {city, stateCode}` on create, US states only, returned on read and null when not given.
  - Migration `20261012100200_reward_venue`.
  - **3S0-FE-01** (Ready, for HeckerCreatives): the venue field on the reward form.
- **Verified:**
  - against a local Postgres: an embedded-postgres in the session scratchpad, with `sponsorx.audit_purge = 'on'` as CI's test database has;
  - backend `tsc` and eslint clean;
  - **full backend suite 191 files / 3,070 tests pass**.
  - `prisma migrate diff` shows no drift on the three changed tables. It still reports 16 older lines (two foreign keys and an index rename), not touched here.
- **Tracker:** Phase 3 rows 48–53 were appended (Order 3.1–3.6). The autofilter, conditional formatting, Status validation and 15 Dashboard formulas now reach row 53. 3S0-DATA-01 notes and Unblocks are updated. The Phase 3 plan has the six tasks (Sprint 0 is now 12 tasks · 28 days; the phase is 50 · 192). The audit doc is v1.1, with the market-geography rule in §6.

## rcfworks — 3S0-DATA-01 and 3S0-BE-01…05 → Done

- **Acceptance checked clause by clause** at the user's request; every clause has a passing test (7 files, 138 tests) or, for DATA-01, the document.
- The audit doc's inventory (§3 A and D) now also names the fields the fixes added, so it matches the code.
- **Tracker and plan:** the six rows are Done (Date Done 2026-10-12). 3S0-DATA-02 is **Ready**, since its only prerequisite was DATA-01. 3S0-FE-01 stays Ready for HeckerCreatives.

## rcfworks — 3S0-DATA-02: warehouse schema and semantic layer (Code review)

- **PR:** #184 (https://github.com/BTG-Sports/sponsorX_dev/pull/184), the same branch as DATA-01 and BE-01…05.
- **Delivered:** `documentation/SponsorX-Warehouse-Schema.md`. It reads the spec from Drive (`BTG_SponsorX_Phases_2_4_Detailed_Developer_Specifications.docx`, §15/§19/§20/§22).
- **The user's decisions:**
  - grain is campaign × athlete × channel × day;
  - the warehouse is a separate Postgres database on Railway;
  - sponsor, property and athlete keep history (type 2).
- **Inventory joins the grain,** because an athlete can hold several jobs on one campaign (`CampaignOrder` is unique on campaign + athlete + job).
- **Findings that shaped it:**
  - No product table has a channel or platform. Channel is derived (published-URL host, in-person jobs, reward QR, tracking link, edition print/digital); open item O1 suggests a `Deliverable.platform`.
  - Marketplace orders belong to no campaign, so they get a companion fact.
  - Spec §19's other tables (pricing_recommendations and the rest) are product tables built by their own tasks, not warehouse tables.
- **Design rules:**
  - every measure is dated by its own event, so the fact is additive and reconciliation is exact (zero tolerance);
  - no personal data in the warehouse;
  - market comes from registration plus the reward venue, never from IP.
- **Verified:** the Appendix A SQL ran clean in an empty Postgres (10 tables and a view), and a smoke row read back through `sem.campaign_daily`.
- **Left:** the user's review sign-off in §10, then Done.

## rcfworks — the three items the warehouse design raised, finished

- **3S0-BE-06 · Deliverable platform (Done).**
  - `markPublished` now stores `Deliverable.platform`, read from the published URL's host by `src/domain/deliverable-platform.ts`. Values are INSTAGRAM, TIKTOK, YOUTUBE, X, FACEBOOK or OTHER, and a host matches only itself or its subdomains.
  - Migration `20261012100400_deliverable_platform` backfills published rows with the same rule in SQL and adds a CHECK.
  - A Postgres test runs the migration's UPDATE on the same 15 URLs and must agree with the code.
  - The deliverable list returns `platform`. The audit's `after` carries it.
- **Marketplace fact and snapshots, fully specified** (warehouse doc v1.1 §7 and Appendix A):
  - `fact_marketplace_order_line`, an accumulating snapshot with one row per line, milestone dates and the OrderLineFinancials split;
  - `snap_ledger_daily`;
  - `snap_payment_status_daily`, whose closed states were checked against the code: payout PAID/REJECTED (FAILED retries), refund SENT.
  - The appendix SQL (13 tables, 1 view) ran clean in an empty Postgres.
- **Spec §19's product tables mapped** (warehouse doc §11):
  - Five overlap with existing code: `sponsor_briefs` → extend `CampaignBrief`; `match_scores` → persist `match-score.ts`; pricing → `pricing-learning.ts` + `pricing.ts`/`margin-floor.ts`; `campaign_forecasts` → `delivery-health.ts`; `feature_snapshots` → the `AthleteScore` pattern.
  - `attribution_events` is a name clash with `SalesAttribution`.
  - "Builds on" lines were added to nine Phase 3 tasks.
- **A correction made along the way:** only `SX-05` is an appearance job in code (`APPEARANCE_JOBS`), so `IN_PERSON` no longer includes SX-06.
- **Verified:** tsc and eslint clean; **full backend suite 192 files / 3,089 tests pass** on Postgres.
- **Tracker:** row 54 holds 3S0-BE-06 (Order 3.7, Done). The ranges and 15 Dashboard formulas now reach row 54. DATA-02's notes are updated, and it stays at Code review until the §10 sign-off. Phase 3 is now 51 tasks · 193 days.

## rcfworks — 3S0-DATA-02 signed off → Done

- §10 of `documentation/SponsorX-Warehouse-Schema.md` (v1.1) is signed "rcfworks, with Rodney's delegated authority", 2026-10-12, accepted as written. The header now reads Accepted.
- **Tracker and plan:** DATA-02 is Done. **3S0-OPS-01** (select and provision the warehouse) and **3S1-DATA-01** (ingestion pipeline) are now Ready, since DATA-02 was their only prerequisite.
- PRs #185 and #186 merged. `main` and `main_development` have identical content. Fast-forwarding `main_development` onto `main`'s five merge commits was blocked by the auto-mode safety check (a direct push to a shared branch); it is left to the user.

## rcfworks — 3S1-DATA-01: warehouse ingestion (Code review)

- **Why a warehouse at all (the user asked):** Phase 3 analysis shouldn't load the live database; the product overwrites history that pricing and forecasting need; and reports, pricing and forecasts need one agreed set of numbers. At pilot size it is ahead of need, so it is kept light: plain Postgres. The user chose to keep it.
- **The user's decisions:** hourly; copy by allow-list.
- **Built: `backend/worker/warehouse/`.**
  - `sources.mts` lists 29 tables and their allowed columns. It copies no personal data, and only 7 audit actions, without before/after. The athlete's birth date is read only to compute `is_minor` with the product's own rule.
  - `ingest.mts`:
    - APPEND tables (RewardEvent, LinkEvent, EditionEvent, AuditLog) are read from the watermark minus 48 hours, one raw row per source row, updated only when its hash changes.
    - VERSIONED tables (the rest) are read in full; a new version is written only when the row hash differs from the latest, and a row gone from the product gets a deleted version.
    - Each run reads one REPEATABLE READ, READ ONLY transaction on the product; an advisory lock (`INGEST_LOCK_KEY`) makes an overlapping run step aside; every run is logged in `raw._ingest_run`.
  - `migrate.mts` with `migrations/0001_ingestion.sql`: the warehouse's own SQL migrations, tracked in `public.warehouse_migrations`.
- **Worker:** hourly, plus a first run 90 seconds after boot, **only when `WAREHOUSE_DATABASE_URL` is set**. Otherwise it logs that ingestion is off. The variable is documented in `.env.example`.
- **Tests: `tests/warehouse-ingest.test.ts`, 13 tests** against product and warehouse Postgres. The warehouse database is `<test db>_warehouse`, created automatically (CI's Postgres user can do this). They cover: first copy; no personal data; only the listed audit actions; a re-run adding nothing; one new version per change; a deleted version; a late click city updated, not duplicated; and the lock.
- **Verified:** tsc and eslint clean; **full backend suite 193 files / 3,102 tests pass**.
- **Left:** it runs in production once 3S0-OPS-01 provisions the warehouse database and sets the variable.

## rcfworks — 3S0-OPS-01: warehouse selected, staging provisioned (In progress)

- **The user's decisions:** transforms as SQL files run by the worker (no dbt); the reader login limited to the allow-listed columns; staging first, production after the user's OK.
- **Decision recorded:** `.claude/stack-decision.md` **Addendum C**. It covers the choice of Postgres on Railway over BigQuery and Snowflake (data measured at 5.5 MB on staging, 7 rows in production), SQL transforms over dbt, the reader login, the cost model, and revisit triggers.
  - **Cost: about $3.50 a month per environment now, about $7 for both**; $9–$14 in year one.
  - Inputs: Railway prices checked 2026-10-12 (RAM $10/GB, CPU $20/vCPU, volume $0.15/GB, buckets $0.015/GB) and the staging product Postgres's measured 0.29 GB RAM and 0.011 vCPU.
- **Code (PR #187):**
  - `worker/warehouse/grants.mts` generates column-level SELECT grants from `sources.mts`, revoking any earlier grants first, and makes every transaction read-only.
  - `scripts/warehouse-reader.mts`, run as `npm run warehouse:reader`.
  - The worker reads the product through `WAREHOUSE_SOURCE_DATABASE_URL` when it is set.
  - `tests/warehouse-reader.test.ts` (6 tests): a full ingestion runs through the reader; the reader is refused `Athlete.email`, `RewardToken.token`, the `User` table and any write.
  - **Full suite 194 files / 3,108 tests pass.**
- **Staging, provisioned:**
  - Service `Postgres-warehouse` (8903a76f). `railway add` **ignored `-s` and named it `Postgres-Ac6n`, in `sfo`**. It was renamed through the `serviceUpdate` GraphQL call and moved to `us-east4-eqdc4a` with `railway service scale` while still empty.
  - Backups: PITR enabled and wired to `sponsorx-pg-backups`, daily and weekly snapshots, first backup taken, archiver on.
- **Not yet done, and why:** the reader login on staging failed safely (rolled back) because staging's database lacks today's migrations. `release` moves only at the nightly CI run (12:00 UTC) and was 49 commits behind `main`. After the deploy that carries #185–#187:
  - apply the reader login on staging (the `railway ssh` pattern);
  - set `WAREHOUSE_DATABASE_URL` and `WAREHOUSE_SOURCE_DATABASE_URL` on staging `api`;
  - verify a real run;
  - then production, with the user's OK.
- The password for staging's reader is in the session scratchpad only, until it is set as a Railway variable.
