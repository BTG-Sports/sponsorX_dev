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
