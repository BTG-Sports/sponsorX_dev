# 2026-10-16

## rcfworks — 3S6-BE-02, 3S6-BE-03, 3S6-BE-04: partner sales matched, and the queue

The last Phase 3 backend tasks. The plan was approved by the user before starting, with dismiss-only on the queue (no manual assignment) and the click id read as the athlete's existing tracking-link code (no change to the redirect).

**Built:**
- **3S6-BE-02: `PartnerSaleAttribution`.** One row per partner sale or refund, holding:
  - its source, method, matched key, window, confidence and model version;
  - the campaign and athlete it matched.

  The partner's own id is unique per partner, so a resent sale counts once. A database CHECK refuses a modelled sale labelled verified. It is wrapped in `IS TRUE`, because the first version let a NULL key through; the test caught it.
- **3S6-BE-03: exact first.**
  - **Keys, in order:** reward token, then tracking-link code, then an order id already matched (how a refund finds its sale), each inside the adapter's window.
  - **Modelled fallback:** `attr-geo-time@0.1.0`, the new `attribution` model in the registry. It runs only when no key matched and the adapter declares probabilistic. The generic webhook doesn't, so nothing changes for it.
  - **Sponsor hub:** "sales matched" and "sales likely" now read these rows.
- **3S6-BE-04: the queue.**
  - **Every unmatched sale stays** with its reason: `no_match`, `ambiguous`, `outside_window` or `unknown_token`.
  - **Nightly retry:** a new `attribution` step in the chain, recorded in `PipelineRun`.
  - **Dismissing:** BTG admins dismiss with a reason. It is audited (`attribution.dismiss`), and the sale stays on the list, marked.
  - **Endpoint:** `GET /intelligence/attribution` serves the 3S6-FE-01 screen contract.
- **Permission:** `attribution` read is widened to `CAMPAIGN_MGR` and `SALES` (the screen contract's readers). Writing stays with BTG admins.
  - The RBAC matrix §36 is updated, and the digest is now `8f3f5c877af850bb`.
- **Docs:**
  - new: `SponsorX-Attribution-Matching.md`;
  - updated: the Phase 3 plan entries, the screen contract ("Mounted 2026-10-16"), Attribution Framework, Hub Intelligence, Model Governance, Pipeline Monitoring and RBAC §36.
- **Migration:** `20261016120000_partner_sale_attribution`.

**Checks:**
- `tests/attribution-matching.test.ts` (12 tests) covers:
  - every key and every reason;
  - the CHECK refusing five bad label combinations;
  - the modelled fallback, including ambiguous;
  - a refund inheriting "modelled";
  - the nightly retry;
  - the desk's totals, with refunds taken off;
  - dismissing;
  - who may see and do what;
  - the sponsor hub.
- The tenant-isolation sweep covers the dismiss route.

**Tracker:** 3S6-BE-02/03/04 moved to Done on 2026-10-16, after #237 merged with acceptance met. Sync PR #238 (main_development → main) is open; the deploy follows once main is green.

## rcfworks — deploy, and 3S9-PMO-01 · Phase 3 acceptance and rollout (Code review)

- **Deployed:** after #238 merged, `main` CI passed, and deploy-daily moved the release to `11d0a316` (3S6-BE-02/03/04 live, with the migration `20261016120000_partner_sale_attribution`).
- **What's left in Phase 3** (reviewed for the user):
  - 3S7-INT-01 is at Code review, waiting for tonight's sandbox Zoho push;
  - 3S1-OPS-02 is on hold by the user's decision (2026-10-14);
  - 3S9-PMO-01, below.
- **3S9-PMO-01:** written as `documentation/SponsorX-Phase3-UAT.md`, approved as a plan by the user.
  - **The criteria:** each of the 12 is mapped to the tests that prove it; 196/196 pass on release `11d0a316`.
  - **Criterion 12** ("all features can be disabled") was only tested for 3 of the 10 features. Added `tests/phase3-feature-flags.test.ts`, which switches each of the ten off and back on and fails if a new feature has no check.
  - **Staged rollout:** stage 1, BTG's internal desks; stage 2, the hubs on BTG's own accounts; stage 3, outside sponsors and properties at go-live. Per-tenant switches and model rollback are the way back, with no release needed.
  - **Done, 2026-10-16.** The user's instruction was: "if it meets the acceptance criteria, move it to done." The sign-off is recorded in §4 of the doc.

## rcfworks — 3S1-OPS-02 · the warehouse code removed; the databases stay (Done)

- **Why now.** PR #240's CI failed on `warehouse-ingest.test.ts`. That test raced with other test files' clicks dated November 2026. I fixed the test first. The user then asked why a parked warehouse was still being tested, and said to remove it from the tests and only note that the database exists.
- **Removed:**
  - the worker's hourly copy;
  - `backend/worker/warehouse/` (ingest, build, grants, sources, reconcile, migrations, transforms);
  - the four `warehouse-*` test files;
  - `scripts/warehouse-reader.mts` and its npm script;
  - the `.env.example` lines.
- **Kept, unused, by the user's decision:**
  - `Postgres-warehouse` (staging) and `Postgres-warehouse-production` on Railway;
  - their `WAREHOUSE_*` settings on the worker services, which nothing reads now;
  - the `warehouse_reader` login on each product database.

  They are noted in `.claude/stack-decision.md` Addendum D4 and in `SponsorX-Warehouse-Schema.md`.
- **3S1-OPS-02 is Done.** Its "Done when" was amended to match the user's decision: the databases are noted, not deleted.

## rcfworks — Phase 4 split: the web application stays, the game moves to Phase 5 (user's decision)

**Why:** the user is INFINEX's game developer, and the game has not been started. The user decided: "remove all tasks pertaining to the game and transfer it to phase 5. we finish phase 4, only the web application." Moved tasks are renumbered (approved).

**Tracker** (this PR; the plan files follow in the next):
- **Phase 4: 47 tasks, 190 days.**
  - **Removed:** 4S3-INT-01, 4S3-QA-01, 4S9-QA-01, 4S9-PMO-01.
  - **Split:** 4S3-INT-02 (now 2 days) and 4S3-INT-03 keep SponsorX's side, proven with a stand-in world. Both now depend on 4S2-BE-03.
  - **Redefined:** 4S0-PMO-01 (the world contract SponsorX sets) and 4S9-PMO-02 (Phase 4 UAT: 11 criteria, depends on 4S8-OPS-01).
  - **Renamed:** Sprint 3 is "INFINEX client endpoints"; Sprint 9 is "Web application launch".
- **New Phase 5 sheet: 7 tasks, 21 days.**
  - **Moved and renumbered:** 5S1-INT-01 (was 4S3-INT-01), 5S1-QA-01 (was 4S3-QA-01), 5S2-QA-01 (was 4S9-QA-01), 5S2-PMO-01 (was 4S9-PMO-01).
  - **The game halves of the split tasks:** 5S1-INT-02 and 5S1-INT-03.
  - **New:** 5S2-PMO-02, the pilot sponsor UAT.
- **Dashboard:** a Phase 5 row and column were added. The Phase 4 ranges end at row 51, and the total is now 556 delivery tasks.
- **Roadmap:** a Phase 5 row was added, and its text now says five phases. The Legend's spec source now reads "Phases 2–5".

**Plan files** (the PR after the tracker's):
- **New:** `documentation/SponsorX-Phase5-INFINEX-Game.md`, with the 7 tasks, a former-ID table and 5 acceptance criteria.
- **The Phase 4 plan:**
  - the moved tasks are removed, and 4S3-INT-02/03 are split;
  - 4S0-PMO-01 is redefined as the world contract, and 4S9-PMO-02 is now the Phase 4 UAT;
  - there are 11 acceptance criteria (criterion 3 moved to Phase 5);
  - a dated change note was added.
- **References updated:** `CLAUDE.md`, the phase-file tables in Phases 1–3, the INFINEX API spec (5S1-QA-01, 5S2-QA-01, 5S1-INT-02/03) and the developer handoff.
- **CI:** the Phase 5 plan file is added to the docs-only list.

## rcfworks — 4S0-PMO-01 and 4S0-PMO-02 · the world contract and the taxonomy (Done)

Both were approved by the user as plans before writing ("lets start both 4s0"). Approving the plan is the sign-off, so both go to Done.

- **4S0-PMO-01:** `documentation/SponsorX-INFINEX-World-Contract.md`, the rules any world follows, written before the game exists so the game is built to fit.
  - **Any engine:** HTTPS and JSON; `runtime` and `runtimeVersion` are recorded per world, and no rule reads them.
  - **Environments:** `STAGING` and `PRODUCTION`. Versions are tracked by `buildId`, `manifestVersion`, `schemaVersion` per event type, and `/api/v1` changing only by additions.
  - **Stable IDs:** external IDs are never changed or reused, and a surface keeps the same ID in staging and production.
  - **Anonymous players:** only `sessionRef` and `subjectRef`, and no linking across channels by default.
  - **Two callers:** the world's server and the game on a player's device; the details are 4S0-SEC-01.
- **4S0-PMO-02:** `documentation/SponsorX-Virtual-Taxonomy.md`.
  - **Five levels:** world, district, venue, zone and surface, with the allowed parents for each.
  - **Three tables:** `VirtualWorld`, `VirtualZone` and `VirtualPlacement`.
  - **Seven placement kinds,** each with its specs and creative types.
  - **The mapping to SponsorX:** a `VIRTUAL` property, and an `InventoryItem` of kind `VIRTUAL_PLACEMENT`.
- **Unblocked:** 4S1-BE-01 (and through it 4S1-BE-02/03/04), 4S0-ART-01's dependency, 4S0-PMO-03 and 4S0-SEC-01.
