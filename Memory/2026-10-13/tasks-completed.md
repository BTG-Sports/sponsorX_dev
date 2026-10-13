# 2026-10-13

## rcfworks — 3S1-DATA-02: daily campaign fact and dimension tables (Code review)

- **Pulled `main_development`** (e96835a, HeckerCreatives' P1-ART-25 Finance Vault); nothing on the backend side. Last night's deploy moved `release`.
- **The user's decisions:** rebuild right after each hourly copy; rebuild the whole model each time while the data is small (the 7-day mode is kept for later); the money snapshots start 2026-10-12, with earlier days absent rather than invented.
- **Built (`backend/worker/warehouse/`):**
  - `migrations/0002_model.sql`:
    - schemas `stg`, `dw`, `sem`;
    - the dimensions, `fact_campaign_daily`, `fact_marketplace_order_line`, `snap_ledger_daily` and `snap_payment_status_daily`;
    - `dw.k()`, which computes keys from identity, so rebuilds never renumber;
    - a `raw._ingest_run.built` column.
  - `transforms/`:
    - `10_stg`: latest-version views over raw; audit names mapped (`listing.archived` → `listing.archive`); the helpers `dw.dk`, `dw.market_key` and `dw.arr`.
    - `20_dims`: date 2020–2035; channel; type-2 sponsor, property and athlete from raw versions (one per day, the day's last; the first covers all earlier time); campaign; inventory; market with Census regions.
    - `30_fact_campaign_daily`: every source dated by its own event.
    - `40_marketplace`.
    - `50_snapshots`: state at day end from raw versions.
    - `60_sem`: `campaign_daily`, and `campaign_summary` with the §6 metrics.
    - All of it runs in one transaction after every ingestion, under the same lock (`build.mts`).
  - `reconcile.mts` runs 11 zero-tolerance checks, key by key: booked, compensation, earnings paid, invoiced, invoice paid, marketplace net, ledger, open payments, fan funnel, clicks and views.
- **Refinements while building,** recorded in the design doc v1.2:
  - market joins the fact's key (a reward's venue can differ between otherwise identical rows);
  - order-level money lands on the `CAMPAIGN` channel;
  - `cancelled_compensation_cents` added, so margin is exact;
  - a fan-funnel job is set only when the athlete holds exactly one on the campaign.
- **Found while testing:** a JSON `null` array stopped the build ("cannot extract elements from a scalar"). `dw.arr()` now treats a non-list as empty.
- **Tests:** `tests/warehouse-model.test.ts`, 14 tests against product and warehouse Postgres. It seeds a full campaign and checks:
  - exact figures per day, channel, job and market;
  - the venue market winning over registration;
  - NEXT ad-slot rows;
  - money dates;
  - sponsor and property keys;
  - the semantic ratios;
  - the marketplace line;
  - the snapshots;
  - **reconciliation: every check at zero difference**;
  - a rebuild changing nothing;
  - tier history with old facts keeping the old version;
  - reconciliation **catching** a planted drift (booked 75,000 vs 76,000).
- **Verified:** tsc and eslint clean; **full backend suite 196 files / 3,140 tests pass**. Reconciliation across all tenants of the local test database is clean.
- **Left:** after #191 deploys, run the reconciliation on staging and production and record the results, then Done.

## rcfworks — 3S1-DATA-02 review: the warehouse rule, run timing, diary snapshots, like-for-like double-check

- **The user questioned the approach** ("isn't hourly expensive? why not store at the point of transaction?"). The answers, in plain terms:
  - an hourly run costs pennies (about 0.5 s on a database costing about $3.50 a month);
  - the app already records every event when it happens, and the job only arranges it;
  - updating analytics inside ~70 different write paths would be error-prone, slow the busy moments, and leave no way to rebuild after a bug.
  - The user chose to keep the hourly runs.
- **The rule (user, 2026-10-13): anything that needs the current status reads the app, never the warehouse.** A cancellation shows in the app at once and in the warehouse within the hour, so payments, payouts, refunds, cancellations, permissions, redemption and availability are never decided from the warehouse.
  - Written into design doc §2 and stack-decision **C3a**.
  - Enforced by `tests/warehouse-boundary.test.ts`: no code in `backend/src` or `frontend/src` reaches the warehouse.
- **I overclaimed** that a "last 7 days" switch was ready. It wasn't built, and a plain window would miss figures entered late. Instead:
  - every run records its **build time** (`raw._ingest_run.build_ms`), and the worker warns above 60 s;
  - the incremental build is raised as **3S1-DATA-04** (Blocked, starts when that warning appears; tracker row 55, plan updated, Phase 3 now 52 tasks · 196 days).
- **The money snapshots are a diary:** past days are never rewritten. Only the last day written up to today is redone, and the date table is no longer truncated.
- **The double-check is like with like:** it runs every hour inside the same frozen (REPEATABLE READ) view of the app as the copy, so a change mid-run is not a false alarm. The result is stored in `raw._ingest_run.reconcile` and a failure is logged as an error. Migration `0003_run_checks.sql`.
- **Real bugs found by running the full suite in parallel:**
  - **A date outside 2020–2035 stopped the whole build** (a foreign-key violation). `dw.ensure_dates()` now adds any date the data holds.
  - **The first dimension version started 2000-01-01**, so older records lost their athlete. It now has no start date (`-infinity`).
  - **An order whose job isn't in the catalogue** now keeps its own job line instead of becoming unknown. This also let the test stop creating and deleting the shared `SX-0x` catalogue rows.
  - **A pre-existing flake in `phase2-listing-auto-publish`:** two emails written in one transaction share a timestamp. It is now compared as a set and picked by template.
- **Tests:** warehouse 38 (model 17, ingest 13, reader 6, boundary 2). **Full backend suite 197 files / 3,145 tests, green twice in a row.**

## rcfworks — PR #191's CI failure: a test sorted dates as text

- **What failed:** the required "typecheck · lint · unit · authz matrix" check, which blocked the merge. One test failed, `warehouse-model` "history". Both dimension versions were right, but they were listed in the opposite order.
- **Cause:** the test sorted by `valid_from::text`; the output alias wins over the column in `ORDER BY`. `'-infinity'` as text sorts first under the C collation used locally, and after `'2026-…'` under CI's `en_US.UTF-8`, which ignores the hyphen.
- **Fix:** sort by the date column itself (`ORDER BY a.valid_from`). The warehouse SQL was never at fault.
- **To catch this class of problem locally,** the test databases were recreated with `en_US.UTF-8` (template1 too, so the derived `_warehouse*` databases match CI). The warehouse tests (38) and **the full suite (197 files / 3,145 tests) pass under CI's collation.**

## rcfworks — PR merge order, deploy, 3S1-DATA-02 → Done

- **#192 (main_development → main) conflicted.** The Finance Vault had been merged into `main` (e3d87d1) and into `main_development` separately, leaving the warehouse files and the board with no common base. I had pulled `main_development` but never checked `main`; the user flagged it ("hey, I told you to pull").
  - Every line only on `main` was an older version of a later change, and `main` held no task-board cell that `main_development` lacked.
  - **#193** merged `main` into the branch, keeping `main_development`'s content (the merged tree was identical to it).
  - #192 then merged clean. The memory `always-pull-main-development-first` now also says to check that `main` merges before opening a sync PR.
- **Deploy (user's OK):** `main` CI green → "Daily deploy" started by hand → `release` 91ca9e8. Staging and production deployed it.
- **Live:** run 16 in both environments applied migrations `0002_model` and `0003_run_checks` and built the model (staging 112 ms, production 129 ms). **The hourly double-check was clean in both, with zero differences.** Staging has no campaigns yet, so the campaign checks have nothing to compare; the marketplace, ledger and payment checks matched on real data. **Correction (later the same day):** I said Railway's log view cut the run line short. That was wrong. The worker's log change (build time, double-check result, slow-build warning) was never committed, so the deployed worker printed the old line. The run record (`raw._ingest_run`) did hold the build time and the double-check result, so the figures reported were right; only the explanation was wrong. The log change is committed with 3S1-BE-01's push.
- **Tracker and plan:** 3S1-DATA-02 Done. **3S1-DATA-03, 3S1-QA-01 and 3S2-BE-01 are now Ready.**

## rcfworks — direction change: facts recorded by the app replace the warehouse (user decision)

- **What happened.** Planning 3S1-QA-01 (drift alerts), the user asked why the warehouse could drift at all. My answer listed four causes:
  - app changes the warehouse's rules don't know;
  - bugs in the separate rules;
  - a copy job that can fail;
  - edits made outside the app.

  The user's verdict: the warehouse is "below par", and alerts don't remove causes. They asked for an approach that does, compared in percentages. They also noted, fairly, that these risks should have been explained when the warehouse was proposed.
- **Decision (user): the new approach.**
  - A fact ledger written by the app in the same transaction as each action, with daily summaries updated in that transaction.
  - Corrections are new rows; tests make missed facts fail CI; only the app's login writes; the warehouse is retired.
  - The figures presented: delay 60 min → 0; known silent failure modes 4 → 0; copies of the rules 2 → 1; separate pieces 12 → 0; about $7 → $0 a month; about 45–55% less code (estimate). Cost: about 6–8 days.
- **Notification for the redefined 3S1-QA-01 (user):** email BTG admins plus the admin screen, no Slack.
- **Tracker (Phase 3):**
  - Row 55 (3S1-DATA-04, never started) reused as **3S1-BE-01 Fact ledger and daily summaries (Ready)**.
  - New rows 57–61: **3S1-BE-02** (record facts in every action), **3S1-QA-02** (nothing-slips-through tests), **3S1-DATA-05** (fill history), **3S1-OPS-02** (retire the warehouse), **3S1-OPS-03** (only the app writes, Ready).
  - 3S1-QA-01, 3S1-DATA-03, 3S2-BE-01 and **HeckerCreatives' 3S7-BE-02** (raised today for the intelligence hubs) are re-pointed to the summaries and depend on 3S1-DATA-05. The screen contracts are unchanged.
  - 3S0-DATA-02, 3S0-OPS-01, 3S1-DATA-01 and 3S1-DATA-02 stay Done, marked SUPERSEDED.
  - Ranges and 15 Dashboard formulas extended to row 61. Phase 3 is now 58 tasks · 204 days.
- **Docs:** the Phase 3 plan has the new tasks and a change note; the warehouse design is marked superseded (what carries over is noted); stack-decision **Addendum D** supersedes C.
- **The warehouse keeps running harmlessly** in staging and production until 3S1-OPS-02.

## rcfworks — 3S1-BE-01: fact ledger and daily summaries (Code review)

- **Design:** `documentation/SponsorX-Fact-Ledger.md`, covering the idea, the parts, 8 rules, and the facts by kind (wired in 3S1-BE-02).
- **Built:**
  - `Fact`: one row per business event. Unique per tenant + key, so a retried action adds nothing. `reversesId` is unique, so a fact is reversed at most once. A trigger `fact_append_only` refuses UPDATE and DELETE, except DELETE where `sponsorx.audit_purge = 'on'` (the test databases).
  - `CampaignDaySummary`: one row per tenant × campaign × athlete × channel × inventory × market × day, with 26 measure columns. '' stands for "none" in key columns.
  - Migration `20261013120000_fact_ledger`, taken from `prisma migrate diff` with the 16 older drift lines left out.
  - `src/domain/fact-rules.ts`: closed lists `FACT_KINDS`, `FACT_CHANNELS`, `INVENTORY_KINDS`, `MEASURE_COLUMNS`; `normaliseMarket`.
  - `src/domain/facts.ts`:
    - `recordFact(tx, …)` writes the fact and moves its summary with one `INSERT … ON CONFLICT DO UPDATE col = col + delta`, in the caller's transaction;
    - `reverseFact` corrects with a negated fact on the correction day;
    - `checkFactSummaries` compares the summaries with the sum of the facts, measure by measure.
  - Fan scans, clicks and edition views are deliberately not measures: they are already one row per event and are counted directly.
  - Both models are declared system-internal in `authz.coverage.test.ts` (no route reads them yet; 3S7-BE-02 will add matrix rows).
- **Tests:** `tests/fact-ledger.test.ts`, 11 tests:
  - saved together;
  - a rollback saves neither;
  - an idempotent retry;
  - a correction adds a row and never edits, landing on its own day;
  - at most one reversal;
  - the database refuses an edit and a delete;
  - 20 concurrent writes to one summary row all count;
  - bad measures, fractions and blank keys are refused;
  - the summaries equal the facts, and the check catches a tampered row.
- **Verified:** tsc and eslint clean (the house rule "explicit select" was applied to 7 reads); **full suite 198 files / 3,158 tests, green twice under CI's en_US collation**; no Prisma drift on the new tables.
- **Next:** 3S1-BE-02 wires `recordFact` into every money and delivery action.

## rcfworks — correction: an uncommitted worker change

- While committing 3S1-BE-01, I found `backend/worker/index.mts` still modified. It holds the 3S1-DATA-02 review change: the hourly log line with build time and double-check result, an error log on a failed double-check, and a warning on a build over 60 s. It was edited but never committed (the commit only added `backend/worker/warehouse/`), so it was never deployed.
- It is committed now. The earlier claim that Railway "cut the line short" is corrected above and was told to the user.
- **Lesson:** run `git status` before every commit and check every modified file is either staged or deliberately left out.
