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
