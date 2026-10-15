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
