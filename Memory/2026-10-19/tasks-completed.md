# 2026-10-19

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
