# 2026-10-14

## rcfworks — yesterday's deploy and the first nightly fact check

- The 12:03 UTC Daily deploy was skipped because CI on #203 had not finished. The **19:03 UTC** run deployed `6626d0d` (#203) to staging and production.
- **Staging, worker log:** `fact check: nightly at 19:00 UTC; emails on.` then `fact check 2026-10-13: every figure matches the app; 0 email(s)`.
- **Production:** not read, because the safety system blocks production logs. The user can check it with:

  ```
  railway logs --environment production --service api | grep -i "fact check"
  ```

## rcfworks — 3S1-OPS-03 · only the app writes to the live database (In progress)

**Before.** One login, `postgres`, a superuser, is used by:
- the api service (the API, the worker and the pre-deploy `prisma migrate deploy`);
- the staging `tester` service (`STAGING_DATABASE_URL`);
- anyone who uses `railway ssh`.

Neither database has a public address: staging's Postgres has no TCP proxy and no `DATABASE_PUBLIC_URL`. All 104 public tables and 12 `pgboss` tables are owned by `postgres`.

**Decision (user, 2026-10-14).** Two logins, not three. The app's own login also applies new tables at deploy. The user's words: "we would be constantly changing the shape while we are in development, so there is no need for a special user". The tester site uses the app's login.

**Built:**
- `backend/src/db/logins.ts`:
  - `applyLogins` creates or updates `sponsorx_app` (not a superuser) and makes it owner of the database, every schema, table, sequence, function, enum and domain;
  - `sponsorx_readonly` gets SELECT on every schema plus default privileges, so tables added later are readable too. CREATE is revoked from PUBLIC, and `default_transaction_read_only` is on;
  - `checkLogins` proves it all, logged in as each login.
- `npm run db:logins`:
  - takes the passwords as JSON on stdin, never in argv;
  - runs as the master login and refuses to run otherwise;
  - prints only counts and checks, and exits 1 if a check fails.
- `npm run db:read -- 'SQL'`: developers' queries, run through `READONLY_DATABASE_URL` in a READ ONLY transaction that is rolled back.
- `backend/tests/db-logins.test.ts` (8 tests) uses a scratch database built by every migration plus pg-boss' schema, as the master login, like staging and production. It shows that:
  - the check passes;
  - the read-only login is refused INSERT, UPDATE and DELETE (including on `pgboss.job`), `DISABLE TRIGGER` on Fact, and CREATE TABLE, even with read-only switched off;
  - `prisma migrate deploy` runs as the app;
  - pg-boss starts, sends and fetches as the app;
  - the app can read `pg_stat_archiver` (system health);
  - a table the app adds later is readable by developers and not writable;
  - a re-run hands over an object the master login made;
  - only the master login can apply it.
- **Docs:**
  - Deployment Runbook §6 covers the logins, where the passwords live (on the database service, referenced from api), the setup steps, undo and break-glass;
  - Fact Ledger v1.8, §10;
  - the Phase 3 plan entry;
  - `.env.example`.
- **Tracker:** 3S1-OPS-03 is In progress, rcfworks, started 2026-10-14.

**Note (disclosure).** While listing staging's Postgres variables, a redaction regex failed, and the staging master password was printed into the session output. It went nowhere else. It will be changed when staging is switched over.

**Next:**
1. PR, merge and deploy.
2. Staging: passwords on `Postgres`, then `db:logins`, then switch `api` and `tester`, then health, `facts:check` and `db:read`.
3. Change the staging master password.
4. Production: the user runs the commands.

## rcfworks — 3S1-OPS-03 applied in staging and production (Code review)

PR #204 was merged, then the sync PR #205. The user started the deploy by hand once `main` was green (the safety system blocks me from starting it). `59ca246` is live in both environments.

The setup went in four steps, the same in both environments:
1. Passwords: `SPONSORX_APP_PASSWORD` and `SPONSORX_READONLY_PASSWORD` were set on the database service with `--skip-deploys`.
2. Logins: `db:logins` received the passwords on stdin. It handed over 167 objects, and all six checks passed.
3. Switch: `api` got `DATABASE_URL` and `READONLY_DATABASE_URL` as `${{<db>.…}}` references, which redeploys it.
4. Checks: `facts:check` passes, and `db:read` shows only `sponsorx_app` and `sponsorx_readonly` connected.

**Staging only:**
- `tester` uses `STAGING_DATABASE_URL`, which is the app's login. The site is up.
- The worker log after the switch shows no permission errors. pg-boss started, and the pre-deploy migration step ran as the app.
- The master password was changed, so the one exposed this morning no longer works.
  - Method: `ALTER ROLE postgres` was run through `railway ssh` with stdin, and the new password was proven to work.
  - `POSTGRES_PASSWORD` and `PGPASSWORD` were updated with `--skip-deploys`. The service's `DATABASE_URL` follows by reference.

**Production:** the user pasted the commands.
- The first attempt checked too early: the ssh reached the old container, which was still on the master login without `READONLY_DATABASE_URL`. The user then ran the undo.
- Re-running step 3 and waiting for the redeploy (finished 05:27 UTC) gave the expected results.
- Runbook §5 now records this lesson.

**Tracker:** 3S1-OPS-03 is now in Code review.

**For HeckerCreatives:** `frontend/src/lib/intelligence.ts` (lines 126 and 140) still says "a sponsor/property-scoped read of the warehouse". The warehouse is being retired (3S1-OPS-02), and these reads will come from the fact ledger's summaries.

## rcfworks — 3S1-OPS-02 on hold (user)

"Let's just leave the database alone. If no one is going to use it, we just leave it there while we are in development."

The warehouse databases, settings and hourly copy all stay. Nothing reads them.
- **Plan:** a note on the 3S1-OPS-02 entry.
- **Tracker:** a note in Notes. The status stays Blocked, because the list has no "On hold".

## rcfworks — 3S1-DATA-03 · benchmark pipeline (Code review)

**What it is (agreed with the user):** what sponsors usually pay per 1,000 verified views, by sport, market, format and audience, plus all orders together. Each figure has p25, median, p75 and the number of orders behind it.

**User decisions, 2026-10-14:**
- A figure from fewer than **10 orders** is marked a small sample. It is still shown.
- The window is the **last 12 months**.

**Built:**
- `Benchmark`, migration `20261014090000_benchmark`. No drift for it: the remaining `migrate diff` lines (EditionAsset FK, an index rename) predate this change.
- `backend/src/domain/benchmarks.ts` computes one CPM per order from the summaries: (booked − cancelled sell) × 1000 ÷ (API + manual verified views), grouped by (tenant, campaign, athlete, NIL job). Percentiles use `percentile_cont`, rounded to cents.
  - The segment comes from the athlete's current sport and tier, and the state of the booking's market.
  - `refreshBenchmarks` replaces a tenant's rows in one transaction; `skipTenants` keeps yesterday's.
  - `listBenchmarks` returns `smallSample`.
- The worker refreshes after the nightly fact check reports `ran`, skipping the tenants whose check failed.
- `npm run benchmarks:refresh -- [--tenant id]`.
- `tests/benchmarks.test.ts` (5 tests). Facts are written through `recordFact`, and every figure is worked out by hand.
- `authz.coverage` registers `Benchmark` as SYSTEM_INTERNAL.
- **Docs:** Fact Ledger v1.9 §11; the plan entry is set to Code review.

**Live:** neither staging nor production has campaign orders with verified views, so the benchmarks will be empty until real campaigns run. This is expected.

## HeckerCreatives — 3S1-FE-01: figures check on the integrations screen (Done)

- **Pulled `origin/main`** (6626d0d, #203). It already contains all of `main_development`, so `feature/P1-ART-25-finance-vault` fast-forwarded 61 commits with no conflicts; uncommitted work in the tree was untouched (none of it overlapped upstream).
- **Heads-up from the lead dev today:** the fact ledger (data history and every money/delivery movement — 3S1-BE-01/02, 3S1-DATA-05/06/07, 3S1-QA-01/02/03) is being revised because its tests kept failing; ~90%, expected 2026-10-15 with new FE tasks. This screen was built against today's `facts` shape — **re-walk it when the revision lands.**
- **Built:**
  - `frontend/src/lib/fact-check-live.ts` — turns the `facts` section of `GET /operations/integration-health` into a state: `never`, `failed`, `matching`, `mismatch`. Pure, unit-tested (`tests/fact-check-live.test.ts`, 8).
  - `/admin/integrations` — a "Figures check · nightly" section under the queue: when it last ran, matching or not, since which night, the differences in words (the API sends at most 20, then "…and N more"), and whether admin emails are on in this environment.
  - **A fourth state the task didn't list:** the check could not run (`matches` null with `lastError`). Shown as "not run" with the error — never as a mismatch, matching the backend's rule that a failed run is never emailed as one.
  - A mismatch or a failed run also joins the page's "N things need attention" summary at the top.
- **QA (live, 2026-10-14):** Docker up, the two pending migrations applied (`fact_ledger`, `fact_check_run`), API on :4000 and web on :3000. A temporary Playwright walk staged each state in `FactCheckRun` (days in 2099, deleted afterwards) and looked at the screen as the QA BTG admin on desktop and mobile:
  - never run → "Not run yet"; matching → "Report figures match the app"; two failing nights with 22 differences → "since the night of Jan 2", 20 shown + "…and 2 more", the campaign named; another tenant's difference never shown; a run with an error → "could not run" + the error.
  - Finance is sent to its own `/finance` portal and never reaches the screen.
  - 4/4 walks passed; screenshots reviewed by eye (no overflow at phone width). Frontend suite 139 files / 1,528 tests green, lint clean, `next build` green.
- **Docs/tracker:** Phase 3 plan entry → Code review with a Delivered line; tracker row 66 (Phase 3) → Code review, Owner, Date Started, Notes.

## HeckerCreatives — P1-ART-26: one theme, the day/night toggle removed (Done)

- **Asked by the programme owner today:** remove day/night mode from the whole web app; the default — dark — is the only theme. New task **P1-ART-26** raised (Phase 1 plan + tracker row 303, ranges extended to 303).
- **Changed:**
  - `components/theme-toggle.tsx` deleted; `portal-shell.tsx` no longer renders the sun/moon button (it showed on the athlete Arena, property, advisor, NEXT and guardian shells).
  - `app/layout.tsx`: the pre-paint script that re-applied `localStorage["sx-theme"]="light"` is gone, so anyone who had picked light gets dark on their next load. `suppressHydrationWarning` stays (the landing loader and the proposal print still write attributes on `<html>`).
  - The Arena's light-only rules (`[data-theme="light"]` floodlight, stripes, lanes, plate shine; the phone dock and sheet) removed from `globals.css` and `mobile-nav.css`.
  - **Kept on purpose:** the Frost light tokens in `globals.css` — the schools proposal prints on them (`lib/print-light.ts`, P1-FE-26). The QR print sheets' `?theme=light|dark` is a print format, not an app theme, and is unchanged. Old "in both themes" remarks in ~20 code comments were left alone (no behaviour; avoids churn in files others edit).
- **QA (production build, 2026-10-14):** every browser started with the old `sx-theme=light` already stored. 232 page visits — public site, BTG admin, athlete, sponsor, Finance, property manager, advisor and student; desktop and mobile; 116 screens including campaign, order and inventory detail pages: 0 theme buttons, 0 `data-theme` on `<html>`, dark ground on every page, 0 page errors, 0 5xx, 0 horizontal overflow. The 8 redirects are routes that forward by design. The schools proposal print still switches to light and back to dark. Screens spot-checked by eye. Frontend 139 files / 1,528 tests, eslint, tsc and `next build` green. Not walked: the guardian shell (no QA guardian login).

## HeckerCreatives — P1-ART-27: signed-in visitors get "<Role> Dashboard" on the public site (Done)

- **Asked by the programme owner today:** on the landing page, if someone is already signed in and their session hasn't expired, Login and Get Started should take them to their own dashboard. New task **P1-ART-27** (Phase 1 plan + tracker row 304, ranges extended to 304).
- **Built:**
  - `lib/dashboard-link.ts` — names the portal for the button ("Admin Dashboard" … "Student Dashboard"; "Guardian Dashboard" for a guardian). Pure; `tests/dashboard-link.test.ts` (3).
  - `server/my-dashboard.ts` — a server action: `fetchActor()` + `portalFor()`, the same answer `/portal` acts on. Signed out, expired, unprovisioned or the API down → null.
  - `components/my-dashboard.tsx` — `useMyDashboard()`: Clerk's `useAuth()` decides whether the session is live; only then is the action called, once per page, shared by every button. `DashboardCta` for the landing's hero and closing buttons.
  - `site-nav.tsx` — `HeaderActions` (Login + Get Started moved here from `site-chrome.tsx`): signed in, Login steps aside and the gradient button reads "<Role> Dashboard"; the phone menu's pair becomes one full-width button.
  - `/` is still prerendered static — the role is never read during the page render.
  - The footer's "Sign In" link was left as is.
- **QA (production build):** 18/18 Playwright walks, desktop + mobile. Signed out, nothing changes. Each of admin, athlete, sponsor, Finance, property, advisor and student: header + hero + closing all read "<Role> Dashboard" and link to their portal, Login gone, the phone menu shows one button, clicking the header button lands in the portal, `/packages` shares it. **A revoked Clerk session goes back to Login / Get Started** (session revoked via the Clerk API, page reloaded). Screenshots after the 3D loader at 1366 / 412 / 360 px reviewed by eye: the longest label ("Property Dashboard") fits beside the logo at 360 with no overflow. Frontend 140 files / 1,531 tests, eslint, tsc, `next build` green.

- **Pushed and closed (HeckerCreatives):** 3S1-FE-01, P1-ART-26 and P1-ART-27 merged into `main_development` and `main` (b59fd98, CI green), then marked **Done** in the tracker and the plan on the owner's call.

## rcfworks — 3S2-BE-01 · feature store and snapshots (Code review)

**What it is (agreed with the user):** the inputs a price is suggested from, frozen per athlete per day. The pricing engine (3S2-BE-02) uses them, and a past suggestion can always be explained.

**User decisions, 2026-10-14:** one snapshot per athlete per day; "recent" means 90 days. Caveats were discussed and accepted:
- snapshots will be thin until campaigns run;
- audience figures are mostly self-reported;
- seasonality needs a year of history;
- storage grows by about 0.5–1 GB a year per 1,000 athletes;
- a missed night falls back to the day before;
- nothing reads the snapshots until 3S2-BE-02.

**Built:**
- `FeatureSnapshot`, migration `20261014120000_feature_snapshot`, unique on (tenant, entity type, entity, day). Written with `createMany skipDuplicates`, so it is never updated.
- `backend/src/domain/feature-snapshots.ts`:
  - covers bookable athletes (ACTIVE or FEATURED);
  - audience comes from `AthleteSocial`, with labels;
  - engagement, delivery and demand come from the summaries;
  - on-time delivery comes from the DUE and PUBLISHED facts per deliverable, skipping reversed DUE facts;
  - seasonality needs a year of bookings for the sport, and is otherwise null with a reason;
  - the module also covers geography, scarcity and the segment's benchmarks.
  - `getFeatureSnapshot` returns that day's snapshot or the latest before it; `listFeatureSnapshots` returns a range.
- The worker runs benchmarks and then snapshots after the nightly fact check, skipping the tenants whose check failed.
- `npm run features:snapshot -- [--tenant id]`.
- `tests/feature-snapshots.test.ts` (7 tests), with every value worked out by hand.
- `authz.coverage` registers `FeatureSnapshot`.
- **Docs:** Fact Ledger v1.10 §12; the plan entry is set to Code review, and its "Builds on" line is re-pointed from the warehouse to the ledger.
- **Tracker:** 3S2-BE-01 is in Code review.

## rcfworks — 3S2-BE-02 · CPM engine v1 (Code review)

**User decisions, 2026-10-14:**
- v1 prices athlete items only; venue and team items are not priced yet;
- each factor is capped at ±20%, and all factors together at ±40%.

**Built:**
- `backend/src/domain/pricing-engine.ts`:
  - `recommend()` is pure;
  - the base is the benchmark median: job, then sport, tier, state, then all orders, at 10 or more orders. Otherwise it is the largest group, or the current CPM;
  - the factors are engagement, delivery, demand, seasonality and scarcity, capped and then scaled together;
  - a floor factor applies when the floor lifts the price, and base + Σ impacts = the suggestion;
  - the stamp is `cpm-rules@1.0.0`, with a confidence from 0 to 1.
- `pricingDesk` and `pricingDetail` compute when read from the latest snapshot. Until 3S2-BE-03 stores them, the ids are `computed:<item>:<day>` and `canOverride` is false.
- **Routes:** `GET /intelligence/pricing` and `GET /intelligence/pricing/{inventoryId}` (`routes/v1/intelligence.ts`), as the pricing panel's contract asks.
- **New permission `pricingRecommendation`:**
  - read: SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR and SALES;
  - write (the override, 3S2-BE-03): SUPER_ADMIN and BTG_ADMIN.
  - Registered in RBAC matrix §28, policy and scope, the matrix digest (`be91f12557155114`), the OpenAPI registry and the tenant-isolation sweep.
- **The NIL job sell floor is read by job id.** The SX catalogue is one row per id, whichever tenant seeded it. In dollars, it is ×100 against an item's cents.
- `tests/pricing-engine.test.ts`: 10 tests with hand-worked prices.
- **Docs:** Fact Ledger v1.11 §13; the plan entry; the tracker is in Code review.

**Lesson (my mistake, now fixed):** `export DATABASE_URL=… TEST_DATABASE_URL=$DATABASE_URL` on one line leaves `TEST_DATABASE_URL` empty, because the shell expands the variable before assigning it. Every database-backed test then quietly skips. Set the two in separate exports, or spell out both URLs.

## rcfworks — 3S2-BE-03 · pricing records and overrides (Code review)

**User decisions, 2026-10-14:**
- the newest override stays in force until an admin replaces it, including after tomorrow's suggestion;
- an override never changes the item's listed price.

**Built:**
- `PricingRecommendation` and `PricingOverride`, migration `20261014150000_pricing_records`. A `pricing_append_only` trigger refuses UPDATE or DELETE on both, except DELETE in a database marked purgeable, as the ledger does.
- `storePricingRecommendations` stores one per item per UTC day with `skipDuplicates`. The worker runs it after the snapshots and skips the tenants whose check failed. `npm run pricing:refresh` does it by hand.
- The reads (`pricingDesk` and `pricingDetail`) now serve the latest stored suggestion, plus the override in force and the full override history. `canOverride` comes from `can(… "write")`.
- `overridePrice`, at `POST /intelligence/pricing/recommendations/{id}/overrides` (Zod `PricingOverrideInput`):
  - BTG admins only; others get 403;
  - the reason must be 10–500 characters, otherwise 422;
  - below the floor it returns 422 and writes a `pricing.floorOverrideAttempt` audit row;
  - otherwise it creates the record and a `pricing.override` audit row (a new `AUDIT_ACTIONS.pricing.override`).
- **Registered:** the OpenAPI registry; `authz.coverage` maps both models to `pricingRecommendation`; the tenant-isolation sweep has a tenant-A suggestion, the `recommendations` id and the POST body.
- `tests/pricing-engine.test.ts` now has 15 tests, adding storing, the trigger, every override rule, and an override staying in force overnight.
- **Docs:** Fact Ledger v1.12 §13 and RBAC matrix §28 updated; the plan entry and tracker are in Code review.

## rcfworks — deploy a556c11 (3S2 pricing sprint) and the staging check

- **#211 and the sync #209 merged.** The user's first deploy dispatch (11:15 UTC) ran before `main`'s checks finished and correctly refused: "Checks on a556c11 are not all green (0 of 2) — not deploying today." After CI went green, the second dispatch (11:30) moved `release` to `a556c11`. The api and web in staging and production were live at 11:32. The migrations (`FeatureSnapshot`, `PricingRecommendation`, `PricingOverride`, and the trigger) were applied by the pre-deploy step as `sponsorx_app`.
- **Staging, run by hand:**
  - `/health` returned 200;
  - `benchmarks:refresh` produced 0 figures, because there are no campaign orders with verified views yet;
  - `features:snapshot` took 8 snapshots for 8 active athletes in 4 tenants;
  - `pricing:refresh` priced 0 items. The 6 active athlete items (seed tenant) belong to athletes with no follower or view counts, and there are no benchmarks, so there is nothing to price per view from. The engine refuses to guess, as designed.
- **Production:** not touched by hand. The worker runs the fact check, then benchmarks, snapshots and suggested prices, from 19:00 UTC tonight.

## rcfworks — Sprint 3S3 · sponsor matching: 3S3-BE-01, -02, -03 (Code review, one PR)

**User decisions, 2026-10-14:**
- rank all three kinds: athletes, properties and items;
- the eight factors and their points: audience 15, geography 15, category 15, history 15, budget 15, format 10, sponsor history 10, quality 5;
- a response target of under 2 s for about 1,000 candidates;
- one consolidated PR.

**Built:**
- **3S3-BE-01:** `CampaignBrief` gains `excludedCategories`, `channels` (`MATCH_CHANNELS`), `audienceTiers` and `audienceMinFollowers`.
  - The fields are accepted on create and patch (Zod), and returned by `GET /briefs/{id}`.
  - A category both wanted and excluded is refused with 422 (`CategoryWantedAndExcludedError`).
- **3S3-BE-03:** `match-rules.ts` `filterCandidate` removes, in this order:
  - **unavailable:** not ACTIVE or FEATURED; an item's window misses the brief; a property has nothing available;
  - **category conflict:** an EXCLUSIVITY restriction in the brief's dates, or a tie to an excluded category in 12 months (the sponsors' categories from orders and marketplace sales, or the item's own);
  - **brand safety:** a profile, league, school or team restriction, or an item restriction, or a minor or school with a sensitive category.

  A partly-available item is LIMITED with a note. Applicants in review are not candidates.
- **3S3-BE-02:** `scoreCandidate` scores the eight factors.
  - A factor that does not apply gets weight 0 and the rest are scaled. Contributions are whole points by largest remainder, so they sum to the score exactly.
  - Confidence is the share of points resting on real data. The model is `match-rules@2.0.0`.
- `match-engine.ts` gathers everything in about 10 batched queries, ranks all three kinds, and stores `MatchRun` and `MatchScore`.
  - Runs are reused for 10 minutes by the real clock, or until the brief's `updatedAt`. The three runs share one timestamp.
  - `BriefShortlist` holds at most 100 entries, only from the current ranking, replaced on save, and audited as `match.shortlistSave`.
- **Routes:** `GET /intelligence/briefs/{briefId}/matches` and `POST /intelligence/briefs/{briefId}/shortlist`.
- **New permission `briefMatch`** (RBAC matrix §29):
  - read: BTG_ADMIN, CAMPAIGN_MGR, NETWORK_MGR and SALES;
  - write (the shortlist): BTG_ADMIN, CAMPAIGN_MGR and NETWORK_MGR.
  - The matrix digest is now `25b70735cf8b7452`.
- `restriction-window.ts` moved `dayStart`, `dayEnd` and `overlaps` out of `restrictions.ts` (which re-exports them), so the rules stay free of database access.
- **Tenant-isolation sweep:** the shortlist POST body was added, and MatchRun and MatchScore are left out of the "nothing changed" fingerprint. They are what tenant A's own positive-control read stores; tenant B gets 404 before any write.
- `tests/match-engine.test.ts`: 14 tests. They cover:
  - scores worked out by hand (84 for the athlete example, 61 for the venue);
  - every filter reason and its order;
  - LIMITED items;
  - the brief inputs;
  - run reuse, staleness and brief edits;
  - shortlists, roles and tenants;
  - 1,000 athletes ranked in under 2 s.
- **Docs:** `documentation/SponsorX-Match-Engine.md` (new); the plan entries; the tracker (3 rows in Code review).

**For HeckerCreatives:**
- The sponsor brief form can now send `excludedCategories`, `channels`, `audienceTiers` and `audienceMinFollowers`.
- In the match explorer, Sales can read but not save a shortlist: the API answers 403. The screen contract had proposed Sales could save.

## rcfworks — Sprint 3S4 · forecasting and pacing: 3S4-DATA-01, -BE-01, -BE-02 (Code review, one PR)

**User decisions, 2026-10-14:**
- the guarantee is set by BTG per campaign; unset, it is every deliverable booked;
- risk is on track at 80% or more, watch from 50%, at risk below;
- email BTG admins and campaign managers once at risk, and once on recovery;
- one PR.

**Built:**
- **Migration `20261014210000_forecasting`:** `Campaign.guaranteeMetric` and `guaranteeValue`, plus `CampaignPacing`, `CampaignForecast` and `CampaignForecastAlert`.
- **`forecast-rules.ts`** (no database access):
  - **flows:** the observed daily rate blended with the plan's (fully trusted at 30% of the flight); range and probability from the daily spread (normal approximation, 80% band);
  - **deliverables:** each one's chance of landing (98% not yet due, adjusted for a late athlete; 75% overdue; 40% overdue in the last week), with the probability as their product;
  - risk thresholds, reasons, the four actions, and `alertMove`. Alerts are raised only before the end and after 20% of the flight; at risk is emailed once, held through a dip to watch, and followed by one recovery email.
- **`forecast-engine.ts`:**
  - **delivery:** the ledger's verified views and engagements, REDEEM events, and verified deliverables;
  - **nightly `runForecasts`:** pacing (missing days filled), the forecast (`createMany skipDuplicates`, one per campaign per day), and the alert move with `forecast.atRisk` and `forecast.recovered` emails to BTG_ADMIN and CAMPAIGN_MGR, gated by `FORECAST_EMAILS` (default off);
  - **reads:** `forecastList` and `forecastDetail`;
  - **`setGuarantee`:** audited as `campaign.guaranteeSet`.
- **Wiring:**
  - the worker runs it after suggested prices and skips tenants whose check failed; `npm run forecasts:refresh` does it by hand;
  - routes `GET /intelligence/forecasts`, `GET /intelligence/forecasts/{campaignId}` and `PUT …/guarantee`;
  - new permission `campaignForecast` (RBAC matrix §30): read for BTG_ADMIN, CAMPAIGN_MGR and SALES; write (the guarantee) for BTG_ADMIN and CAMPAIGN_MGR. The digest is now `51eb91aed060275f`;
  - registered in OpenAPI, authz.coverage and the tenant-isolation sweep (the `forecasts` id and the PUT body); `.env.example` documents `FORECAST_EMAILS`.
- **`tests/forecast.test.ts`** (17 tests): every figure worked out by hand. The three simulated campaigns:
  - A, deliverables: watch at 72%, overdue work, chase it;
  - B, impressions: at risk and emailed to 2 people, then recovered the next night with one email;
  - C, two days in: at risk, not alerted.

  The tests also cover a re-run the same day, emails off, roles, tenants and the templates.
- **Docs:** `documentation/SponsorX-Forecasting.md` (new); the plan entries; the tracker (3 rows in Code review).

**After deploy:** set `FORECAST_EMAILS=on` on the api service in staging and production, the same way as `FACT_CHECK_EMAILS`.
