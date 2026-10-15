# 2026-10-15

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
