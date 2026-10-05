# 2026-10-03

## rcfworks — staging deploy; BTG admin review items 18–22; two integrity fixes

- **Staging deployed** at main `e0566d6` (PR #149: cancellations, refunds to send, automatic payouts). The pre-deploy step applied migrations 20261003160000–190000. Checks: web `/login` 200, `/admin/refunds` redirects signed-out visitors to sign in, API `/health` ok, 332 paths. Production is not deployed and waits on green CI.
- **Items 18–22 of the BTG admin review.** Owner, 2026-10-03: BTG keeps the Phase 1 decisions (managed by design); the busywork around them is automated.
  - **P4-BE-07 · Brief readiness:**
    - BTG's desk shows a checklist: objective of at least 8 words; start in the future with at least 7 days' run; budget at least the package `priceLow` (or the lowest NIL job sell floor, $70); sponsor standing; eligible athletes after conflicts; the conflict count.
    - `?ready=true`, and the desk's "Ready for review" tab is the default.
    - Nothing changes state.
  - **P4-BE-08 · Ranked shortlist with reasons:**
    - `MATCH_WEIGHTS`: sport 30, state 20, work 20, rate 20, recent 10.
    - `?sort=match` is now the default.
    - `GET /campaigns/:id/offer-draft` pre-fills BTG's offer form, with a "Filled from…" note on each field. Nothing is sent without BTG.
  - **P4-BE-09 · Campaign stages:**
    - STAFFING→APPROVAL only when the package's `athleteCountMax` of different athletes have signed and nothing is outstanding. Below that, or with no package, BTG moves it.
    - ACTIVE→REPORTING when every deliverable is verified.
    - REPORTING→COMPLETED when the FINAL report renders (entering REPORTING queues one).
    - `sweepCampaignStages` runs every 10 minutes.
    - Every stage change takes the campaign lock, including order, offer and invitation creation. A campaign outside STAFFING refuses new staffing with 409 `campaign_not_staffing`.
    - Reads add `nextStep` and `stageChange`; BTG also gets `stageHistory`.
    - Emails: `campaign.readyToLaunch` and `campaign.finalReportReady`.
  - **P5-BE-09 · Content checks:**
    - The draft now carries a caption.
    - `contentChecks` covers: a file, an allowed type (JPG/PNG/WebP/MP4/MOV), and the offer's disclosures (case-insensitive, whole word). There's no tags field, so that check is skipped.
    - A failing draft returns to the athlete (`deliverable.checksFailed`) and never reaches BTG.
    - `sweepReviewReminders` sends one reminder after 48 hours in BTG or sponsor review. The migration backfills waits, so drafts already waiting get one reminder.
    - New sponsor content-review section on the sponsor campaign page.
  - **P6-BE-09 · Rewards follow the campaign:** complete drafts go live at launch (incomplete ones are listed and stay draft); cancelling pauses live rewards; completion leaves them to expire.
  - **P4-FE-08:** the screens for all of the above.
- **Integrity fixes, found while building:**
  - **2S8-QA-06:** the order contract lock (2S4-FE-02) existed only in `prisma/sql`, which CI applies but a deploy doesn't. Staging and production lacked it. Migration `20261004000000` installs it. The guard `tests/sql-rules-in-migrations.test.ts` builds a database from migrations alone and fails on any drift (verified to fail without the fix). A schema diff showed this was the only drifted rule.
  - **P4-BE-10:** `restrictedCategories` was nullable, so athletes who never set restrictions fell off shortlists for briefs with categories. It's now backfilled, defaults to `'{}'` and is NOT NULL on Athlete and InventoryItem.
- **How it was built:** three agents in worktrees, each with its own test database (`sponsorx_test_a/b/c`), merged into `development/bob/be_batch_0924`. Two trivial conflicts (`registry.ts` and `worker/index.mts`) were resolved by keeping both sides.
- **Checks on the combined branch:** backend 2465/2467 on two runs (only Jan's next-edition-e2e 4–5); frontend 1096/1096; tsc and eslint clean.
- **Tracker:** Phase 1 rows 270–276 (P4-BE-07/08/09/10, P5-BE-09, P6-BE-09, P4-FE-08), all Done; Phase 2 row 126 (2S8-QA-06), Done. The plans now have 207 (Phase 1) and 123 (Phase 2) tasks.

## rcfworks — afternoon: Phase 2 overrides Phase 1's manual rules; briefs, staffing, launch and content review automated

- **Programme owner's decision (2026-10-03):** "if we are in phase2, we need to override any rules set in phase 1 … Automation and safety is our priority." It's recorded at the top of CLAUDE.md. The rule from now on: a step is automatic when every safety check passes, and held for BTG with the reason when one fails. Minors and sensitive categories always reach a person.
- **P4-BE-11 · Briefs approved automatically:**
  - A sponsor's brief, on create or a DRAFT edit, goes DRAFT → QUALIFIED → APPROVED → CAMPAIGN_CREATED as the system when all of these hold: readiness passes; it has a package and the budget meets `priceLow`; fitting athletes reach `athleteCountMin`; no sensitive category on the brief or the sponsor; the sponsor is in good standing.
  - Otherwise it is held (`heldReasons` is BTG-only) and BTG is emailed once.
  - `recheckHeldBriefs` runs daily.
  - New `PATCH /briefs/:id`.
  - `SENSITIVE_CATEGORIES` lives in `brand-categories.ts`; offers and trusted review import it from there.
  - Also fixed: sponsors no longer read `closeReason`. A cross-tenant SUPER_ADMIN no longer creates the campaign in their own tenant.
- **P4-BE-12 · Campaigns staff themselves:**
  - A campaign from a package with job lines has `autoStaffing` on. It is new campaigns only: no backfill.
  - Offers go to the ranked list up to `athleteCountMax`, with a 3-day window (`AUTO_OFFER_WINDOW_DAYS`), within budget. A minor's offer goes to their guardian.
  - A decline is replaced in its own transaction (behind a savepoint); an expiry by `sweepAutoStaffing`.
  - A validation refusal skips that athlete (`CampaignStaffingSkip`). Running out of athletes or budget stops staffing and emails BTG.
  - `POST /campaigns/:id/auto-staffing` switches it.
  - Staffing starts straight after commit on every path (`startAutoStaffing`): BTG's approval, an auto-approved brief, and the held-brief recheck.
- **P4-BE-13 · Launch:** APPROVAL → ACTIVE as the system on the start date (`sweepCampaignLaunches`). The code has no sponsor approval step. `launchCampaign` now requires BTG tenant-wide approval; before this, a sponsor admin could launch their own campaign.
- **P5-BE-10 · Trusted drafts skip BTG review:**
  - A draft goes straight to the sponsor when the athlete's last 3 BTG-reviewed drafts had no BTG revision, the athlete is not a minor (`guardianControls`) and no category is sensitive.
  - A BTG revision resets the streak. A per-athlete lock serializes revision and submission.
  - Sponsors can no longer approve from BTG_REVIEW (409 `BtgReviewFirstError`).
  - A submit while in review is now refused (409).
- **P4-FE-09:** the screens for all of the above.
- **Merge note:** campaign creation now lives in `campaign-create.ts` `createCampaignIn`, used by both BTG approval and automatic approval. It sets `autoStaffing` from the package. A joint test in `auto-staffing-launch.test.ts` proves a sponsor's brief becomes a STAFFING campaign with offers out, with no person involved.
- **Migrations:** 20261004400000 (brief auto), 20261004500000 (staffing and launch), 20261004600000 (content trust).
- **Checks on the combined branch:** backend 2566/2568 on two runs (only Jan's next-edition-e2e 4–5); frontend 1117/1117; tsc and eslint clean.
- **Tracker:** Phase 1 rows 277–281 Done. The plan has 212 Phase 1 tasks.

## rcfworks — evening: SponsorX NEXT automation (BTG admin review items 23–24)

Owner decisions: students matched to the school roster are approved automatically (expanded rules below). Ads skip BTG review for sponsors with a clean record, and BTG reviews after any BTG change request. Revenue split shares stay placeholders (40/30/20/10, DMV 50/50). The machine restarted mid-build; the three agents resumed from their worktrees, and the local Postgres and test DBs were rebuilt.

- **P9-BE-17 · Editions run themselves:** `sweepEditionStages` (every 10 minutes, under an edition lock).
  - PLANNING→SELLING at the new `Edition.salesOpenAt`, needing a priced slot.
  - SELLING→CLOSED at `closeDate`, which resolves the split.
  - CLOSED→IN_PRODUCTION once all four gates pass (`contentReady` stays BTG's editorial call).
  - IN_PRODUCTION→PUBLISHED_DIGITAL at `publishTarget`, with the gates re-checked.
  - PRINTED, DISTRIBUTED and CANCELLED stay manual. Each edition shows `nextStep`.
- **P9-BE-18 · Rate card and gated ad sales:**
  - New `EditionRateCard`. A typed slot price that doesn't match the card is refused (422).
  - `sellIn` is the single sale path, and it now refuses NOT_FOR_STUDENTS, sensitive and unknown categories and clashes, for manual sales too (409 `ad_sale_refused`).
  - Automatic sale after campaign creation, only when exactly one SELLING edition fits. Otherwise an `AdSaleHold` is created and SALES is emailed once. The sweep retries holds for NO_SLOT and NO_EDITION.
  - Fixed: SALES could not sell by hand (the edition lookup used edition read).
- **P9-BE-19 · Split lock and cancel refunds:**
  - Finance locks a split; BTG admin unlocks. Triggers block writes to a locked split. Cancelling an edition with a locked split is refused.
  - Cancelling releases its slots, cancels ad-only campaigns, and creates `RefundDue` rows (EDITION_CANCELLED) for money received.
  - A Zoho payment after a cancel creates a PAID_AFTER_EDITION_CANCELLED row (via `CancelledAdSale`).
  - A refunded sale's student credit is reversed (`SalesAttribution.reversesId`, SALES_500_REVERSED −100).
  - RBAC Matrix §15.3: Finance lists editions through its split read.
- **P9-BE-20 · Students:**
  - Picked up on submit. Approved on an exact roster match (`name-match.ts` `norm`), only when:
    - the name matches exactly one roster entry, and the graduation year matches when both have one;
    - no approved student at that school has the same name;
    - an adult applies from the school's email domain (`Property.emailDomain`).
  - Otherwise the advisor reviews, with `reviewReasons`. An empty roster approves nobody.
  - Activation comes after guardian verification (unknown age never activates). The sales code is issued on ACTIVE. The advisor gets a daily digest.
  - Only ACTIVE students read school-wide data.
  - A roster upload re-reviews applicants held only for the roster.
  - No in-app guardian signature exists for students, so guardian verification stays with BTG.
  - **Walkthrough impact:** seeded Jordan (SUBMITTED) can no longer see the Fall 2026 slots until active (`pilot-school.test.ts` updated). Jan's `next-edition-e2e` clause 1 was adjusted minimally (one APPROVED step now returns ACTIVE).
- **P9-BE-21 · Prospects:** auto-reject on a held category (with redirects); auto-accept when clean (school `BrandRestriction` rows and athletes checked); otherwise held, with SALES emailed once. New BTG desk at `/admin/next/prospects`.
- **P9-BE-22 · Ad artwork:**
  - Checks: PDF/PNG/JPG, at most 50 MB, Content-Type and Content-Length signed into the PUT. Dimensions skipped (no source). A restricted word in the title holds the ad for BTG instead of returning it.
  - A failing upload returns to the sponsor.
  - Trusted sponsors (last 3 with no BTG revision) skip to the sponsor's own review, under a per-sponsor lock. Sensitive and NOT_FOR_STUDENTS sponsors never skip.
  - On approval, the THIRD_PARTY ad licence is recorded once, so sold ads no longer block production.
  - Also: athlete deliverable uploads now sign their content type, which makes P5-BE-09's check true.
- **P9-BE-23 · Consent rights recorded automatically:** from valid consent in force. A minor needs a verified guardian; commercial reuse only under COMMERCIAL. This now applies to BTG's manual grants too.
- **P9-FE-11:** the screens for all of the above.
- **Migrations:** 20261004700000, 800000, 900000 and 20261005000000.
- **Merge note:** `heldCategories` lives in `student-moves.ts` (with `exceptSponsorId`), and `edition.ts` imports it from there.
- **Checks on the combined branch:** backend 2658/2660 on two runs (only Jan's next-edition-e2e 4–5); frontend 1141/1141; tsc and eslint clean.
- **Tracker:** Phase 1 rows 282–289 are Done. The plan has 220 Phase 1 tasks.
