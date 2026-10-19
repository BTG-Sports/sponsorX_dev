# 2026-10-19

## HeckerCreatives — the seven remaining Phase 3 screens reconciled with their engines and walked live (3S5-FE-01, 3S6-FE-01, 3S7-FE-01/02/03, 3S8-FE-01/02)

Branch `feature/3S5-FE-01-3S8-FE-02-engine-walk`, cut after pulling `main` and `main_development` (both at #252: 3S6-BE-02/03/04, 3S9-QA-01/02, 3S9-OPS-01, 3S1-OPS-02, the Phase 4/5 split, 4S0–4S2). Local: Docker up, the ten migrations since 10-15 applied, Prisma client regenerated, API + worker on :4000 from `npm start`, `next dev` on :3000.

**What was still open.** The three engines of 10-14 (pricing, matching, forecasting) were walked on 10-15. The other seven screens had engines mounted on 10-15/16 (make-goods, attribution, both hubs, scenarios, anomalies, models) but were still built against the *proposed* shapes in `SponsorX-Phase3-Screen-Contracts.md`, so each would have shown `EnginePending` or, worse, rendered the real payload wrongly. Every lib was compared field by field with the engine's actual presenter (`views()`, `toViews()`, `modelView`, `attribution-desk.ts`, the two hub files, `scenario-engine.ts`) and its backend tests.

**One shared fix.** `lib/intelligence.ts` `routeMissing`: a switched-off feature now answers `403 { code: "feature_off" }` (3S8-OPS-01), not 501; the screen treated that as a real error. It is now "pending", and only that 403 — a plain 403 stays a refusal. Test added.

**Per screen — the mismatches that would have shown wrong on live data:**

- **3S5 make-goods.** `status`, `automatic { approved, heldBecause[] }`, `decision.automatic / runsFrom / runsUntil` were missing from the type. Rows now say "Held for a person · N reasons" or "SponsorX · automatic / approved automatically / Runs Oct 20 – Nov 2"; the drawer lists `heldBecause`; the note rule is the API's one sentence (8–2,000, trimmed).
- **3S6 attribution.** A refund's negative amount printed as "$-43"; `kind`, `keysGiven`, `dismissed`, `occurredAt` were missing; the redemption tile said "$0 reward value"; an unknown `?campaign` (404 with a message) went to the error boundary. Refunds are their own row ("Refund — taken off the total"), the queue shows key *names* and dismissed rows with who/when/why, and **Dismiss is live** for BTG admins (`attribution/actions.ts`, `components/attribution-dismiss.tsx`, reason 10–500); others read-only.
- **3S7-FE-01 sponsor hub.** `ESTIMATED_MEDIA_VALUE.amountCents` is `null` without a benchmark and rendered as "$0 estimated" — now a dash with the reason. `costPerResultCents` of 0 ranked as best value at "$0.00" — now "no spend booked in this period". `renewals[].ended` was missing; `AD_SLOT` labelled "Edition ad"; `segments: []` reads "No sourced audience yet".
- **3S7-FE-02 property hub.** Shapes matched, words did not: opportunity is unsold items *at listed price*, sell-through counts items not units, rates are the roster's items only; a 0 fit prints "Not a fit" with the engine's reason.
- **3S7-FE-03 scenarios.** `savedBy` required; age bands are record keys (`18_PLUS`) and needed labels; the planner's own validation diverged from the engine's `inputProblems` words and only showed the first problem — it now repeats them word for word (pinned against the backend test) and pre-empts the integer bounds the API answers with a wordless 400; name cap 120 (was 80).
- **3S8-FE-01 anomalies.** `rule.version` is the registry stamp (`anomaly-rules@1.0.0`) — `ruleLabel` would have printed `duplicate.post@anomaly-rules@1.0.0`; `asOf` is the epoch until the rules first run and would have shown "as of Jan 1, 1970"; `disposition.automatic` was missing. The sample's rule ids and subject types now match the engine's seven real rules.
- **3S8-FE-02 models.** The largest: versions are bare numbers, `settings` and `backtest` per version, `benchmarkValidation` missing entirely, `thresholds` units, `factors` only for matching in points, `benchmarkMinSample` 10 not 30, ten flags not seven, `rollouts` always empty. The settings editor *blocked* out-of-range values client-side, so the engine's hold-for-a-second-person path was unreachable — it now warns, saves, and shows `{ version, status, heldBecause }`; a held draft gets a **Validate** button (new `validateVersionAction`) with the second-person rule; reasons are 10–500 (the shared intel-admin helper said 8 and let a 9-character reason through to a 422).

**Docs:** each section of `SponsorX-Phase3-Screen-Contracts.md` ends with a "Reconciled and walked 2026-10-19" note; the header says every shape has landed; the liveness table records the 403.

**Walk (live, dev servers, 2026-10-19).** Data: `forecasts:refresh` (3 campaigns), `makegoods:refresh` (1 shortfall, approved automatically), `anomalies:refresh` (1 `manual.over_measured` flag), `models:backtest --simulate` (forecast 2.0.0, 900 simulated campaigns), `benchmarks:validate` (0 of 0; "The nightly fact check has not run yet."). A temporary Playwright spec (`pageAs` as `qa7-admin`, `qa7-sponsor`, `qa7-pm-b` → `seed_prop_hawks`) registered a generic-webhook partner through the API and delivered a token-matched $45 sale, its $15 refund by order id and an unknown-token sale, then:
- make-goods open + approved (SponsorX · automatic, run window);
- attribution events (refund row, $30 net) and queue ("Carried reward token" → dismissed with a reason by the admin);
- scenarios: live calculate at $25k, "Set a budget above zero." verbatim, saved with `savedBy`; then the `scenarios` flag off via `PATCH /intelligence/flags` → `EnginePending`, on → live;
- anomalies: the flag reviewed, "Confirmed issue" with a note → final on Resolved;
- models: six models, forecast 2.0.0's "(simulated)" backtest in the table, benchmarks empty with the reconciliation verdict, flags incl. "Zoho intelligence sync";
- sponsor hub (30d and 90d) and property hub as their own roles;
- phone (390px): make-goods, models, attribution — no horizontal overflow.
- **10/10 checks, 0 console errors, 0 page errors, 0 5xx**, screenshots reviewed by eye (desktop + phone). The partner, its rows, the saved scenario and the flag row were deleted afterwards; the anomaly's decision stays (local only). Spec deleted.
- Harness notes: `getByText(/refund/i)` first hits the hidden sidebar's "Refunds to send" — match the row's full sentence; a `<p role="alert">` that renders only with text is the one to assert, not `getByRole("alert").first()`.

**Verified:** frontend vitest **140 files / 1,587 tests** (was 1,541), `tsc` clean, `eslint --max-warnings=0` clean on all 32 touched files, `next build` green. Backend untouched.

**Tracker:** the seven rows stay Done; Notes record the reconciliation and the walk. Stage Progress: the 2026-10-19 row appended from the live block.

## HeckerCreatives — QA pass on the seven screens and their engines (API + screens), and the findings fixed

Two independent passes on commit `b57dfa7`: a high-effort code review of the branch diff (unanchored on my own notes), and a temporary adversarial Playwright probe (`pageAs` admin / sales / campaign manager / super admin / sponsor) against the dev stack — auth edges, role gates UI vs API, validation bounds, 409/422/404 paths, tenant scope, the switched-off state, and phone layouts.

**Passed first time:** no token / garbage token → 401 on every new write with no figures in the body; Sales and campaign managers get "Not in your role" on make-goods and models and see no Dismiss button on the queue (API refuses 403); sponsor can't read the desk, the registry or the property hub; admin can't read the sponsor hub (403, scoped); 422 wording on the make-good note, anomaly note, dismiss reason and model reason; 409 on a person's final anomaly decision and on approving a decided shortfall; `?tab=bogus` / `?kind=bogus` / `?status=bogus` / `?range=bogus` → 400; strict bodies refuse extra keys; the **held draft → proposer's self-validate 409 → second person validates → Activate from the screen → roll back** path end to end; scenarios off → calculate and save both 403 `feature_off`; four screens at 390px with no overflow.

**Findings, all fixed in the same pass (frontend + backend):**
1. **Switched-off read as "not built yet"** (review + probe). `routeMissing` folded `403 feature_off` into "pending", so a tenant whose feature BTG deliberately switched off saw "Engine not live yet · waits on 3S7-BE-01". `lib/intelligence.ts` gains `featureOff`; `server/engine.ts` marks the pending engine `off`; `EnginePending` then says **Switched off** with the Feature-flags pointer (sponsor/property wording separate) and drops the "waits on" block; a write returns the API's sentence instead of "isn't live yet".
2. **Raw user id as the decider** (probe: "Dismissed by e2e_u_qa7_admin"). `attribution-desk.ts` now resolves `dismissed.by` through `peopleWords` (exported from `anomaly-engine.ts`, the same "email (Role)" / "a former user" rule); never an id.
3. **Second dismiss was 404 "No such unmatched sale"** while the sale sat on the list. Now `409 attribution_decided` — "Already dismissed; the record stands." / "matched meanwhile" — with a true 404 only for an id that exists nowhere. Backend test updated for both.
4. **Editor offered a save the API refuses** (review + probe: 365.5 days → the dialog said "goes live at once", the API said 422 "… is a whole number."). The registry's thresholds now carry `integer`; `thresholdErrors` refuses a fraction with the API's sentence. Seen live on the screen.
5. **Benchmark verdicts joined by rebuilt prose** (review). The screen reconstructed the API's "Sport: Soccer" label to find a row's verdict; any wording drift would have silently shown every row as "Not checked yet". `model-admin.ts` now puts the same `label` on each check and the screen joins on it; the rebuild helper is gone.
6. **Budget 0 on `/scenarios/calculate` was a wordless 400** (zod `min(1)`), unlike every other input problem. The contract floor is 0 so the engine answers "Set a budget above zero." (negatives and ceilings stay the contract's). The screen pre-empted it already.
7. Small ones from the review: a dead `thin` branch on the benchmarks table that string-matched reason prose; an unreachable sample guard in the dismiss island; the anomalies sample's `page.total` (5 → 7 rows).

**Not changed, noted:** the sponsor hub's "Campaigns counted" counts every non-draft campaign regardless of the range (engine semantics, copy already says so).

**Verified after the fixes:** probe 12/12 with 0 findings (was 7), 0 console / page errors / 5xx; frontend 140 files / 1,589 tests, tsc, eslint; backend tsc + eslint on the touched files, and against `sponsorx_test`: attribution-matching, model-registry, backtest, anomalies, tenant-isolation, scenarios, openapi — green; `next build` green. The probe's partner, rows, scenario, flag rows and model versions were deleted afterwards; the spec deleted.

## HeckerCreatives — QA round two (what round one did not touch), one finding fixed

A second temporary probe (admin / super admin / campaign manager / an empty sponsor / a sponsor analyst / the Hawks' property manager) on the state after round one:

**Passed:** the **held make-good path** end to end — a 5M-impression guarantee on the 37%-elapsed campaign (today's kept forecast deleted locally so the script re-forecast it) produced a shortfall held for three reasons, the drawer lists them under "Waiting for a person" with three substitutes and their checks, a 5-character note shows the API's rule, a person's approval records "email (BTG admin) · a person's decision · Runs Oct 20 – Nov 2", a second approve is 409. **Anomalies:** SponsorX's automatic exclusion (seeded) shows "automatic · you may replace it", the drawer offers "Replace SponsorX's decision", a person's replacement becomes final, a further change is 409. **Models from the screen:** 740 days warns "Outside the safe range", the dialog says held, the outcome banner carries `heldBecause`, Validate appears after reload, the proposer's own Validate shows the 409 sentence, the super admin validates on screen, the scenarios flag switched off and on from the Feature flags view and the planner shows the off card in between. **Attribution:** campaign manager cannot add a partner (403) but reads the list; 1-char name and unknown adapter are 422; a resent partner event counts once; a refund for an unknown order lands in the queue as no_match; empty and 501-event deliveries are refused; size=1 pages the queue; the super admin's Dismiss reads "(Super admin)". **Scenarios:** the name input caps at 120, "Into B" loads a saved scenario's budget, size=1 pages the saved list. **Hubs:** an empty sponsor sees zeros and no NaN; the sponsor analyst reads the hub (API 200, screen live). **Filters:** make-goods `?campaign=`, the anomaly kind chip writes `?kind=`, `?class=MODELLED`. **Error boundary** on all seven screens with `?demo=error`: no stack, no source path. **Phone:** the make-good drawer and the flags view at 390px, no overflow.

**Finding, fixed:** after approving from the drawer, the **"Open shortfalls" tile still said 1 while the Open tab said 0** and its own caption said "nothing short". `components/ops-fx.tsx` `OpsCount` writes the text node by hand; when the value falls to 0 the effect returned early and the previous effect's cleanup had just written the previous value back. It now settles the node to the new value first (also under reduced motion). This tile is shared with the Operations board, forecasts, new-signup rules and the two payments desks — any refresh that took a count to 0 showed the old number. Verified live: tile 0, tab 0.

**Backend test coverage added** for round one's engine changes: thresholds carry `integer` (model-registry.test), every verdict carries the row's `label` (backtest.test).

**Verified:** probe 9/9, 0 findings, 0 5xx (the five console errors are the deliberate `?demo=error` throws); frontend 140 files / 1,589 tests, tsc, eslint, `next build`; backend model-registry + backtest green on `sponsorx_test`. Seeds removed afterwards: the partner and its rows, the scenario, the flag rows, the probe's model versions, the walk's shortfall (decided rows are final, so the local DB's trigger was stepped around with `session_replication_role = replica`), the guarantee cleared, the anomaly re-opened. Spec deleted.

## HeckerCreatives — QA round three (concurrency, cross-screen, other tenant, hostile input, idempotency, paging, timing, a11y), three findings fixed

A third temporary probe on the state after round two, signed in as admin, super admin, campaign manager and — by re-granting an existing Clerk identity into the E2E Westfield Hawks tenant — another tenant's BTG admin.

**Passed:** two parallel approvals of the held shortfall → one 200, one 409, one `makeGood.approve` audit row; two parallel validates of a held draft → 200/409 ("Only a draft is validated."); a double-click on Dismiss sends once and shows no error; the other tenant's admin sees none of BTG's data on five screens, gets 404/403 on BTG's shortfall, sale, forecast, campaign and flag by id, and sees only its own flags in the registry; hostile strings (`<img onerror>`, quotes, emoji, CJK) in a partner name, an event reference, a scenario name, an anomaly note and a model reason render as text everywhere (no element injected, no alert, emoji and CJK kept); the nightly scripts are idempotent (second run: 0 forecasts, 0 new shortfalls, 0 new flags); paging edges on four desks (page=99 → 200 empty, size=1000 clamped, page=0/-1 and size=abc/0 refused, never 500); the seven reads answer in under 80 ms locally; a burst of 30 calculates → 30 × 200; the accessibility sweep found every button named, every field labelled, one h1 and no alt-less image on five screens; the audit desk lists the approve, dismiss, validate and version-create entries; phone drawer and planner at 390px.

**Findings, fixed:**
1. **A double-submitted settings change created two versions** (2.2.0 and 2.3.0, both drafts). `changeSettings` is now idempotent under the model lock: the live version's own values are 422 "Nothing changed", and a draft's values return that draft. Test added (model-registry.test).
2. **A dismissal that lost the race answered 404 "No such unmatched sale"** while the sale sat on the list, dismissed by the other person. The write's status guard now answers `409 attribution_decided` ("Already decided meanwhile; the record stands.").
3. **The forecast detail received `makeGoods` and showed none of it** (only a link to the centre). It now has a Make-goods card: shortfall and value at risk, Approved / Held for a person / Open, the substitute, who decided and when it runs, or the first held reason. `ForecastDetail.makeGoods?: Shortfall[]`.

**Harness notes:** three of the first run's "findings" were the probe's own — a `&` where the scenarios URL needed `?` (six phantom 404s), and two assertion regexes that did not match the screen's real words. Fixed before anything was concluded.

**Verified after the fixes:** probe 10/10 with 0 findings; frontend 140 files / 1,589 tests, tsc, eslint, `next build`; backend tsc + eslint, model-registry (8), attribution-matching + tenant-isolation (22) green on `sponsorx_test`. Seeds removed: partner and rows, scenarios, flags, the probe's model versions, the walk's shortfall (trigger stepped around locally), guarantee cleared, anomaly re-opened, the finance identity restored to its tenant and role. Spec deleted.

## HeckerCreatives — QA round four (the production build, shared-code regression, the repo's own suites), no product finding

**Production build, not `next dev`** (`next build` + `next start`, the same build CI serves — note Next warns that a standalone build prefers `node .next/standalone/server.js`; `next start` still serves it): the security headers are present (`Content-Security-Policy` frame-ancestors/base-uri/object-src, the report-only CSP, no `x-powered-by`); no dev overlay; `?demo=sample` is dead on every screen; the seven screens plus pricing and matching are live; three writes made on the production server show on the very next navigation with no stale render (a dismissal, an anomaly disposition, a live settings save → "Live: 2.1.0"); `?demo=error` on seven screens shows the boundary only — the six console entries are React's production message for a Server Component throw ("the specific message is omitted in production builds"), which is the deliberate throw itself, so nothing leaks; zero CSP violations, zero 5xx.

**Regression on the shared code this branch touched.** Every count-up tile on the Operations board, the forecasts list, make-goods, both payments desks and the new-signup rules shows the same figure it reads out to assistive tech after the animation (24 tiles), and settles immediately under `prefers-reduced-motion`. The earlier engines' screens (pricing, match explorer, forecast detail) are live for a campaign manager, and the forecast detail's new Make-goods card appears for them too.

**The repo's own suites.** Backend, full, on `sponsorx_test`: **3,397 passed**, the same five Windows-only static failures as before. The five `admin-*` browser specs against the production server: 20 passed, 3 timed out at 30 s under five parallel workers on one laptop server ("element is not stable" while entrance animations ran); all three pass on a rerun at 14–16 s each — contention, not a regression. `public.spec` 3/3. `loop-p4-matching` could not run: the Clerk dev instance is at its 100-user cap (known since 2026-10-02), so it cannot mint `e2e.p4.reserve@example.com`. The API log since the morning: no errors, no e-mail addresses.

**OpenAPI.** The document has every new route (dismiss, validate, partners, flags, the public partner events) and the relaxed `ScenarioInputs` floor. **Noted for the engine owner, not changed:** the builder documents `200/400/401/403/404` for all 447 operations and never `409` or `422`, although the intelligence writes answer both (decided shortfalls, final decisions, dismissed sales, the proposer validating their own draft; every note/reason rule). A per-route declaration in `contracts/registry.ts` would close it; it predates this branch.

**Knowledge graph re-ingested** (`graphify --update`, CLAUDE.md's rule; the review flagged the graph was last built 2026-10-02). The manifest no longer matched the tree, so every code file re-extracted structurally: 13,994 AST nodes merged into the existing graph → 16,886 nodes / 44,749 edges / 602 communities, 5,280 nodes new, 9 deleted files pruned, health OK, 533 community names carried over by majority. **Deferred:** semantic re-extraction of 376 changed docs/images (195 `.md`, 160 images, 6 PDFs) — there is no Gemini key and the images alone would be 160 subagents; their old nodes stay in the graph and the manifest leaves them unstamped so the next `--update` re-queues them. Someone with a `GEMINI_API_KEY` can finish it in one run. (A second `--update` after round two's three-file change was refused by the shrink guard — the merge deduplicated one node, 16,886 → 16,885 — so the manifest was reverted and those three files re-queue with the next update; the graph on disk is the first re-ingest's.)

**Not started, deliberately:** the Phase 4 web-application screens (4S1-FE-01/02/03, 4S2-FE-01) — their engines landed on 10-16 (`/virtual/*`), but every row is ⏸ behind `4S0-ART-01`, the owner's design task, and no screen or contract exists yet. That is new screen work, not integration.

## rcfworks — the open items from 2026-10-16: P8-BE-01, 4S2-BE-04, 4S7-BE-01 (Code review); 3S7-INT-01 (waiting on the user)

The user asked to close and implement every open item from the last summary. The plan was approved, with the CI steps run locally first.

**Local CI, before any change.**
- This Mac has no Docker. Postgres runs from `embedded-postgres@18.4.0-beta.17` in the session scratchpad (17.x is no longer published). Its postinstall (`hydrate-symlinks.js`, symlinks only) has to be run by hand, because npm now holds install scripts back.
- **The baseline:** security scripts, secret scan, audit, backend build, lint, frontend build and 1,543/1,543 frontend tests all passed. The backend had 3,410/3,411. The one failure was `phase1-acceptance.test.ts`: another test file had seeded `SX-04`/`SX-05` under its own tenant first. That is the P8-QA-01 finding below, and the fix ends it.

**3S7-INT-01 (stays Code review).**
- **Checked on staging:** the nightly `zoho_intelligence` step ran. On 2026-10-15, 23 `zoho.pushIntelligence` jobs completed. All 23 sandbox Accounts carry `SponsorX_Next_Action` ("No campaign ending soon.").
- **Not yet met:** `SponsorX_Renewal_Score` is empty on all 23, because staging has no campaigns at all, so none ends soon.
- **Blocked:** writing a simulated live campaign and forecast to staging was blocked by the session's permission check (a remote write). It needs the user's OK. Nothing was written.

**P8-BE-01 · a NIL job catalogue per tenant (new row, Phase 1, Order 157.5).**
- **The key:** `NilJob` is keyed by `(tenantId, id)`. AthleteRate, CampaignInvite, CampaignOrder and Offer reference it by `(tenantId, jobId)`, so the database refuses a link to another tenant's job.
- **Migration** `20261019100000_nil_job_per_tenant`: a DO block first stops, with the list, if any row already points at another tenant's job. Staging was checked read-only: none.
- **Reads:**
  - `seed-catalogue` upserts on `("tenantId", id)`; it used to land on whichever tenant held the id;
  - the invitation email joins on the tenant too;
  - the campaign desk reads the brief's tenant's jobs;
  - the pricing engine prefers the items' own tenant's floors, falling back to another tenant's;
  - `inventory.assertJob` is unchanged: an item's job is a catalogue kind.
- **Tests:** `nil-job-per-tenant.test.ts` (5). `phase1-acceptance.test.ts` now always holds its own catalogue.
- **Docs:** the acceptance record's finding is marked fixed, and the Phase 1 plan has the new entry (221 tasks).

**4S2-BE-04 · signed asset delivery.**
- **The links:** each manifest file carries `url` (a signed GET to the private bucket) and `urlExpiresAt`.
- **Timing:** storage caps any link at 15 minutes, so links are signed at the start of each 5-minute step and each is good for at least 10. Within a step the links are the same string.
- **ETag:** it covers the body plus the step. `worldManifest` answers `notModified` before signing, so an unchanged poll signs nothing.
- **Audit:** `storage.presignCreativeLinks` writes one `virtual.creativeLinksGrant` row per grant, naming the keys, never the links.
- **Not edge-cached:** the links go to R2 directly. A caching layer is a separate task, only if 4S8-OPS-01 needs one.
- **The test bucket** now checks a presigned GET's signature and expiry.
- **Tests:** `virtual-creative.test.ts` has 3 new tests (14 in all): the link fetches exactly the file (checksum), a link pointed at another key or past its expiry gets 403, a new step brings new links and a new ETag, and there is one audit row per grant with none on a 304.

**4S7-BE-01 · cross-channel campaign.**
- **The link:** `PlacementWindow.campaignId` is now a foreign key, with `Campaign.placementWindows`.
- **Money:** a booking is a `PLACEMENT_WINDOW_BOOKED` fact (channel `INFINEX`, inventory `VIRTUAL_PLACEMENT`, measure `virtual_booked_cents` → `CampaignDaySummary.virtualBookedCents`). Releasing reverses it on the release day.
- **Wiring:**
  - the nightly fact check compares the BOOKED windows' `priceCents`;
  - the fact-coverage static test holds both new sites;
  - `sponsorSpendCents` and `sponsorSpendFor` add the booked windows;
  - the sponsor report gains `virtualPlacements` and an "INFINEX placements" section in the PDF.
- **Stages:** `CampaignShape.placementWindows` (BOOKED only). A campaign holding only INFINEX placements skips STAFFING like an ad-only one; one with athlete work does not.
- **Migration** `20261019120000_virtual_booked_fact`. Staging has no windows, so no history fill is needed.
- **Tests:** `cross-channel-campaign.test.ts` (4), plus a spend case in `sponsor-report.test.ts`.
- **Docs:** Fact Ledger v1.13 and Virtual Registry §4 and §7.

**Tracker:** P8-BE-01 is added as Phase 1 row 305 (the autofilter, Status validation and conditional formatting now reach row 305; the Dashboard already reads to 400). 4S2-BE-04 and 4S7-BE-01 are at Code review, owner rcfworks, started 2026-10-19.

**Not done here:** 4S7-DATA-01 (counting a fan once across channels) needs in-game events (4S4/4S5).

## rcfworks — 3S7-INT-01 to Done; #255's e2e fix

- **3S7-INT-01 → Done (the user's OK for the staging write).**
  - **The simulated data:** staging got one clearly labelled campaign, `sim_3s7int01_campaign` ("UAT simulated — Harborview spring push", ACTIVE, ends 2026-11-08), with a forecast (86,000 of 100,000 impressions), for the sponsor "UAT 2610090617 Harborview Bakery".
  - **The push:** `queueZohoIntelligence` queued 1 push for that tenant, and the worker sent it.
  - **Read back from the sandbox:** Renewal Score 86; Next Action "Renew: UAT simulated — Harborview spring push — On course to deliver 86,000 of the 100,000 impressions promised (86%)."
  - **Production:** its two fields follow P2-OPS-04's Zoho keys, as recorded on 2026-10-15.
- **#255's e2e failed on CI.** `e2e/support/loop-db.ts` seeded NilJob with `on conflict (id)`, and P8-BE-01 removed that key. It now uses `("tenantId", id)`. A `git grep` of the tracked files found no other NilJob upsert. The e2e suite is now run locally before pushing.


## rcfworks — 4S2-BE-05 · deployment pause and roll back (Code review)

The user picked this as today's extra backend task; the plan was approved.

- **Pause and resume.** `POST /virtual/deployments/{id}/pause` takes an APPROVED deployment PAUSED, with a reason. `…/resume` takes it back to APPROVED, re-checked like an approval (`liveProblems`, now shared with approve). The database's one-at-a-time rule refuses a resume if another approved deployment took those days.
- **Roll back.** `POST /virtual/windows/{id}/rollback` turns the window's running or paused deployment ROLLED_BACK and puts the previous validated version (or a named one; naming a newer one rolls forward) on the window, approved, from now to the old end, in one transaction.
- **Effect on the world:** each bumps `manifestVersion`, so the ETag changes. The manifest shows only APPROVED, so the world sees the change on its next poll (`ttlSeconds` 60), with no INFINEX release. A paused deployment gets no new links; ones already handed out lapse within 15 minutes.
- **Database.** PAUSED and ROLLED_BACK were already allowed. Migration `20261019150000_deployment_pause_rollback` adds `pausedAt`, `rolledBackAt`, `stateReason` and `replacedById`, with a CHECK that each state carries them.
- **Other changes.** `endDeployment` refuses a ROLLED_BACK deployment (end its replacement instead). A window given back leaves rolled-back deployments as they were.
- **Audited:** `virtual.deploymentPause`, `virtual.deploymentResume` and `virtual.deploymentRollback`.
- **Wired in:** the OpenAPI registry has the three routes, and the tenant-isolation sweep covers pause and rollback (resume needs no body).
- **Tests:** `virtual-deployment-control.test.ts` (6).
- **Docs:** Virtual Registry §6.1 and §10, and the Phase 4 plan. Tracker: Code review.
- **Held locally** until #255 merges, so the two PRs don't stack.

## rcfworks — #255 merged; P8-BE-01, 4S2-BE-04, 4S7-BE-01 to Done; sync #256

- **#255 merged by the user.** The permission check blocks me from running `gh pr merge`. CI was all green on the rerun, including e2e.
- **To Done (tracker and plan):** P8-BE-01, 4S2-BE-04 and 4S7-BE-01, merged with their acceptance met.
- **Sync PR #256** (main_development → main) is open. `git merge-tree` of main and main_development gives exactly main_development's tree. The deploy follows once main is green.

## rcfworks — deployed cd751d2c; #257 merged

- **#256 and #257 merged by the user.** main's CI on `cd751d2c` was all green, including e2e. Claude ran `deploy-daily.yml`, and `release` moved 4cc18895 → `cd751d2c`.
- **Staging, checked read-only:**
  - both #255 migrations are applied;
  - `NilJob_pkey` is `("tenantId", id)`;
  - `AthleteRate_tenantId_jobId_fkey` and `PlacementWindow_campaignId_fkey` exist;
  - `CampaignDaySummary.virtualBookedCents` exists;
  - `/health` returns 200.
- **Production** reads are blocked for Claude. The job-catalogue migration checks itself, so it would stop with a list rather than apply over a cross-tenant link.
- **Still to sync to main:** 4S2-BE-05 (#257) is on main_development and goes with the next sync PR.
- **Tracker sync workflow:** it failed on `cd751d2c` because the Google Sheet endpoint answered 404. It has failed on and off since 10-16 and passed at 03:30 today. Not caused by this work.
- **Stage Progress:** today's row (already there) is updated for P8-BE-01 Done: S8 24, Done 292, days left 16.
