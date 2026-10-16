# 2026-10-15

## rcfworks — yesterday's loose ends

- **#215** (the 2026-10-14 close-of-day log and the Stage Progress row) merged into `main_development`.
- **`FORECAST_EMAILS=on` in production:** the user ran the command.
- **The first full nightly chain (19:00 UTC, staging) ran clean.** Fact check: every figure matched. Benchmarks, suggested prices and forecasts: 0, as expected with no paid orders or active campaigns yet. Feature snapshots: 0 new for 8 athletes, because all 8 had been taken by hand after the 3S2-BE-01 deploy that day (one per athlete per day).

## rcfworks — faster CI merges (no task ID; the user's request)

**Why.** Each release waits on the required merge check twice (branch PR, then the sync PR), and every push to a working branch also started a second, identical run beside its PR's.

**Changed in `.github/workflows/ci.yml`:**
- **No duplicate runs.** A push runs CI only on `main` and `main_development`. A working branch is checked by its pull request.
- **Docs-only PRs skip the build and tests.** "Docs-only" means every file, and every renamed file's old path, is under `Memory/`, `Claude outputs/` or `graphify-out/`.
  - `documentation/` is not on the list, because tests read the RBAC matrix (`next-students.test.ts`).
  - A skipped job reports as passed, so the required check lets the PR merge.
  - If the file list can't be read, or comes back shorter than the PR's `changed_files`, everything runs.
  - Pushes to `main`, the nightly run and hand-started runs always run everything, so a deploy never rests on a skipped check.
- **The security job (secret scan and audit) still runs on every PR.**
- **`authz.coverage.test.ts`** matches the new push trigger.

**Not done (the user is still deciding):** splitting the browser tests across 4 machines (about 11 → 4 min), and splitting the merge check across machines (about 5½ → 2½ min).

**Checks:**
- The skip decision was tested on 7 sample PRs: docs-only, docs plus code, the RBAC matrix, code moved into `Memory/`, an unreadable list, a short list, and a lookalike folder.
- The local test database (embedded Postgres in the scratchpad) was rebuilt as CI builds it.
- Every CI step passed locally: security, both builds, lint, backend 210 files / 3,295 tests, web 140 / 1,531.

## rcfworks — Mac notifications for Slack and GitHub Desktop

- **Cause:** "Allow notifications" was off for both apps. Volume (100%) and alert volume (100%) were fine, and nothing was muted.
- **Fix:** GitHub Desktop needed its own in-app switch first (Settings → Notifications → Enable notifications). Then both apps were set to banners and sound in System Settings.
- **Verified** in `com.apple.ncprefs`: both are allowed, with sound and banners.

## rcfworks — 3S5-BE-01 and 3S5-BE-02 · make-goods (Code review)

**Decisions (user, 2026-10-15):**
- A make-good runs over **14 days from tomorrow**, past the campaign's end if need be.
- "Reflected in the campaign" means it **shows on the campaign** (detail and forecast) **with the inventory held**. Creating a real order for the athlete or venue is left for later.
- **Automatic approval** follows the Phase 2 rule. SponsorX approves on its own only when the best substitute:
  - passes all three checks;
  - covers at least 90% of the shortfall;
  - costs BTG no more than the shortfall is worth;
  - involves no minor, school or age-gated category.

  Otherwise the shortfall is held with the reasons.
- **Two safety conditions proposed during the build, approved by the user on 2026-10-15** (noted in the code, `SponsorX-Make-Goods.md` §6 and the plan, at the user's request):
  - **at least 80% of the flight gone,** matching the forecast's "reserve make-good" action, so a slow start that would recover doesn't spend BTG's inventory;
  - **a verified estimate:** the athlete's verified history, or a benchmark of 10 or more orders, so a self-reported view count can't make a substitute look as if it covers the gap.

  Both bind only the automatic approval. A person can approve any passing substitute at any time.

**Built:**
- **`makegood-rules.ts`** (pure): the window; one unit's estimate (verified history, then profile, then benchmark; none for redemptions); units from 1 to 10 within stock and package rules; equivalency (smaller over larger); target misses; options shown (up to 5 passing plus 2 closer near-misses); the automatic decision with the held reasons in words.
- **`makegood-engine.ts`:**
  - **nightly `runMakeGoods`,** after the forecasts:
    - opens or refreshes a shortfall for each at-risk campaign that is projected short and past 20% of its flight;
    - closes it when the campaign is on track or cancelled;
    - never opens a second one after an approval.
  - **substitutes:** the match engine's `gatherCandidates` and `filterCandidate` (now exported), then `checkInventoryItem` for the 20 closest;
  - **approval, by a person or automatic, in one transaction:**
    1. a live re-check under `lockItems`;
    2. `InventoryCommitment` with source `MAKE_GOOD`;
    3. the decision recorded;
    4. an audit entry: `makeGood.approve` / `makeGood.autoApprove` (null actor).
  - **reads:** `makeGoodList` and `campaignMakeGoods`.
- **Migration `20261015090000_make_goods`:**
  - `MakeGoodShortfall` and `MakeGoodOption`;
  - a partial unique index: one OPEN per campaign;
  - the trigger `makegood_decided_is_final`: a decided shortfall and its options refuse update and delete, except a purge delete in a test database.
- **Endpoints:** `GET /intelligence/make-goods` and `POST /intelligence/make-goods/{id}/approve`.
  - Errors: 409 (fails a check, or already decided), 404, 422 (note under 8 characters).
  - `makeGoods` is added to `GET /campaigns/{id}` and the forecast detail for those who can read `makeGood`.
- **Permission `makeGood`** (RBAC §31): SUPER_ADMIN, BTG_ADMIN and CAMPAIGN_MGR read and approve; no write; Sales denied. Matrix digest `e05782e25f86994e`.
- **Worker chain:** fact check → benchmarks → snapshots → prices → forecasts → make-goods. By hand: `npm run makegoods:refresh`.
- **`tests/makegood.test.ts`** (16 tests, prefix `mgd_`):
  - B (90% gone) is approved automatically with Ava's set: 4 × 4,000 = 16,000 against 15,000 short, $200 under the $3,000 value.
  - E and F (50% gone) are held.
  - Ben's reel is refused live after an offer took it.
  - A person approves Ava's set for E.
  - The trigger refuses an edit.
  - F recovers the next night and closes.
  - Sales, sponsors, athletes and Finance are refused, and another tenant gets a 404.
- **Also updated:** the tenant-isolation sweep (a seeded tenant-A shortfall and the approve body), `authz.coverage`, the `campaigns.list` fake database, the OpenAPI registry, RBAC §31, the Phase 3 plan (Code review with Delivered lines), the screen contracts and `SponsorX-Make-Goods.md`.
- **Checks:** every CI step passed locally: security, both builds, lint, backend 211 files / 3,313 tests (no skips), web 140 / 1,531. The browser tests weren't run locally, and nothing in the frontend changed.
- **Tracker:** Phase 3 rows 26–27 → Code review, Owner rcfworks, Started 2026-10-15, with Notes.
- **Commit:** held locally until #216 (the CI change) merges, so 3S5 goes up as its own PR.

## rcfworks — 3S5 deployed (release 8baa13a)

- **PRs merged:** #216 (CI), #217 (3S5) and the sync #218 into `main`.
- **First deploy dispatch (04:59 UTC):** refused, correctly. It ran before `main`'s CI finished: "0 of 2" checks green.
- **The deploy command is now Claude's:** the user added `Bash(gh workflow run deploy-daily.yml --ref main)` to `.claude/settings.local.json`. The classifier blocks Claude starting a production deploy or editing its own permissions.
- **Second dispatch (after CI went green):** moved `release` to `8baa13a`. Staging and production are deploying.
- **Staging checks:**
  - The pre-deploy step applied `20261015090000_make_goods`.
  - The API is listening and the worker started.
  - `/health` returns 200.
- **Production:** not read from here (the classifier blocks production reads).
- **Tonight's 19:00 UTC chain** includes make-goods for the first time. Expect 0 shortfalls until campaigns are active.

## rcfworks — Code review rows checked and closed

**Moved to Done:** the user's 22 Phase 3 rows. Each "Done when" was checked against its tests (green in the full run) and is live in staging and production. The ones that depend on an environment were confirmed from the logs:
- **3S1-OPS-03:** the two logins were applied in both environments;
- **3S1-OPS-04:** history filled in both, the check passed, and a second run added nothing;
- **3S1-QA-01, 3S1-DATA-03, 3S2-BE-01:** the nightly chain ran.

**Updated:** tracker rows (Status Done, Date Done 2026-10-15, a note), and the plan entries (◑ → ✅).
- **Not moved:**
  - **4S0-ART-01**, the user's design task: 10 of the 12 screens exist. *Virtual campaign extension* and *virtual pricing* are still missing.
  - **HeckerCreatives' four rows** (P1-ART-22…25): theirs to close.

## rcfworks — 3S7-BE-02 · sponsor and property hubs (Code review)

**Decisions (user, 2026-10-15):**
- "Sales matched" and "sales likely" are 0 until 3S6 partner-store data exists.
- Estimated media value = verified views × the tenant's benchmark median per 1,000, labelled an estimate.
- No audience segments without a real source.
- Renewal advice at the forecast's thresholds: renew ≥ 80%, renew with changes ≥ 50%, let it end below.

**Built:**
- **`sponsor-intelligence.ts`** (`GET /intelligence/sponsor?range`):
  - **Scope:** the caller's own org only.
  - **Sources:** ledger summaries, REDEEM events, the benchmark and the latest forecasts.
  - **Formats:** NIL jobs mapped to inventory kinds.
  - **Partners:** athletes (delivery and reach) and properties (fulfilled share of paid lines).
  - **Renewals:** campaigns ending within 45 days or ended within 30.
- **`property-intelligence.ts`** (`GET /intelligence/property`):
  - **Scope:** the caller's own property only.
  - **Inventory:** its own items plus its roster's.
  - **Shows:**
    - the roster's latest suggested prices, with the top three factors;
    - opportunity (unsold in 12 months, estimated);
    - sell-through per format;
    - category fit (restricted categories, and age-gated ones for a school, fit 0 with the reason);
    - quality (complete / on sale / fulfilled).
- **Permissions** `sponsorIntelligence` (SPONSOR_ADMIN and SPONSOR_ANALYST, own-sponsor) and `propertyIntelligence` (PROPERTY_MGR, own-property): RBAC §32, matrix digest `dc3c5d517b67a709`.
- **`tests/hub-intelligence.test.ts`** (9 tests, prefix `hbi_`):
  - figures worked by hand: $300 media value from 15,000 views at $20, $50 a redemption, partner scores 1 / 1 / 0.75, renewals RENEW 90% and LET_END 40%, school quality 67;
  - a rival sponsor and another tenant see only their own;
  - another property sees only its own;
  - every other role is refused.
- **Docs:** `SponsorX-Hub-Intelligence.md`, RBAC §32, the plan (Code review with a Delivered line), the screen contracts (mounted).
- **Checks:** every CI step passed locally: backend 212 files / 3,322 tests (no skips), web 140 / 1,531, lint, both builds, security.
- **Tracker:** Phase 3 row 56 → Code review.

## rcfworks — 3S7-BE-02 deployed (release e392870)

- #219 and the sync #220 merged.
- `main`'s CI went green, and Claude started the deploy itself under the new allow rule. `release` moved to `e392870`; staging and production are deploying. No migration.

## rcfworks — 3S7-BE-01, 3S7-INT-01, 3S8-DATA-01 (Code review, one PR)

**Decisions (user, 2026-10-15):**
- **Planner revenue:** the budget, reduced when the likely delivery falls short (the cost of a make-good).
- **Zoho fields:** created in the sandbox first, and production only with the user's OK.
- **"Exclude from reporting":** records the decision and flags the figure for now; taking flagged figures out of reports is a later task.
- **"Remember automation priority for BTG admin":**
  - anomalies decide the clear-cut case themselves (a duplicate post is excluded automatically, and a person may replace that);
  - Zoho updates queue nightly with no button.

**3S7-BE-01 · scenario planner:**
- **Rules** (`scenario-rules.ts`):
  - posts bought = budget share ÷ the format's price (tenant median booked, else the catalogue midpoint);
  - expected views = posts × the audience's verified views per post (p25 / median / p75 from snapshots; the whole network below 3 matches);
  - sold = budget ÷ CPM × 1,000, and the chance of delivering it is a normal approximation from the quartile spread;
  - revenue = budget × min(1, likely ÷ sold).
- **Formats:** social posts and videos only (those it can price and measure).
- **Endpoints:** `GET /intelligence/scenarios`, `POST …/calculate` (stores nothing) and `POST /intelligence/scenarios` (a `Scenario` row with its stamp).
- **Permission:** `scenario` (RBAC §33).
- **Tests:** `tests/scenarios.test.ts`, 8.

**3S7-INT-01 · intelligence into Zoho:**
- **Shared logic:** `renewal-advice.ts` holds the renewal advice for both the hub and Zoho. It takes its database client, so the worker's Zoho job module loads no global client; `tests/zoho-client.test.ts` caught that.
- **What is sent:** `zoho-intelligence.ts` sends `SponsorX_Renewal_Score` (0–100) and `SponsorX_Next_Action`, from the soonest campaign still to end (else the most recently ended).
- **Nightly:** `queueZohoIntelligence` queues only sponsors in Zoho whose hash changed (`Sponsor.zohoIntelHash`), and only when Zoho is configured.
- **Job:** `zoho.pushIntelligence` is wired into the outbox job names, NEEDS_ZOHO_CRM and the worker.
- **Fields script:** `scripts/zoho-intel-fields.mts` (`npm run zoho:intel-fields`) checks, or with `--create` adds, the two fields. Production also needs `--confirm-production`.
- **Still to do:** run it on staging (the sandbox token) after the deploy, then production with the user's OK.
- **Tests:** `tests/zoho-intelligence.test.ts`, 3, against FakeZoho.

**3S8-DATA-01 · anomaly detection:**
- **Rules** (`anomaly-rules.ts`), seven: spike 5× the trailing median (≥1,000 views, ≥3 earlier days), duplicate post URL, 30 clicks in a minute, 10 redemptions in 5 minutes, one fan 3 times, hand-entered 3× the API's figure, and engagements > views.
- **Engine** (`anomaly-engine.ts`): nightly over 30 days, after make-goods. Flags are unique by fingerprint. The duplicate is auto-excluded and audited as `anomaly.autoDispose`.
- **Endpoints:** `GET /intelligence/anomalies` (with `AnomalyScan` for "as of") and `POST …/{id}/disposition`: a note is required, a person's decision is final, and a person may replace an automatic one.
- **Permission:** `anomaly` (RBAC §34).
- **Tests:** `tests/anomalies.test.ts`, 9. All seven seeded patterns are flagged once.

**Shared:**
- migration `20261015150000_scenarios_anomalies_zoho_intel`;
- worker chain: … → make-goods → anomalies → the Zoho intelligence queue;
- matrix digest `22f65ea6071c590b`;
- tenant-isolation sweep: a seeded tenant-A flag and the new bodies;
- authz.coverage;
- OpenAPI registry;
- docs: `SponsorX-Scenarios.md`, `SponsorX-Anomalies.md`, Field Mapping §12.3, RBAC §33–34, the plan (Code review) and the screen contracts.

**Checks:** every CI step passed locally: security, both builds, lint, backend 215 files / 3,345 tests (no skips), web 140 / 1,531.

**CI fix on #221.** `tests/fan-pii.test.ts` forbids putting a fan's email in a raw SELECT on `RewardEvent`, and the repeat-fan rule had selected it.
- **Why the local run missed it:** the test scans only git-tracked files, and the new file wasn't added yet.
- **The fix:** fans are now grouped in the database (`GROUP BY lower(trim("fanEmail"))`), returning only the count and the first redemption's id and time. The address never leaves the database. The flag's evidence is "Times one fan redeemed" and "Their first redemption"; the masked email is gone.
- **Checks:** re-run with every file tracked: backend 215 / 3,345 and web 140 / 1,531, both green.

## rcfworks — P2-OPS-08 dropped (user decision)

- **Decision:** the user asked for "PR environments" (a temporary copy of the app per pull request) to be deleted: "its not worth doing".
- **Recorded as Dropped,** in the tracker (Phase 1) and the plan, with the reasons:
  - CI already runs the full suite on a fresh database for every PR;
  - the team is two people;
  - it would cost Railway money.
- **Not physically removed:** deleting a row would throw off the Dashboard's ranges and counts.
- **Nothing depended on it** (Unblocks 0).
- **Phase 1 backend left:** two-step login and production keys (waiting for launch by decision), the sign-off and UAT (end of phase), the first NEXT edition sale (a business milestone), and HeckerCreatives' two.

## rcfworks — 3S0-PMO-02, 3S8-BE-01, 3S8-OPS-01 (Code review, one PR)

**Asked:** "lets do next 3 backend task … for phase 3". Only 3S9-QA-02 could start; the rest waited on 3S0-PMO-02. The user approved drafting the policy and building the registry and flags.

**3S0-PMO-02 · governance policy:** `documentation/SponsorX-Model-Governance.md`, drafted for the owner's approval.

**3S8-BE-01 · model registry:**
- **Settings:** `model-registry.ts` (`MODEL_DEFS`, the safe ranges, `activeModel`).
- **Admin:** `model-admin.ts`:
  - the desk;
  - `changeSettings`: inside the ranges it auto-validates and activates (`model.autoActivate`, null actor); outside, it is held as a draft;
  - `validateVersion`: a second person, never the proposer;
  - `activateVersion`;
  - `rollbackModel`;
  - `setFlag`.
- **The built-in version** is stored on the first change, so it can be rolled back to.
- **Engines wired to their tenant's active settings and stamp:**

  | Engine | Settings it reads |
  |---|---|
  | Pricing | `maxFactor`, `maxTotal` |
  | Matching | lookback; a run made with other settings is re-ranked |
  | Forecast | `riskWith`, `alertMove`, `forecastFlow`'s trust share |
  | Make-goods | auto rules, window days |
  | Anomalies | every threshold |

- **`riskOf(p)` keeps its one-argument shape,** because `tests/forecast.test.ts` maps over it. The settings version is `riskWith`.

**3S8-OPS-01 · feature flags:**
- **Nine features.** The `FeatureFlag` table holds them, and no row means on.
- **Off:**
  - the nightly runs skip the tenant (`tenantsWithout`);
  - reads and writes answer 403 `feature_off` (`assertFeature`);
  - the campaign and forecast details return no make-goods.

**Shared:**
- migration `20261015190000_model_registry_flags`, with one active version per tenant and model (a partial unique index);
- matrix digest `4f8aa9696f132aa2`, RBAC §35;
- the tenant-isolation sweep: a seeded tenant-A validated version. The settings PATCH is exempted from the "names tenant A" rule, because `{key}` is an engine name and tenant B changing its own settings is correct; the leak check still applies;
- the `campaigns.list` fake gains `featureFlag`;
- `tests/model-registry.test.ts`, 7: built-ins; an auto change that the forecast uses and stamps; a held change, the second person, activation; rollback and compare; refusals; a switch off and on; who.

## rcfworks — six Phase 3 tasks moved to Done

- **The user's standing rule:** "when acceptance criteria passed, move it to done". Saved to memory. From now on this happens right after a merge, without waiting to be asked.
- **Moved to Done:** 3S7-BE-02, 3S7-BE-01, 3S8-DATA-01, 3S0-PMO-02, 3S8-BE-01, 3S8-OPS-01. All are merged to `main` (#221 and #223, via #222), their acceptance is met and their tests are green. Tracker and plan both updated.
- **Stays in Code review: 3S7-INT-01.** Its clause, "Zoho shows renewal score and next action on the sponsor record", needs the two Account fields created (sandbox, then production with the owner's OK) and a push to land.

## rcfworks — CI: the four phase plans join the quick pass

- **Why:** the user asked why a tracker-only PR (#224) still ran the full tests.
- **Cause:** it touched the Phase 3 plan, under `documentation/`, which was left out of the docs-only skip because tests read some documents there.
- **Checked:** no test opens the four phase plan files; the only mention is in a comment.
- **Changed:** `.github/workflows/ci.yml` now also skips the build and tests when every file is the log, the tracker, the graph or one of exactly `SponsorX-Phase1-Managed-Marketplace.md`, `SponsorX-Phase2-Marketplace-Commerce.md`, `SponsorX-Phase3-Intelligence-Attribution.md` or `SponsorX-Phase4-INFINEX-Integration.md`.
  - A first, looser pattern (`SponsorX-Phase[1-4]-*`) also matched the screen contracts and the ledger design (a test mentions that one), so it was tightened to the exact names.
- **Tested on samples:** the #224 shape and each plan file skip; the screen contracts, ledger design, payment policy, RBAC matrix, plan + code, and a lookalike all run in full.
- **Held locally** until #224 merges, so #224 stays a pure tracker PR.

## rcfworks — deploy fb37c17 and the Zoho sandbox fields

- **Deploy:** `main` went green on `fb37c17` (#222 with #221 and #223). Claude started the deploy, and `release` moved to `fb37c17`.
- **Staging:** both migrations applied (`…150000_scenarios_anomalies_zoho_intel`, `…190000_model_registry_flags`); the API is listening; `/health` returns 200.
- **Zoho sandbox (through staging):**
  - `npm run zoho:intel-fields -- --create` was refused with INVALID_DATA for both fields.
  - A one-off diagnostic call meant to read the error **created `SponsorX_Renewal_Score`**. That was the intended place (the sandbox), but the call was not the read-only check it was described as, and the user was told.
  - The cause was the tooltip object. `SponsorX_Next_Action` was then created the same way.
  - **Confirmed:** `SponsorX_Renewal_Score:integer` and `SponsorX_Next_Action:text`.
  - The script drops the tooltips and prints Zoho's details on a refusal. That fix is committed with the CI change.
- **Still to do:** **production** Zoho, with the user's OK. 3S7-INT-01 stays in Code review until then and until a push lands.

## rcfworks — deploy e6ce2f1; production Zoho fields wait for go-live

- **Deploy:** #226 (the sync of #224 and #225) merged; `main` went green; Claude deployed. `release` moved to `e6ce2f1`, and production's api was SUCCESS at 17:10 (+08).
- **The user ran the production fields command:** `npm run zoho:intel-fields -- --create --confirm-production`. It stopped with `ZohoNotConfiguredError`: production has no Zoho keys, which is deliberate until go-live (P2-OPS-04). Nothing changed.
- **Recorded on P2-OPS-04's tracker row:** run the fields command when the production Zoho keys are set.
- **3S7-INT-01:** stays in Code review. It goes to Done when tonight's staging run lands the score and next action on a sandbox sponsor's Account (to check tomorrow).

## rcfworks — 3S0-PMO-01, 3S9-QA-01, 3S9-QA-02 (Code review, one PR)

**3S0-PMO-01 · attribution claims:** `documentation/SponsorX-Attribution-Claims.md`, drafted for the owner's approval.
- It defines the four classes, with the evidence, money and confidence of each.
- It sets the words each class may and must never use, and that the classes are never summed (no ROI from modelled or estimated figures).
- It maps each class to its provenance, and requires zero rather than a guess.
- The legal review follows as `3S0-LEG-01`. This unblocks `3S6-BE-01`.

**3S9-QA-02 · benchmark validation (`benchmark-validation.ts`):**
- **`checkBenchmark`:** a benchmark fails if inconsistent, stale (over 2 days), small (under 10 orders) or too spread (over 4×), with every reason.
- **`reconciliationVerdict`:** a pure function over the nightly fact check. The tolerance is exact and the check must be under 2 days old. It is pure so tests never write the platform-wide `FactCheckRun`.
- **Where it shows:** the models screen (`benchmarkValidation`), the nightly log after benchmarks, and `npm run benchmarks:validate`.

**3S9-QA-01 · backtests (`backtest-rules.ts`, pure):**
- **Scoring:** `scoreForecasts` (error, within 10%, second half, Brier, calibration bands) and `scorePricing` (error, within 20%, confidence bands).
- **Simulation:** `simulateForecastHistory` is seeded (mulberry32) over 300 campaigns at ¼, ½ and ¾.
- **Engine** (`backtest-engine.ts`): real forecast history (ended campaigns, against the last pacing) and real pricing history (orders against the latest suggestion on or before booking), per version stamp. Runs are stored as `BacktestRun`, nightly after anomalies; with `--simulate`, a simulated run is stored and marked.
- **On the models screen:** each version shows its latest backtest, real before simulated.
- **Simulated result for forecast 1.0.0:**
  - **Projection:** error 10.8% overall, 4.7% at ¾.
  - **Probability:** overconfident early. At ¼, 95% given became 74% reached and 5% given became 22% reached. At ¾ it is calibrated (96% / 97%).
  - **`fullTrustElapsed` 0.45:** improves the error (10.8% → 9.4%) but not the overconfidence.
  - **Recommendations** are documented for the owner: the settings change, or a new forecast version with a wider early spread.
- **Tests:** `tests/backtest.test.ts`, 8, every figure by hand.
- **Shared:** migration `20261015220000_backtest_runs`; authz.coverage maps BacktestRun to `modelRegistry`; docs `SponsorX-Backtest.md` and the plan entries (Code review).
## HeckerCreatives — 3S2-FE-01, 3S3-FE-01, 3S4-FE-01: wired to the engines that landed 2026-10-14, walked live

Branch `feature/3S1-FE-01-P1-ART-26-27`, after pulling `main` (13 commits: 3S2 pricing, 3S3 matching, 3S4 forecasting) and `main_development` (close of day 10-14). Local: the four new migrations applied, Prisma client regenerated, API + worker on :4000 from `npm start`.

**The wire shapes matched the proposals** (`documentation/SponsorX-Phase3-Screen-Contracts.md`), so the three screens read their engines with no shape change. What did change:

- **Match explorer — Sales reads, doesn't save** (rcfworks' note: `briefMatch` write is BTG admins, campaign and network managers; the API answers Sales' save with 403). `lib/match-explorer-live.ts` has `SHORTLIST_SAVE_ROLES` / `canSaveShortlist`; the page reads the viewer's roles (`fetchActor`) and for Sales the island shows the ranking and the saved shortlist with no picks, no Save and no "Add to shortlist" in the drawer — a sentence says who saves.
- **Sponsor brief drawer sends the match engine's inputs** (3S3-BE-01): `excludedCategories`, `channels`, `audienceTiers`, `audienceMinFollowers`. `lib/brief-request.ts` mirrors the backend's `MATCH_CHANNELS` / `AUDIENCE_TIERS`; the single "Preferred tier" pick is now the `audienceTiers` column (a tier the API doesn't know still travels in the objective); the sponsor's own category can't be one to avoid (refused in the mapper, disabled in the chips); "10k" / "1.5m" read as counts. The backend's `brief-contract.test.ts` still parses the mapper's output (6/6 against `sponsorx_test`).
- **Forecast guarantee** — the engine has one write the proposal didn't: `PUT /intelligence/forecasts/:campaignId/guarantee`. Without it no campaign could ever be promised anything but "every deliverable booked", so the detail page got a Guarantee card (`components/forecast-guarantee-form.tsx`, `forecasts/actions.ts`, `writeEngine` learned PUT). BTG admins and campaign managers set it (`canSetGuarantee`); Sales sees it locked. The form says the forecast is nightly, so a new guarantee shows from the next run — it doesn't pretend the page re-paced.
- `lib/intelligence.ts`: the sponsor/property hub registry no longer says "warehouse" (the reads will come from the fact ledger's summaries, 3S7-BE-02); header notes the three engines landed.
- Docs: the three sections of the screen contracts record "landed", the Sales change, the guarantee write, and each detail route's 404 code.

**QA (live, dev server, 2026-10-15).** Data: `features:snapshot` (14 athletes), `pricing:refresh` (16 items — after giving `seed_ath_adult` a verified Instagram row `qa_p3walk_social_1`, 32k followers / 12k views, since v1 needs an audience to imply a CPM and no benchmarks exist locally; kept), `forecasts:refresh` (2 active campaigns, one at-risk alert). A temporary Playwright spec on `e2e/support/auth.ts` `pageAs` as `qa7-admin` (BTG_ADMIN) and `qa7-sales` (SALES), chromium + Pixel 7:
- pricing desk + `?view=low`, detail (factors add up, range, override saved → "Override records · 1", recommendation unchanged);
- match explorer: live pill `match-rules@2.0.0`, 13 ranked athletes / 2 filtered out, drawer, shortlist saved, property and inventory tabs;
- forecasts: 2 campaigns, at-risk row, detail with pacing chart + alert; guarantee set to 50k impressions then cleared back to the default;
- Sales: no picks / no Save / drawer without "Add to shortlist"; override and guarantee locked with the sentence;
- 13/13 checks, 0 console errors, 0 page errors, 0 5xx, 0 horizontal overflow; screenshots reviewed by eye (desktop + phone). Walk rows deleted afterwards (override, shortlist); the spec deleted.
- Two harness traps, not product bugs: Playwright's `toBeDisabled` on a `<fieldset disabled>` reports "enabled" (assert the Save button); in dev the `<nextjs-portal>` badge sits over a body-portalled drawer's Close button at 1280px (close with Escape).

**Verified:** frontend vitest **140 files / 1,541 tests**, `tsc` clean, `eslint --max-warnings=0` clean on the touched files, `next build` green (46 routes). Not committed yet — the branch also carries the owner's uncommitted inventory/settings work.

**Tracker:** the three rows stay Done; their notes record the walk. Stage Progress: the 2026-10-15 row is appended, unchanged from the 14th (no Phase 1 task moved today).

**Still for the engines' owner:** nothing blocking. The pricing desk is all "25% · low confidence" locally because there are no benchmarks (3S1-DATA-03 needs daily summaries); that's the engine being honest, not the screen.

## HeckerCreatives — QA pass on the Phase 3 engines (API + screens) and the brief's new fields

Scope: what landed 2026-10-14/15 — 3S2 pricing, 3S3 matching, 3S4 forecasting (API and admin screens), the sponsor brief drawer's four new fields, and the roles around them. Local stack (API :4000, `next dev` :3000, Docker Postgres).

**Automated suites.** Backend: **3,277 passed, 6 failed, 12 skipped** against `sponsorx_test` — all six are this machine, not the code: `spawnSync npx ENOENT` (db-logins, sql-rules-in-migrations: Windows wants `npx.cmd`), backslash paths and CRLF in three static assertions (payments-pii ×2, security-hardening), the warehouse-boundary test reading `new URL(root, import.meta.url).pathname` → `D:\D:\iCARRe%20Solutions\…` on Windows (`backend/tests/warehouse-boundary.test.ts:30`; `fileURLToPath` would fix it), and the match-engine timing test at 2,259 ms against its 2,000 ms budget on this laptop (CI passed it). Frontend: 140 files / 1,541 tests. Build green.

**API probes** (a temporary Playwright spec calling :4000 with real Clerk sessions as BTG admin, Sales, campaign manager, network manager, a sponsor, and a BTG admin re-pointed to `e2e_fan_tenant` for the run and restored): 77 calls, every expectation met —
- pricing: desk pages and clamps (`size=1000` → 100, `page=0`/`999` → 200), bogus `view` ignored; detail/override of an unknown id → 404 `not_priced`; override reason <10 / >500 / blank → 422 `override_reason`; `cpmCents` 0 / 1.5 / "500" / extra key → 400; Sales and campaign managers → 403 (campaign manager's detail says `canOverride: false`); network manager, sponsor → 403 on read; other tenant sees 0 items and 404 on BTG's item and recommendation.
- matching: `kind=bogus` → 400; unknown brief → 404 `brief_not_found`; page 999 → empty page; shortlist of an unranked id → 422 `shortlist_entry`, 101 ids / non-array / extra key / `{}` → 400, duplicates collapse to one; network and campaign managers save, Sales 403, sponsor 403, other tenant 404; empty list clears.
- forecasts: `risk=bogus` → 400; ended-without-forecast and unknown campaign → 404 `forecast_not_found`; guarantee with no value → 422 `guarantee`, value 0 / 1.5 / unknown metric / extra key / `{}` → 400; campaign manager sets, Sales and network manager 403; other tenant 404; `{metric:null,value:5}` clears (value ignored).
- briefs (as the sponsor): wanted+excluded category → 422 `category_wanted_and_excluded` on POST and on both sides of a DRAFT PATCH; bad channel / tier / excluded category, negative or fractional `audienceMinFollowers` → 400; a valid brief echoes all four fields on GET for the sponsor and for BTG.

**Screen probes** (BTG admin, campaign manager, sponsor; desktop): override form refuses "abc", the recommendation itself, a short reason, >$10,000 and negatives in sentences, accepts "1,234.56"; bogus pricing item → absent state; hostile query string (`q=<script>&view=bogus&page=-1&size=abc`) → the filtered-empty state, no error; matching with `?brief=nope&kind=bogus` falls back to the first brief and Athletes; a 2-pick shortlist survives reload and the kind tabs, clears with "Clear saved shortlist"; second (QUALIFIED) brief ranks; forecast `?tab=bogus` → All; bogus campaign → absent state; guarantee form refuses blank / 0 / 3,000,000,000, the default disables the count; campaign manager saves shortlists and guarantees but is locked out of the override; the sponsor's drawer sends tiers, channels, "10k" and the category to avoid — the sponsor's own category is disabled in the "avoid" chips — and the brief in the DB carried `{ALCOHOL} {TIKTOK,IN_PERSON} {CREATOR,ANCHOR} 10000`. 0 console errors, 0 page errors, 0 5xx across the pass. Every row the probes made was deleted (3 overrides, 2 briefs, the auto-created DRAFT campaign and its `AdSaleHold`, the shortlist); the guarantees are back to the default; the borrowed identity is back in the BTG tenant.

**Findings** (nothing blocking):
1. **Medium · backend** — `PricingOverrideInput.cpmCents` has no upper bound (`backend/src/contracts/intelligence.ts:14`): 2,000,000,000 cents ($20,000,000 CPM) is accepted and stored. The screen stops at $10,000; the API should refuse a typo-sized price too.
2. **Medium · frontend** — BTG never sees the brief's four new fields. `GET /briefs/:id` returns `excludedCategories`, `channels`, `audienceTiers`, `audienceMinFollowers`, but the brief desk (`briefs-desk.tsx` shows sports · geography · category) and the Matching Studio don't read them, so a human qualifying or staffing by hand can't see what the sponsor asked to avoid. The engine honours them; the people don't know they exist.
3. **Low · backend** — a guarantee can be set on a campaign past its end date that is still ACTIVE (`qa_cmp_other`, ended 10-08): accepted, audited, never forecast. Harmless; a 409 or a "campaign has ended" message would be kinder. Related: nothing moves ACTIVE → REPORTING at the end date, so such campaigns sit in the forecast's query forever.
4. **Low · backend tests** — `warehouse-boundary.test.ts:30` builds the directory from `URL.pathname`, which breaks on Windows; the other five Windows failures are the known ones (now six in total with the timing test's margin).
5. **Info** — `GET /intelligence/pricing?view=bogus` is silently "all" while `matches?kind=bogus` is 400; harmless inconsistency.
6. **Info** — a brief filed from the sponsor's drawer with every safety check passing is approved on the spot and becomes a DRAFT campaign with an `AdSaleHold` (P4-BE-11 as designed); cleanup of QA briefs has to follow that chain.

## HeckerCreatives — the QA findings, fixed

All five, verified live against the restarted API and the dev server, then build + suites:

1. **Override ceiling** — `OVERRIDE_MAX_CENTS = 1_000_000` ($10,000 CPM) in `backend/src/domain/pricing-engine.ts`; `PricingOverrideInput.cpmCents` is `.max()`ed on it (`contracts/intelligence.ts`). $20,000,000 and one cent over the ceiling → 400. Contract tests appended to `tests/pricing-engine.test.ts`.
2. **BTG sees the sponsor's asks** — `briefAsks` / `briefAsksLine` in `frontend/src/lib/matching-live.ts` turn `audienceTiers`, `channels`, `audienceMinFollowers`, `excludedCategories` into one line ("Creator or Premium tiers · TikTok, Instagram · 5,000+ followers · avoid Alcohol"); both `ApiBrief` types carry the four fields (optional, for an older answer). Shown as **Sponsor asks** in the brief desk's detail panel (`briefs-desk.tsx`, `BriefRow.asks`), as a full-width row in the Matching Studio header (`matching-studio.tsx`, `MatchBrief.asks` — a tile truncated it) and as a line above the explorer's ranking (`matching/page.tsx`). Tests in `tests/matching-live.test.ts`. Walked with real asks set on `qa_brf_match` (reverted after).
3. **No guarantee after the end date** — `setGuarantee` reads `endDate` and refuses with 422 `guarantee` "This campaign ended on …" (`forecast-engine.ts`, `now` parameter for tests; `forecast.test.ts` seeds and removes `fo_Z`). Live: `qa_cmp_other` → 422. Not changed: nothing moves a campaign out of ACTIVE at its end date — that is a lifecycle decision for the campaign state machine, not a forecast bug.
4. **`warehouse-boundary.test.ts`** — `fileURLToPath(new URL(…))` instead of `.pathname`; passes on Windows now. The other Windows-only failures (backslash paths, CRLF, `spawnSync npx`) are unchanged.
5. **Unknown `?view`** — `PricingDeskQuery` (zod) on the desk route; `view=bogus` → 400 like `kind`/`risk`; the screen's `pricingView()` already sanitised, so nothing visible changed.

**Verified:** backend `pricing-engine`, `forecast`, `warehouse-boundary`, `openapi.coverage`, `tenant-isolation` — 53/53; backend `tsc` + eslint clean. Frontend **140 files / 1,543 tests**, `tsc` + eslint clean, `next build` exit 0. Live re-probe (temporary spec, deleted): 400 / 400 / 422 as above, and "asks" visible on all three screens, 0 page errors, 0 5xx. Contract doc updated in the three sections; tracker notes on 3S2-BE-03, 3S3-BE-01, 3S4-BE-01. The QA brief's temporary asks were reverted; guarantees back to the default. Still uncommitted.

## HeckerCreatives — QA round two (after the fixes)

**Suites.** Backend full run: **3,282 passed, 3 failed, 12 skipped** — the three are the known Windows-only static assertions (payments-pii ×2, security-hardening); the warehouse-boundary, db-logins/sql-rules and timing failures from round one are gone (fix, and the suite ran without those two needing `npx` this time). Frontend 140 / 1,543 green, build green (from the fixes pass).

**Regression on the five fixes** (API, real sessions): $20M override → 400, the $10,000 ceiling itself → 201; `view=bogus` → 400; guarantee on the ended campaign → 422; "Sponsor asks" visible on the brief desk, the Studio header and the explorer — desktop and Pixel 7, no overflow, wraps cleanly on the phone.

**Wider.** Reason boundaries (10 chars 201, 9 chars 422, emoji and 500 × "é" 201, 501 422); pricing pages of 5 cover all 16 items exactly once, page 5 empty; `matches?size=1&page=2` is rank 2, `size=0` → 12, `page=-1` → 1; guarantee 2,000,000,000 → 200, +1 → 400. Briefs: objective 2,000 chars 201 / 2,001 400, emoji + tags 201, `audienceMinFollowers` INT4 max 201 / +1 400, 26 exclusions 400, negative budget 400, end before start 422 `InvalidBriefWindowError`. Roles: network manager reads matches (200) and is 403 on pricing and forecasts; Finance 403 on all three; on the screens the network manager sees "This desk is for…" on pricing and forecasts, Finance is forwarded to `/finance`, a sponsor never lands under `/admin` and the sponsor hub shows the plain sentence with no task ids. Keyboard: the explorer drawer traps Tab (25 presses stay inside), Escape closes and focus returns to the "Why" button; in the sponsor's drawer Space toggles a chip's `aria-pressed`, Escape closes. Double-click on Save override saved exactly one record (the fieldset is disabled while pending). Repo e2e: `admin-lists-paged` (brief desk) 12/12; `loop-p4-matching` and `marketplace-path` could not start — they create new Clerk identities and the dev instance is at its 100-user cap (known, 2026-10-02).

**Findings.**
1. **Medium · policy/product** — a network manager can never use either matching desk. The RBAC matrix §29 gives `NETWORK_MGR` read **and write** on `briefMatch` (they save shortlists), and both `/admin/campaigns/match` and `/admin/intelligence/matching` admit the role — but `campaignBrief` read is BTG admins, Sales and campaign managers only ("all others — "), so `GET /briefs` answers 403 and both screens show "outside your role". The matrix contradicts itself; `policy.ts` implements it faithfully. Decision needed: grant `NETWORK_MGR` `campaignBrief` read (own-tenant) — my recommendation, since staffing a roster means reading the brief — or take the role off the two desks. Not changed: it is the matrix's call.
2. **Low** — after a successful override the form clears; a second Save pressed *after* the save completes (not a real double-click) replaces the success message with "Enter the CPM in dollars". Cosmetic.
3. **Info** — duplicated `channels` in a brief body are accepted as sent (the engine treats them as a set).

Every probe row deleted (4 DRAFT briefs, 5 overrides, the brief's temporary asks reverted, guarantee default, no shortlist). Spec deleted. Servers left running: API :4000, web :3000.

## HeckerCreatives — round two's findings, fixed

1. **Network managers read briefs** — `campaignBrief.NETWORK_MGR.read = own-tenant` in `backend/src/auth/policy.ts` (write/approve stay denied). The RBAC matrix's `campaignBrief` row now carries the role with a note; the authz digest in `tests/authz.matrix.test.ts` is updated (`51eb91aed060275f` → `b8f23bb67101a591`, one cell moved) with a named test. Live: the network manager lists and reads briefs (200), is refused PATCH and transition (403), ranks and saves a shortlist in the explorer, and the Matching Studio opens with the brief header. This was the matrix contradicting itself; resolved the way §29 already assumed.
2. **Stray second Save on the override form** — `submit()` ignores a form with nothing in it, so the success note stays (`pricing-override-form.tsx`). Live: a second click after a save leaves "Override saved" in place.
3. **Repeated list values in a brief body** are stored as a set (`uniq` in `domain/brief.ts`, create and patch); test added to `match-engine.test.ts`. Live: `["TIKTOK","TIKTOK","INSTAGRAM"]` → `["TIKTOK","INSTAGRAM"]`.

**Verified:** backend authz ×3, match-engine, brief-contract, tenant-isolation, openapi.coverage, sponsor-field-authz — 214/214; backend + frontend `tsc` and eslint clean; frontend suite below. Probe rows deleted, the brief's test asks reverted, the spec deleted. Contract doc and tracker (3S3-BE-01) note the change. Still uncommitted; API restarted on :4000 with the new policy, web on :3000.

## HeckerCreatives — QA round three (after round two's fixes)

**Suites.** Backend full run: 3,283 passed, 3 failed (the three known Windows-only static assertions), 12 skipped. Frontend 140 / 1,543 (unchanged this round).

**Regression.** Network manager lists and reads briefs (200), refused on edit (403); repeated `channels` / `audienceTiers` stored as a set; the override form keeps its success note after a stray second Save (round two). Round one's five fixes re-checked in passing (ceiling, `view`, ended-campaign guarantee, asks on three screens).

**New ground.**
- *Auth edges:* no token, a tampered token and a garbage token → 401 on all five engine routes (reads and writes), with no figures in the body; a sponsor reading another sponsor's brief is refused; its own is 200.
- *Concurrency:* 5 parallel shortlist saves → all 200, the stored shortlist is exactly one of the five sets; 3 parallel overrides → 3 × 201, three new records, the newest one in force on the desk; 2 parallel guarantee PUTs → both 200. Every override has its `pricing.override` audit row (5 of 5 joined); `match.shortlistSave` and `campaign.guaranteeSet` rows written for every save.
- *Latency (warm, local, 8 calls each incl. the token fetch):* pricing desk median 18 ms, matches 23 ms, forecasts 17 ms, forecast detail 23 ms.
- *Nightly jobs twice in a day:* `features:snapshot` 0 taken / 14 already, `pricing:refresh` 0 stored / 16 already, `forecasts:refresh` 0 made — idempotent.
- *Screens:* `?demo=loading|empty|error` still render on the three screens (skeleton, honest empty, error boundary); the five unbuilt engines still show `EnginePending` with their task ids; `?size=24` is honoured and the kind tabs keep `?size`; `q=Arena&view=above&page=2` shows items 13–16 of 16; `q=zzzz` the filtered-empty state; Enter submits both the override and the guarantee forms; the override form works at Pixel width (saved, no overflow); a property manager's hub says the plain sentence with no task ids and never reaches `/admin`.
- *OpenAPI:* the served spec carries the intelligence paths, `PricingOverrideInput` (with `maximum: 1000000`), `ShortlistInput`, `GuaranteeInput` and the matches/forecasts queries.

**Finding, fixed in the round:** the registry row for `GET /intelligence/pricing` did not name `PricingDeskQuery` (added this morning), so the desk's `view`/`q`/`page`/`size` were undocumented while the other engines' queries were. `contracts/registry.ts` now names it; the built document lists the four parameters. Coverage test 7/7, backend tsc + eslint clean. API restarted.

**Not a finding (noted):** the pager hides the "Showing…" range line on a single page by design; `?demo=error` throws to the error boundary as intended.

Probe rows deleted (5 overrides, 1 DRAFT brief, the shortlist), the guarantee back to the default, the property link on `e2e_u_qa9_pm` back to null; specs deleted. Nothing committed.

## HeckerCreatives — QA round four: production build and the benchmark-driven pricing path

- **Production build** (`next build` + `next start`): `?demo=sample` is dead on all three screens (live data, no banner); `?demo=error` reaches the admin error boundary with a reference code and no stack or source path; a bogus id is the absent state. The three console errors seen are the deliberate throw itself, logged once per `?demo=error` page — expected.
- **Benchmarks** seeded locally (ALL / SPORT Basketball / FORMAT SX-04 at 4 — under the minimum) and `SX-04` put on one item: the engine priced it from the sport benchmark (base $10.00, sample 12), +10% scarcity, lifted to the $36.50 creator floor with a "Sell floor" factor of +$25.50, 55% confidence; the detail page shows the range ("Basketball athletes, last 12 months"), the floor line, the factors adding up; the form refuses $30.00 "under the sell floor" in its own words; the API refuses one cent under (422 `override_below_floor`, the attempt audited) and accepts exactly the floor (201). A benchmark also let the item with no audience be priced (17, not 16). All seed undone and the day re-priced without benchmarks.
- Matching, forecasts, the brief desk and the sponsor drawer walked in production; 0 page errors, 0 5xx.
- **No findings.** Pushed to `main_development` and `main` after this entry (merge with rcfworks' day; see the commit).

**Merge with HeckerCreatives' work (#227/#228):** #230 conflicted with `main_development` after Ganielle's Phase 3 screen wiring landed.
- **Tracker:** resolved per the team rule. Took their copy and re-applied only my five changed rows (P2-OPS-04, 3S0-PMO-01, 3S7-INT-01, 3S9-QA-01, 3S9-QA-02). A row-by-row three-way comparison showed no row changed on both sides.
- **Today's log:** both sides kept.
- **Their backend changes merged cleanly:** NETWORK_MGR reads `campaignBrief` (digest `3d92c5837a1480f7`, built on mine), plus pricing and forecast test additions.
- **Checks:** the full CI set re-ran on the merged code and passed: backend 217 / 3,365 and web 140 / 1,543.
## HeckerCreatives — P1-ART-22's QA fixes committed; P1-ART-22…25 Done (owner's call)

The fixes logged on 2026-10-11 under "the QA findings fixed (still Code review, not yet committed)" — the Arena speed bar capped so it never crosses content, the last six native `<select>`s on athlete pages replaced by the house `Dropdown` (which gained `disabled` and a scrolling list), reactivation kept inside the portal — are committed today on top of the merged `main_development`, re-verified there (tsc, eslint, the full frontend suite, `next build`), and pushed through a PR to `main_development` and `main`. The 2026-10-05 design note for the dev Clerk-quota fallback (`docs/superpowers/specs/`) goes in with it.

**Tracker:** P1-ART-22, P1-ART-23, P1-ART-24 and P1-ART-25 move from Code review to **Done** (owner's call, 2026-10-15); today's Stage Progress row is corrected for the four. P8-QA-03 and P9-QA-01 stay In progress — nothing new was done on them today, and the edition e2e (P9-QA-01) still needs the Clerk cap cleared to run.
- **Second merge** (Ganielle's #229, P1-ART-22…25 Done): resolved the same way. Their tracker, my five rows re-applied, no row changed on both sides, both sides of the log kept. #229 is frontend-only; frontend build, tests and lint passed on the merged code.
- **A cache file blocked the merge:** the local `graphify-out/cache/last_query_stamp`, which holds only a timestamp. My copy was discarded for theirs.

## rcfworks — 3S0-PMO-01, 3S9-QA-01, 3S9-QA-02 to Done

- **#230 merged.** All three meet their acceptance:
  - 3S0-PMO-01: the definitions and reporting language are written;
  - 3S9-QA-01: backtests are documented with accuracy and calibration per model;
  - 3S9-QA-02: benchmarks are validated for sample size, and reconciliation is checked to an exact tolerance.
- **Updated:** the tracker and the plan.
- **The two policy documents (3S0-PMO-01, 3S0-PMO-02)** still await the owner's read; any change comes as an edit by PR.

## rcfworks — owner approvals (2026-10-15)

- **Approved, as written:**
  - `SponsorX-Attribution-Claims.md` (3S0-PMO-01), which unblocks 3S6;
  - `SponsorX-Model-Governance.md` (3S0-PMO-02).
- **`SponsorX-Backtest.md`:** recommendation 2 approved. That is a new forecast version with a wider early spread, backtested on the same simulated history before going live. The user's "1,2,3 approved" was read as the recommended option, and the user was told.
- **Recorded:** each document's header or recommendations section now says it was approved.

## rcfworks — forecast 2.0.0, 3S9-OPS-01, 3S6-BE-01 (Code review, one PR)

**Forecast 2.0.0** (owner-approved recommendation 2):
- **The change:** `forecastFlow` gains `paceUncertainty`, a second spread of rate × u × (share left) × days left, shared across the days left. Default 0 keeps 1.x exact for direct callers.
- **Built in:** `forecast-rules@2.0.0` with the setting `paceUncertainty` 0.6 (safe range 0.2–1).
- **Why 0.6:** the best Brier score on seed 20261015 (0.096) and on a held-out seed, 777 (0.099).
- **Result:** the early "95%" overconfidence is gone; the middle band is slightly cautious.
- **Tests updated:**
  - the `fo_B` probability is now 0.0001 (Φ(−3.75), worked out in the test);
  - the registry tests use 2.x;
  - the backtest fixtures use 2.0.0.

**3S9-OPS-01 · pipeline monitoring:**
- **Recording:** `pipeline-runs.ts` (`recordStep`, `runStep`). The worker chain was rewritten so every step is recorded, failures included, and the chain goes on.
- **Health check:** `/health/full` gains a `pipeline` check (`evaluatePipeline`). It fails on a failed step, 26 h without success, active campaigns without a forecast in 26 h, drift, or an unreadable record. It never fails off Railway, or before the first night.
- **Alerting** reuses the uptime monitor.
- **Tests:** `health-full.test.ts` (fake extended, 5 new cases, statement count 3) and `pipeline-runs.test.ts`.

**3S6-BE-01 · attribution adapters:**
- **Adapters:** `attribution-adapters.ts` (interface, registry rules, `generic-webhook-v1`).
- **Intake:** `attribution-intake.ts`:
  - a token is shown once and stored as SHA-256, compared in constant time;
  - an unknown partner and a wrong token get the same 401;
  - a partner or feature switched off gets 403;
  - every delivery is kept, a rejected one too.
- **Public route:** `routes/v1/attribution.ts`, rate-limited.
- **Permission:** `attribution` (RBAC §36, digest `0829d0ceec6d26d5`); the feature `attribution` is added to FEATURES.
- **Tests:** `attribution-framework.test.ts`. A second adapter (`flat-orders-v1`) is registered and used with no engine change.
- **Shared:**
  - migrations `20261016090000_pipeline_runs` and `20261016100000_attribution_framework`;
  - authz.coverage: AttributionPartner and AttributionDelivery mapped, PipelineRun platform-wide;
  - openapi coverage gains the `attribution` route file;
  - the tenant-isolation sweep has tenant A's partner;
  - docs: Attribution-Framework, Pipeline-Monitoring, Backtest §5, and the plan entries.

**Flaky test fixed (`tests/pmo02-claim-email.test.ts`):**
- **What happened:** sync #233's push run failed in three of that file's tests, although the PR run of the same commit had passed.
- **Cause:** the "tampered link" swapped the signature's last two characters for "AA". The last base64url character carries only 4 bits, so about one run in a thousand the "tampered" signature decoded to the same bytes and confirmed the claim; the next two tests then failed from it.
- **Fix:** the test now flips the signature's first character. The failed job on #233 was re-run, and the fix rides on #234.

## rcfworks — #233 and #234 merged; 3S6-BE-01 to Done

- **#233** (the sync of #229, #230 and #232) merged; `main` CI is running, then the deploy.
- **#234** (forecast 2.0.0, 3S9-OPS-01, 3S6-BE-01, the flaky-test fix) merged into `main_development`.
- **3S6-BE-01 → Done:** its acceptance is proven by the test.
- **3S9-OPS-01 stays in Code review** until it is deployed: its clause says "live".

## rcfworks — deploy 1122a37; 3S9-OPS-01 to Done

- **Deploy:** #236 (the sync of #234 and #235) merged. `main` went green, Claude deployed, and `release` moved to `1122a37`.
- **Staging:**
  - both migrations applied (`pipeline_runs`, `attribution_framework`);
  - the API is listening;
  - `/health/full` returns 200 with status ok and `pipeline` ok, configured, nothing run yet (the first night is 19:00 UTC).
- **3S9-OPS-01 → Done:** the monitoring is live.
- **Stage Progress:** today's row was already appended by HeckerCreatives when closing P1-ART-22…25 (Done 286). My only Phase 1 change today (P2-OPS-08 dropped) changes no done count, so no duplicate row was added.
- **Open for tomorrow:**
  - check tonight's chain (the first recorded pipeline run, anomalies, backtests, the Zoho sandbox push), then 3S7-INT-01 to Done if the sandbox Account shows the score;
  - next: 3S6-BE-02/03/04, the rest of attribution, which finishes Phase 3's backend apart from 3S1-OPS-02 (on hold).
- **The user:** mirror the tracker to the Google Sheet.
