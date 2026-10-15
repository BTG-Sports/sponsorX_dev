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
