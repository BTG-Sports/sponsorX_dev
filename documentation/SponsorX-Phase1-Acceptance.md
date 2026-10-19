# SponsorX Phase 1 · Acceptance Record

**Task `P8-QA-01` · Version 1.0 · 2026-10-16 · Phase 1, Stage 8**

**Done when:** all fourteen §30 criteria are demonstrated and recorded.

**Source.** Master Development Blueprint v2.0, §30 "Phase 1 Acceptance
Criteria"
(`documentation/Master/Updated_BTG_SponsorX_Master_Development_Blueprint_Integrated_Athlete_Network.docx`).

This is the Phase 1 counterpart of
[`SponsorX-Phase2-Acceptance-Signoff.md`](./SponsorX-Phase2-Acceptance-Signoff.md)
and [`SponsorX-Phase3-UAT.md`](./SponsorX-Phase3-UAT.md). The UAT scripts that
put real people through the same loop are
[`SponsorX-Phase1-UAT-Scripts.md`](./SponsorX-Phase1-UAT-Scripts.md)
(`P8-QA-02`).

## 1 · How it was demonstrated

**Backend tests.** On 2026-10-16, the 39 backend test files behind these
criteria, plus a new `phase1-acceptance.test.ts`, ran against a real
Postgres, migrated as CI and production are:
- **1,048 of 1,048 passed** in the 39 files;
- **3 of 3 passed** in the new file.

**End-to-end tests in a browser.** `main`'s CI run 38857461531 (release
`0757299b`, 2026-10-16) ran one Playwright suite:
- **70 passed, 0 failed;**
- **the Phase 1 loop specs passed:** application, matching, delivery, reward
  redemption, and earnings with the report.

**On staging.** Where a criterion depends on an outside service, the record
cites what was checked on staging.

**Phase 2's changes count.** Phase 2 made several Phase 1 manual steps
automatic when every safety check passes (CLAUDE.md, 2026-10-03). Where a
criterion says "through admin workflow", the workflow still exists for
anything held. It is what an admin uses whenever a check fails.

## 2 · The fourteen criteria

### 1 · Athlete can apply, upload or enter the required onboarding information, and reach APPROVED through the admin workflow — **Demonstrated**

**How it works:**
- **Applying:** `/join` takes the application, the socials and an ID upload.
- **Approval:** the application is approved automatically when every check
  passes (Phase 2), or held for the admin desk with the reason.
- **Admins** approve or reject on `/admin/applications`.
- **Minors** are not active until a guardian is verified.

**Proof:**
- `application.intake` 31/31: "creates an application and leaves it
  SUBMITTED"; "puts the applicant in the configured tenant, which they
  cannot choose".
- `application.review` 37/37: "BTG_ADMIN may approve", "NETWORK_MGR may
  approve".
- `athlete.state` 10/10, `guardian.rules` 10/10, `phase2-athlete-signup`
  17/17.
- **End to end:** `loop-p3-application` (2 tests, including "a minor cannot
  go ACTIVE until a guardian is linked and verified").

### 2 · Admin can configure SX jobs and individual athlete rates — **Demonstrated**

- **Athlete rates.** BTG admins and network managers set an athlete's rate
  for an SX job (`POST /athletes/:id/rates`).
  - **Versioned:** each change is a new version, and the rate card reads the
    newest.
  - **Floor:** the floor it implies is rate × 1.4.
  - **Audited.**
  - **Nobody else** may set one.

  **Proof:**
  - `phase1-acceptance` 3/3 (new, for this record): "BTG sets a rate;
    changing it is a new version; the card reads the newest; the floor it
    implies is rate × 1.4; audited", and "nobody else sets rates".
  - `b2b4` 43/43: every SX job at every tier refuses a cent below its floor.
  - `offer-desk` 12/12: an offer below the athlete's rate is refused, naming
    the floor.
- **SX jobs.** The SX-01…SX-07 catalogue is reference data in code
  (`backend/src/domain/nil-jobs.ts`, `P3-BE-08`).
  - **Where its numbers come from:** the pay and price bands the business
    confirmed (`P0-PMO-09`, `P0-PMO-13`).
  - **How it changes:** by a reviewed code change, not an admin screen. Its
    floors are derived from the pricing rule, so they cannot drift from it.
- **Decided 2026-10-16 (the user).** "Configure SX jobs" is met by BTG
  configuring the catalogue through a reviewed code change.
  - **Why no editing screen:** the bands are business terms that change
    rarely, and the floors and the six packages are derived from them. A
    wrong number on a screen would move them all at once; a reviewed change
    keeps the tests checking that every floor and package still adds up.
  - **If that changes:** an editing screen is a new task, raised only if BTG
    needs the bands to change often.
- **Finding, fixed 2026-10-19 (`P8-BE-01`).** A job's ID (`SX-02`) was
  unique across the whole database, so only one tenant could hold the
  catalogue. It is now unique within its tenant: each tenant holds its own
  catalogue and prices, and the database refuses a rate, invite, order or
  offer pointing at another tenant's job (`nil-job-per-tenant.test.ts`).

### 3 · Sponsor can view packages and submit a campaign request or brief — **Demonstrated**

- **Packages:** the sponsor sees the six packages and their prices
  (`/sponsor/marketplace`, `/packages`).
- **A brief:** received, then approved automatically or held with the
  reason.

**Proof:**
- `catalogue` 21/21: "has all six athlete packages…", "clears the margin
  floor at every package's most expensive athlete count".
- `catalogue.public` 3/3, `brief-contract` 6/6, `briefs.read` 11/11,
  `phase2-sponsor-requests` 16/16.
- **End to end:** `loop-p4-matching` (from the sponsor's marketplace).

### 4 · Campaign manager can filter eligible athletes and send invitations — **Demonstrated**

**Proof:**
- `match-engine` 14/14: "removes the unavailable, the category-conflicted and
  the brand-unsafe…", "ranks athletes best first…".
- `conflict-enforcement` 9/9.
- `b3.invitation` 26/26: "refuses a second open invitation for the same
  work".
- **End to end:** `loop-p4-matching`.

### 5 · Athlete can accept an invitation and Campaign Order before work begins — **Demonstrated**

- **The order of steps:** the invitation, then the order, is accepted before
  any deliverable exists.
- **The deliverables** are created in the same transaction as acceptance.

**Proof:**
- `b3.invitation` 26/26 ("lets the athlete open their own invitation"),
  `b3.states` 14/14.
- `deliverable-template` 34/34.
- **End to end:** `loop-p5-delivery` (the athlete accepts on
  `/athlete/invitations`, then delivers).

### 6 · System auto-creates deliverables from job or package templates — **Demonstrated**

**Proof:**
- `deliverable-template` 34/34: a template for every SX job, and the
  deliverables created on acceptance with due dates from the job.

### 7 · Athlete can upload a draft or proof; BTG can request revision, approve and mark published — **Demonstrated**

**Proof:**
- `deliverable-state` 64/64: every allowed and refused transition, for
  example "NOT_STARTED → APPROVED is false".
- `deliverable.chain` 27/27, `deliverable` 7/7.
- **End to end:** `loop-p5-delivery`.

### 8 · A unique tracking link or code can be assigned per athlete deliverable — **Demonstrated**

**Proof:**
- `tracking` 13/13: one opaque code per deliverable; an unknown code is
  refused; resolving writes nothing; a recorded click writes its event.

### 9 · QR reward supports scan, claim and redemption event separation — **Demonstrated**

**Proof:**
- `reward.funnel` 20/20: "SCAN writes one row of type SCAN", "LANDING is its
  own row…", claim and redeem each their own.
- `reward-state` 39/39.
- **End to end:** `redeem-flow` ("a fan scans, lands, claims and redeems —
  once"), on the phone profile.

### 10 · Sponsor dashboard and final report show campaign and per-athlete performance — **Demonstrated**

**Proof:**
- `sponsor-report` 24/24: "returns performance as a labelled breakdown, not a
  number".
- `report-render` 6/6, `sponsor-overview` 20/20.
- **End to end:** `loop-p7-earnings-report`.

### 11 · Athlete portal shows pending, eligible and paid earnings status — **Demonstrated**

**Proof:**
- `earning-state` 63/63 (PENDING → ELIGIBLE → … → PAID, every refused move),
  `earning` 20/20, `earnings.list` 6/6.
- **End to end:** `loop-p7-earnings-report` (`/athlete/earnings`).

### 12 · Zoho Account, Contact and Deal links are created or synchronized using external IDs — **Demonstrated**

- **The proof:**
  - `zoho-sync` 16/16 ("a sponsor BTG just approved goes to Zoho at once: its
    Account with our key, and its primary Contact"), `zoho-mapping` 23/23,
    `zoho-client` 13/13.
- **Live, on 2026-10-09:**
  - **Where:** Phase 2's simulated-user run on staging read back from the Zoho
    CRM sandbox (org 7554807000000020005) records SponsorX had pushed.
  - **What was read back:** the Accounts, the Contacts, and a Deal
    `mkt-order:…`, each with its `SponsorX_ID` external ID.
  - **The record:** `documentation/uat-evidence/phase2-2610090617/evidence.md`,
    step 12.

### 13 · Admin audit log records critical changes — **Demonstrated**

**Proof:**
- `audit.list` 7/7: filters by entity, record, action and actor.
- `financial-audit-coverage` 147/147: every money-changing write is audited.

### 14 · Cross-tenant and role authorization tests pass — **Demonstrated**

**Proof:**
- `authz.matrix` 33/33: the whole role × resource grid is pinned.
- `authz.coverage` 135/135: every model is governed.
- `authz.row-scope` 19/19, `authz.fields` 22/22.
- `tenant-isolation` 10/10: every route, as every other tenant's actor, never
  a success and never a tenant's value.

## 3 · Sign-off

| | |
|---|---|
| **Criteria** | All 14 demonstrated. #2's "SX jobs" half is met by BTG configuring the catalogue through a reviewed code change (decided by the user). |
| **Signed off by** | the user, under the programme owner's delegated authority |
| **Date** | 2026-10-16 |
