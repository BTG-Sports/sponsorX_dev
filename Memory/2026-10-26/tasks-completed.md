# 2026-10-26

## www.sponsorx.net now redirects to https://sponsorx.net

- **Cause:** when production went live (2026-09-28), only the apex `sponsorx.net` was added in Cloudflare and Railway. `www` had no DNS record, so it didn't resolve at all.
- **New Cloudflare key:** the old `CLOUDFLARE_API_TOKEN` in `.env` was dead ("Invalid API Token"). The user created **"SponsorX DNS"** in Rcarr@icarrefound.org's account: sponsorx.net only, Zone Read + DNS Edit + Single Redirect Edit, expires **2027-10-26**. It's in `.env` (not committed).
- **Added through the API:**
  - DNS: `CNAME www → sponsorx.net`, proxied (orange cloud).
  - Single Redirect rule "www to sponsorx.net": host `www.sponsorx.net` → `concat("https://sponsorx.net", path)`, 301, query string kept.
- **Checked** against 1.1.1.1: `https://www.sponsorx.net/` and `http://www.sponsorx.net/` both 301 → `https://sponsorx.net/`; `/join?ref=test` keeps its path and query. The app isn't served on `www`, because production sign-in (Clerk) only works on `sponsorx.net`.

## Zoho Books org renamed to SponsorX

- **Why:** the P8-OPS-04 test invoice was emailed as "Bill for The Coffee Stage". Books names the issuer after the organisation, and the org used (`763851111`) was still called The Coffee Stage.
- **The org:** the only Books org on the rcfworks account (Zoho One, created Feb 2022, user is admin). Its Getting Started page showed it effectively unused; the only invoice in it is the P8-OPS-04 test.
- **Decision (user, 2026-10-26):** rename rather than move. The user renamed it **SponsorX** and set Industry to "Agency or Sales House". The org ID is unchanged, so the "Send to SponsorX" rule and `sponsorx_send_invoice` keep working; nothing was redone. P8-OPS-04 stays Done.
- **Supersedes** the 2026-10-02 note that this org "is not BTG's" and that Rodney must create a separate Books org.
- **Still to confirm:** the org address (Baltimore, 21239) prints on every invoice; replace it if it isn't BTG's. Use `https://sponsorx.net` as the website (no `www` before today's redirect).
- **Test records** (customer "Test Sponsor (SponsorX test)", INV-000001, its $10 payment) are still in the org.

## Tester guide: dry run on staging, guide corrected

- **Guide:** "SponsorX Tester Guide.docx" in the user's Drive folder "Sponsor X Tester" (written through Google Drive for desktop). The older, uncorrected Google Doc was deleted at the user's request. Testers report through the staging Contact BTG page (`/contact`, which forwards to support@sponsorx.net); the Google Form was dropped.
- **Dry run** as real sign-ups on staging (run tag `DRY 2610260300`, left in place):
  - Athlete and sponsor sign-ups opened automatically.
  - Item → listing went live; Shop → cart → checkout → paid with card 0077 (order PAID).
  - The "SponsorX Test Drive" request became a campaign automatically; admin sent an offer from the Matching Studio; athlete accepted; draft → revision → v2 → approved → published.
  - Reward + QR → fan claim → redeem → no second redeem; the redemption shows in the sponsor's results.
  - Athlete earnings (pay only); audit log; the under-18 application waits for the guardian.
- **Guide corrections:** two required ticks on the application's last page; no rate fields; listings start in Inventory; Shop, not the marketplace, for athletes' listings; request a ready-made package (a job type is a custom request, held for BTG); offers are under Offers; deliverables are a draft upload with #ad; "Send to sponsor", not "Approve", for sponsor review; card 0077, not 4242.
- **Not run, left to the testers (user's decision):** the athlete's Stripe payout setup (Connect onboarding still shows an hCaptcha to scripts), and what follows it (sponsor confirms delivery, payout request); the guardian's own confirmation; the sponsor approving a post.
- **Frontend problems found** (list sent to the user for HeckerCreatives): no PDF export on real campaigns (`{sample && <ExportReport/>}` in the report page); placeholder brands on the homepage; "POSTGRES · READ" label on athlete pages; the offer title repeats the sponsor; image drafts labelled "Video"; a duplicated sentence on the listing form; "BTG verifying" vs "Complete" after publishing.
- **Stripe:** hosted Checkout now accepts a headless browser; Connect onboarding still doesn't.

## P8-FE-09 · The tester-guide dry run's screen findings (HeckerCreatives, Code review)

Seven problems from the staging dry run, fixed on `fix/P8-FE-09-dry-run-screen-findings` (from `main_development`). Not committed, walked or deployed yet.

- **Real campaigns can export their report.** The sponsor results page showed "Export report" only on the two sample campaigns. A new export model, `campaign-results-report.ts`, is built from the same reads the page draws, with PDF and XLSX renderers. Reach by source stays one row per source with no total. The samples keep their fixture export. *(Superseded in QA pass 3: samples now export through the same model, labelled (sample).)*
- **No mockup brands on the home page.** `trustedBrands` in `fixtures.ts` is now empty, and `TrustedBrands` renders nothing while it is. Add a brand only once it is a BTG sponsor that agreed to be named. The ≥1784px "Real athletes. Real impact." tag at the soccer stop lived inside that band, so it is hidden too.
- **Athlete pages say "Updated 9:41 AM".** That replaces "Postgres · read". The new `ArenaUpdated` in `arena-stage.tsx` formats in the viewer's timezone; the old server-formatted time was UTC on Railway. It covers 15 athlete pages, account settings and the athlete's Orders head. Admin desks keep their pill.
- **The sponsor is said once.** `campaignWithSponsor` (`lib/campaign-title.ts`) drops the sponsor when the campaign's name already starts with it, as a whole word. It is used on the offer page, the offers list, the deliverable page and the deliverable calendar.
- **The approvals desk names the upload's own kind.** Backend: `GET /deliverables` now returns `latestAsset.contentType`. Frontend: `toDeskItem` uses it, and falls back to the job's format, labelled "job", for assets with no recorded type.
- **One "goes live" line on the listing form.** The line under Submit is removed; the checklist's foot already says it.
- **"Complete" waits for verification.** Backend: `GET /campaigns/{id}/ops` returns a per-athlete `verified` count. In the order drawer, "Delivering" is done when everything is published. "Complete" is done only when everything is verified, and reads "Every deliverable published — BTG verifying (n of m verified)" in between.
- **Checked:** frontend `npm run build`, eslint on the changed files, and vitest (1,694 tests). Backend `tsc` and `campaign.ops` + `deliverables.read` tests pass. New tests: `campaign-results-report.test.ts` (the model, plus a PDF and a workbook actually rendered), `campaign-title.test.ts`, and extra cases in `approvals-live`, `ops-live`, `campaign.ops` and `deliverables.read`.
- **Tracker:** Phase 1 row 322 added, `P8-FE-09`, Code review, order 157.98. The filter, conditional formats and Status list were extended to row 322. Stage Progress snapshot appended for 2026-10-26. Plan entry added; the Stage 8 count is now 28.
- **Google Sheet:** still to mirror by hand at end of day.

### P8-FE-09 QA (same day)

- **Suites:**
  - Root `npm run build` and `npm run lint` pass. The one lint warning, in `handoff-request-steps.tsx`, was there before.
  - Frontend: 1,694 tests.
  - Backend: full suite on `sponsorx_test` (`npm run db:test` first); 3,497 pass. The only failures are the four known Windows-only files: db-logins, payments-pii, security-hardening and sql-rules-in-migrations (backslash paths, CRLF, `spawnSync npx`).
- **Browser walk:** Playwright as the QA athlete, admin and sponsor (Clerk sign-in tokens), against `combined.mts` on :4000 and `next dev` on :3000.
  - **Data:** `qa_fe09_*` rows were cloned from QA rows: a campaign named "Bowie Auto Group · Walk Test", an offer, a fully published order, a PNG draft on an SX-03 job, and an unlisted item. They were deleted afterwards.
  - **Seeding traps:** `CampaignOrder.acceptanceId` and `Campaign.briefId` / Zoho ids are unique, so null them when cloning.
  - **All seven fixes confirmed.** The exported PDF and XLSX were opened: reach by source stays apart, and the figures match the report read.
- **Found in QA and fixed:**
  - `athlete/earnings/page.tsx` had two `POSTGRES` MiniChips; they now read "SponsorX records".
  - The PDF printed the cost per 1,000 as `$418`; it now uses the screen's `formatCount(…, "usd")` and prints `$417.81`.
- **Landing in headless Chromium:** the city loader never finishes. Run the home check with `headless: false` to see the hero.
- **Not fixed, flag for the owner:** the home page's "Real Impact" card still shows fixture figures (148 athletes, 86 campaigns, $2.3M) on the live site. It is the same kind of issue as the brand strip, but it wasn't in the dry-run list.
- **Local env notes:**
  - Docker Desktop was started for this.
  - The `sponsorx-worker-1` container crash-loops because it gets no `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY`. This is pre-existing, and `combined.mts` runs the worker on the host anyway.

### P8-FE-09 follow-up: the QA findings fixed (same day)

- **Real network numbers on the public pages.**
  - **Before:** the home hero's "Real Impact" card, the closing "The numbers" panel and the /login figures printed `fixtures.networkStats` (148 / 86 / $2.3M / 41,280). The only "sample" note was a tooltip.
  - **New read:** `GET /public/network-stats` (backend `domain/public-network-stats.ts`, route in `catalogue.ts`, registered in `contracts/registry.ts`). It returns bookable athletes (ACTIVE+FEATURED), campaigns COMPLETED, deliverables VERIFIED and RewardEvent REDEEM, in `PUBLIC_INTAKE_TENANT_ID`.
  - **Frontend:** `lib/network-stats.ts` (the words, and leaving out zeros) and `server/network-stats.ts` (no-store, 1.5 s timeout, a good read kept 60 s in memory, the visitor's address forwarded through `edgeHeadersFrom`). Without a read, the hero card and the /login strip don't render, and the closing panel drops its "The numbers" block.
  - "Attributed fan value" is dropped (no source); "Posts verified" replaces it. `networkStats` is deleted from the fixtures.
  - `/` and `/login` now render per request (ƒ), like `/packages`.
- **Why the 60 s memory and forwarded address matter:** the API rate-limits public reads per client address (120 an hour). Server-side, that address is the web server, so without them the figures would vanish after 120 home views an hour.
- **Docker worker.** In `docker-compose.yml`, the worker had only `DATABASE_URL` and `PUBLIC_INTAKE_TENANT_ID`, so `env.ts` exited on the missing Clerk keys and the container restarted forever. The worker and api now share an `x-backend-env` anchor (16 variables; api adds `PORT`), and the worker also depends on redis and minio-setup. Rebuilt, it ran up for over a minute with restarts=0. Compose takes the Clerk keys from the repo-root `.env`.
- **Lint warning:** an unused `a` in `handoff-request-steps.tsx` (left behind when P8-FE-08 replaced the acceptance line) is removed. `npm run lint` now reports nothing.
- **Checked:**
  - frontend 1,701 tests; backend 3,499 (only the four Windows-only files fail); root build and lint pass;
  - live, the endpoint returned 14 / 1 / 2 / 2, matching SQL; home and login showed them on desktop and phone, and hid them with the API stopped.
- **Trap:** stopping `next dev` with TaskStop can leave `.next/dev/types/routes.d.ts` half-written, and the next `npm run build` then fails with TS1434/TS1128 inside it. Delete `frontend/.next/dev` (dev stopped) and build again.
- **Still open, for the owner:** the home page's "Featured athletes" panel shows fixture athletes (`athleteInv`) with "Verified" badges. Replacing it means choosing real athletes to show publicly, with consent, and minors need a person.

### P8-FE-09 QA pass 2 (same day)

- **How:** an independent code review agent over the whole branch, alongside a wider Playwright walk.
  - **Walk:** the athlete's 20 pages on desktop and phone; the approvals desk with a PNG, an untyped upload and an MP4; the order going 0 → 1 → 2 verified, flipped in the DB; both listing pages; sponsor exports for a campaign with and one without checked reach; student, advisor and public property pages.
  - **Every page:** browser console errors were collected.
  - **Data:** `fe09-seed2.sql` added `qa_fe09_d4`/`d5` and `qa_fe09_ord_img`; all rows were removed afterwards.
- **Fixed:**
  - **`uploadKind`:** only `video/*` and `image/*` count; `application/octet-stream` (sent by `deliverable-upload.tsx` when the browser can't tell) falls back to the job's format.
  - **"Postgres" for non-staff:**
    - the sponsor campaign footnote;
    - `/properties/[slug]` (public, twice);
    - the student `/next` chips and the "StudentPointAccrual — no cents…" line;
    - the advisor chip.
    - The finance splits and admin desks keep theirs.
  - **Sponsor results roster:** a React duplicate-key warning (an athlete on several jobs). Rows are now keyed `athleteId:jobId` and show `jobName()` (new `lib/job-names.ts`), with a Job column in the PDF/XLSX.
  - **`campaignAfterSponsor`** (in `campaign-title.ts`): the sub-line under a sponsor title drops the sponsor. Used on the athlete offers list and the dashboard offer and invite rows. The admin approvals drawer line now uses `campaignWithSponsor`.
  - **"goes live as soon as the checks pass":** removed from the two listing ledes, the athlete DRAFT `statusText`, the listings empty state and the property DRAFT detail. The line under Submit is the one place it's said.
- **Final runs:**
  - frontend 1,704 tests; backend 3,499 (the four Windows-only files only); build and lint clean; walk 6/6 with 0 console errors.
  - With the API, worker, dev server and Playwright all running, 5 more backend files hit 10 s hook timeouts. They passed alone. Run the backend suite with nothing else up.

### P8-FE-09 QA pass 3 (same day)

- **Team e2e** against the local stack (`E2E_BASE_URL=http://localhost:3000`, `--workers=1`): public, public-links, landing-city, redeem-flow, the P4/P5/P7 loops and marketplace-path. 35 passed and 5 were skipped by design (loops are desktop-only; the 390px check is mobile-only).
  - `loop-p4-matching` and `marketplace-path` failed on the Clerk dev cap (they create `e2e.p4.reserve` and `e2e.mkt.team`).
  - `loop-p5-delivery` and one `public-links` case hit first-compile dev timeouts and passed on re-run. Run them once to warm the routes, or against a build.
- **Edge checks:**
  - `/public/network-stats` counts only the public tenant (another tenant's active athlete was excluded).
  - It answers 429 at call 120 of 120/h. Locally there is no `SPONSORX_EDGE_KEY`, so the web server shares one bucket with the caller and the figures hid; clear it with `redis-cli del ratelimit:network-stats:public:::1`.
  - The timezone check passed (New York 11:38 AM, Manila 11:38 PM, no hydration error), and a hung API is cut at 1.5 s.
- **Fixed** (from the second review agent and the walk):
  - the sample roster's `jobId: "demo"` (now `DEMO_JOBS`, plus `knownJobName` for sub-lines);
  - `campaignAfterSponsor` on "Harbor Coffee's Fall Push" and "& Friends" (it needs a space or separator, and a letter or digit left over);
  - the approvals card's "Video job" qualifier;
  - internal names in demo views: the earnings sample export, the NEXT fixture home, the sample property page, the athlete-profile hover text and the sample sponsor export footnote.
  - **Sample results export:** it now goes through `campaign-results` with `{ sample: true }` (title "(sample)", a `-SAMPLE` filename, a sample footnote). `campaign-report-data/-pdf/-xlsx.ts` and the `campaign-roi` export kind are deleted; nothing else used them.
- **Seeds:** `fe09-seed3.sql` added a property draft listing (`qa_fe09_plisting`, item `qa_fe09_pitem`) for `qa_nx_school_a`. `fe09-clean.sql` removes everything `qa_fe09_*`, and nothing is left.
- **Final runs:**
  - frontend 1,707: `security-review` (the import-graph walk) failed once in a full run, then passed alone and in a second full run, so its 5 s timeout under load is the likely cause;
  - backend 3,498: the four Windows-only files, plus `reward.reservations` once under load (passed alone);
  - build and lint clean.

### P8-FE-09 QA pass 4 (2026-10-27, after midnight)

- **Stale local packages.** `node_modules` predated P8-SEC-04/05: next 16.3.8, zod 4.6.5, body-parser 2.3.0, dompurify 3.4.16, fast-uri 3.1.8 and qs 6.16.0, all behind the lockfile. So this branch's passes 1–3 (and any local run since 10-23) used the old versions. After `npm ci` and `prisma generate`, every check was repeated on the lockfile versions.
  - **Before QA,** compare `node -p "require('./node_modules/next/package.json').version"` with the lockfile.
- **Trap:** `npm init -y --prefix <dir>` still rewrote the ROOT `package.json`, merging in a 600-line dependency list. It was reverted with `git checkout -- package.json`; nothing else was touched. `axe-core` is already in `node_modules` through eslint-plugin-jsx-a11y, so there's no need to install it.
- **Production mode** (`next start`, which warns about `output: standalone` but serves) against the api container (`docker compose --profile apps up -d --build api`, removed afterwards):
  - walk 5/5, 0 console errors;
  - OpenAPI lists `/public/network-stats` with `security: []`;
  - axe found only a pre-existing `<dl>` structure issue in the Arena tiles (`/athlete`, `/athlete/offers`).
- **Third review agent (docs and tests). Fixed:**
  - stale comments in export-report, campaign-results-pdf and campaign-results-xlsx;
  - the earnings xlsx heading;
  - 13 orphaned fixtures (`roiReport`, `roiGauge`, `roiTimeline`, `formatPerformance`, `formatInsight`, `platformSplit`, `geoMarkets`, `geoInsight`, `efficiency`, `topContentX`, `roiRecommendation`, `roiDelivery`, plus `funnelDetail`) and `buildReportFunnel`;
  - the vacuous network-stats test;
  - the `orderJourney` extraction with tests;
  - `public-network-stats.route.test.ts`;
  - `BOOKABLE_ATHLETE_STATES` no longer exported;
  - `networkFigures` made generic, so there's no cast in landing-hero;
  - indentation in landing-close;
  - the register, the design record, P7-QA-02, the plan and this log.
- **Final runs:** frontend 1,712; lint clean; Next 16.4.2 build; backend 3,503 (4 Windows-only). With the api container and the production server up at the same time, the backend suite showed 21 failures, all timeouts. Run it alone.
