# 2026-10-20

## rcfworks — Phase 5 Sprint 3 added: player accounts and the live connection (tasks only)

The user asked for tasks only, nothing built: a socket connection for the game, and a solid, industry-standard player login and account creation (stated error responses, login lock, registration, email, Google and Apple sign-in, authenticator apps), "and several facilities like WorkOS or SpacetimeDB if needed".

**Added** to `documentation/SponsorX-Phase5-INFINEX-Game.md` and the tracker's `Phase 5` sheet (rows 12–25). Phase 5 is now 21 tasks · 69 days (was 7 · 21).
- `5S3-PMO-01` · Player identity decision. Compares WorkOS AuthKit, a separate Clerk instance for players, Auth0, or SponsorX's own accounts. It records the player data held and its retention, and updates the World Contract from anonymous players to optional accounts. A chosen vendor gets its stack-decision addendum.
- `5S3-PMO-02` · Real-time connection decision (Order 8.5). Compares a plain WebSocket on the API (Postgres LISTEN/NOTIFY fan-out), SpacetimeDB, or a managed service (Ably, Pusher).
- `5S3-SEC-01` · Player authentication design: OAuth 2.0/OIDC with PKCE (RFC 8252), NIST SP 800-63B, OWASP ASVS L2.
- `5S3-BE-01` registration with email · `BE-02` email login and the error contract (invalid-credentials without enumeration, account-locked, email-not-verified, mfa-required, account-disabled, rate-limited) · `BE-03` lockout and throttling · `INT-01` Google · `INT-02` Apple · `BE-04` authenticator app (TOTP) · `BE-05` recovery, linking, deletion · `BE-06` sessions and rotating refresh tokens.
- `5S3-INT-03` · Game socket connection, carried as `5S3-PMO-02` decides; token in the first message, pushes for feed, pause and kill, settings and revocation; polling fallback.
- `5S3-INT-04` · In-game sign-up and login screens (the game's side).
- `5S3-QA-01` · Authentication security test (ASVS L2).

**Also changed:**
- New Phase 5 acceptance criterion 6 (accounts, refusal reasons, lockout, live socket).
- `5S2-PMO-02` now needs `5S3-QA-01` and signs off "all 6" criteria.
- The Roadmap's Phase 5 row (21 tasks, 69 days) and CLAUDE.md's phase list are updated.
- The sheet's autofilter, Status validation and conditional formatting are extended to row 25. The Dashboard already reads Phase 5 to row 100.

**Why the identity decision comes first:** the World Contract (`4S0-PMO-01`) says players are anonymous (only `sessionRef`/`subjectRef`). Accounts change that, so the decision is recorded before anything is built.

## rcfworks — the game is parked: Phase 4's 20 game-dependent tasks moved to Phase 5

**The user, 2026-10-20:** "Game is parked. We prioritise the web application. Game tasks are for Phase 5. Do not make any preparation for the game at this point. Our priority is to ship the SponsorX web app." This came when I proposed Sprint 5 (viewability and virtual metrics) as the next backend task.

**Moved to Phase 5** (the user chose 20, not all 29), renumbered, with the former-ID table in the Phase 5 plan:
- **Sprint 4 · Telemetry at scale:** 4S0-PMO-03 → 5S4-PMO-01, 4S4-BE-03 → 5S4-BE-01, 4S4-OPS-01 → 5S4-OPS-01, 4S8-OPS-01 → 5S4-OPS-02.
- **Sprint 5 · Viewability, metrics and pricing:** 4S5-BE-01/DATA-01/DATA-02/FE-01/BE-02 → 5S5-…
- **Sprint 6 · In-world activations and rewards:** 4S6-BE-01/02/03, INT-01, FE-01 → 5S6-…
- **Sprint 7 · Game reporting and operations:** 4S7-DATA-01, FE-01/02/03 → 5S7-…; 4S8-FE-01 → 5S7-FE-04; 4S8-DATA-01 → 5S7-DATA-02.

**Phase 4 keeps 9 open tasks** (the web side, which runs without the game): 4S0-ART-01, 4S1-FE-01/02/03, 4S2-FE-01, 4S8-BE-01 (emergency pause), 4S8-BE-02 (incident log), 4S9-PMO-02 (UAT, redefined: it depends on the kept tasks, with 6 criteria) and 4S9-OPS-01.

**Counts:** Phase 4 is 27 tasks · 96 days (was 47 · 190). Phase 5 is 41 · 163.

**Criteria:**
- Phase 4 keeps 1–4 and gains 5 (the admin screens) and 6 (emergency pause logged as an incident).
- The former 5–11 are Phase 5's 7–13.
- 5S2-PMO-02 signs off all 13.

**References:**
- **Renamed** in the spec, the World Contract, the Module Interface plan, the Virtual Registry and the Taxonomy: exact-ID replace in those five files only.
- **Kept as they were:** code comments and dated Memory logs (the former-ID table maps them).
- **Tracker:** the rows moved sheet to sheet, ranges reset (Phase 4 to row 31, Phase 5 to row 45), the Roadmap updated. CLAUDE.md is updated too.

## rcfworks — correction: all 9 remaining Phase 4 tasks moved to Phase 5 too

- **What went wrong:** I had kept 9 Phase 4 tasks as "web-side" (they run in SponsorX, not in the game). The user asked whether the emergency pause was for the game ("I told you to transfer all game related tasks to Phase 5. Am I not clear?"). It is: everything those tasks manage lives in the game. I had sorted by where the code runs instead of by what it serves.
- **Moved** as Sprint 8 · Virtual inventory screens, controls and launch: 4S0-ART-01 → 5S8-ART-01; 4S1-FE-01/02/03 → 5S8-FE-01/02/03; 4S2-FE-01 → 5S8-FE-04; 4S8-BE-01/02 → 5S8-BE-01/02; 4S9-PMO-02 → 5S8-PMO-01; 4S9-OPS-01 → 5S8-OPS-01. 5S6-FE-01 now depends on 5S8-ART-01.
- **Phase 4:** 18 tasks, all Done (closed at what was built). Its criteria 1–4 are demonstrated by those tasks' tests; the two criteria added today are Phase 5's 14–15.
- **Phase 5:** 50 tasks · 198 days. 5S2-PMO-02 signs off all 15 criteria.
- **References** updated in the spec and the World Contract. The tracker rows moved (Phase 4 to row 22, Phase 5 to row 54) and the Roadmap is updated.
- **Consequence:** no backend task is left for the SponsorX web app in Phases 1–4. What remains is go-live vendor setup (P2-INT-02 Clerk MFA, P2-OPS-04 production Zoho keys) and the frontend.


## rcfworks — 4S9-PMO-03 · Phase 4 acceptance record, as built (Done, signed off)

- **The request:** after the ship-readiness review of Phases 1–4, the user asked for "a Phase 4 sign-off first".
- **New task** `4S9-PMO-03` (Order 52, Sprint 9 · Sign-off) and the record `documentation/SponsorX-Phase4-Acceptance-Signoff.md`, laid out like Phase 2's.
  - **Phase 4 is accepted as built:** criteria 1–4 demonstrated.
  - **The evidence** for each criterion: tasks, PRs and tests. 75/75 Phase 4 tests passed on 2026-10-20 against `08f10a6b`: virtual-registry 12, virtual-bookings 10, virtual-creative 14, virtual-deployment-control 6, infinex-telemetry 6, infinex-auth 11, infinex-clients 5, infinex-config 7, cross-channel-campaign 4.
  - **On staging:** release `1b198d4b`, checked read-only on 2026-10-19.
  - **Signed** by rcfworks with Rodney's delegated authority.
- **Not part of it:** Phase 4's former criteria 5–11 and the two added on 2026-10-20, all now in Phase 5 with their tasks (Phase 5's 7–15).
- **Counts:** Phase 4 is 19 tasks · 62 days, all Done. Tracker row 23; ranges to row 23; Roadmap and CLAUDE.md updated.
- **Local tooling note:** the session scratchpad had been cleared overnight, so the embedded Postgres and the openpyxl venv were reinstalled there.

## rcfworks — P8-PMO-06 · production go/no-go review drafted (In progress, decision pending)

- **The record:** `documentation/SponsorX-Go-No-Go-Review.md`.
- **§37 read from the repo's Blueprint copy** (`documentation/Master/Updated_…Integrated_Athlete_Network.docx`, "37. Developer Go/No-Go Gates"). Each condition is recorded with its evidence, or with its gap and owner:
  - **Before coding Phase 1:** met.
  - **Before the athlete pilot:** not met. Counsel's P0-LEG-01/02 templates, P0-LEG-06 NIL and high-school constraints, P0-LEG-03 guardian e-sign, P0-LEG-04 fan privacy and the pre-pilot privacy review are open. The payout process is partly met: the Phase 1 policy is written, but 2S0-LEG-01 and 2S0-LEG-02 are open.
  - **Before the sponsor pilot:** economics and labels are met; P0-LEG-05 reward terms is open, and 3S0-LEG-01 (attribution wording) keeps Phase 3 attribution on BTG's desks until it closes.
  - **Before Phases 2 and 3:** met. **Before Phase 4:** not applicable (the game is parked).
- **The owner's production switches,** listed: Stripe live (keys, webhooks, `PAYMENT_PROVIDER`, the Connect model), Zoho production keys and intel fields, Clerk Pro MFA, `SPONSORX_EDGE_KEY`, `GEOLITE2_CITY_PATH`, the Resend sending domain, the Phase 3 stage 3 switch, and a production check by someone with access.
- **Recommendation:** no-go for real outside users until counsel answers; meanwhile, production readiness and a BTG-internal dry run. Not signed.
- **Also:** CLAUDE.md's "Open decisions" was stale. The payment policy, residency, email (Resend) and PDF worker were decided weeks ago (P0-PMO-01/02/03/06). It now lists only the open legal questions, plus a "Decided" line and the Stack table's email row. Tracker: P8-PMO-06 In progress, owner rcfworks.

## Legal drafts for counsel, items 1–5 (Google Drive, "SponsorX Legal" folder)

Drafted so counsel has something to approve. Each is marked "DRAFT for counsel review. Not approved for use.", carries a version and date placeholder, matches how the product works today, and marks the decisions counsel must make as **[FOR COUNSEL]**. Once approved, each replaces placeholder text in the web app (a new agreement version, so acceptances are re-collected).

1. **P0-LEG-01** Athlete Content Collaboration Agreement, draft v0.5. Built from the earlier draft. Adds click-wrap acceptance and versions, guardian process and age of majority, how payment is made, who sees athlete data, and account closure. Governing law is still blank.
2. **P0-LEG-02** Campaign Order standard terms, draft v2. Part A is the order schedule; Part B the terms. Open: revision cap, minimum live time, payment timing, and whether the athlete is paid if BTG or the sponsor cancels (the product pays nothing today).
3. **P0-LEG-04** Fan reward consent wording and fan privacy notice. Fixes the delivery-consent contradiction ("not shared with the sponsor" next to the opt-in that shares it). Open: fan email retention period (none in the product), age checks, CAN-SPAM address.
4. **2S0-LEG-01** Marketplace seller and payout terms (Part A) plus sponsor order terms (Part B), draft v2. All fee rates are placeholders. Independent athletes who list items should accept seller terms (today they accept none). "First order reviewed" is replaced by the spending limit.
5. **3S0-LEG-01** Sponsor attribution wording. Proposes dropping "ROI" from the report title and renaming the report's "Media value" to "Cost per 1,000 checked views".

**Product follow-ups found while drafting** (no code changed):
- the /join agreement tick is not recorded on the server, and there is no COLLAB text file;
- no fan-data retention purge;
- property terms acceptance captures no IP or user agent.

**Still to discuss:** items 6–9 (P0-LEG-03, P0-LEG-06, P0-LEG-05, 2S0-LEG-02).

## Fix (3S9-OPS-01): staging health alert "pipeline", a false stale-forecast alarm

- **Alert:** staging `/health` answered 503 at 05:55 UTC, failing `pipeline` with `forecastsFresh: false`. Everything else was ok, including every nightly step.
- **Cause:** the seeded UAT campaign (`sim_3s7int01_campaign`) had its forecast for 2026-10-19 made at 03:55 UTC. That night's run (19:59) correctly made none, because there is one forecast per campaign per day. The health rule "a forecast made in the last 26 hours" then went stale at 05:55 the next morning with nothing wrong. A manual `run-forecasts` earlier in the day would do the same.
- **Fix:**
  - Freshness is now by day: a forecast for today or yesterday (UTC), read as `max(day)` in `system-health.ts`.
  - A night that makes none is still caught, from midnight UTC.
  - Regression test in `pipeline-runs.test.ts` (the exact staging timeline); `health-full.test.ts` updated; doc row in `SponsorX-Pipeline-Monitoring.md`.
- **Checked:** CI steps run locally. Build, lint, security scripts, secrets scan and audit all pass, and the backend suite is 3,465 of 3,465 with none skipped.
- Staging recovers by itself after tonight's run, or as soon as this deploys.

## Legal item 6 (P0-LEG-03): guardian sign-off draft for counsel

- **The draft:** a question and guardian agreement in Drive ("6 - SponsorX Guardian Sign-off …"), recommending click-to-accept as built.
- **Facts it relies on:**
  - Automatic approval of minors was a deliberate decision (2S1-BE-10, 2026-10-01).
  - BTG admins are emailed "was approved automatically" for every approval.
  - The "BTG staff confirm minors" switch already exists if counsel asks for a person to check.
- **Fix to the draft:** removed the promise of an emailed copy of the agreement, because the site doesn't send one.

## P0-LEG-06 redefined; P8-BE-02 and P8-BE-03 built (Code review)

- **Programme owner's decision (2026-10-20):** no state-by-state rules list from counsel ("like putting tabs on every ant on an ant hill").
- **The athlete is responsible for their own school, league and local rules.** The athlete confirms this, or the guardian does for a minor.
- **The built-in limits stay:** sensitive categories, a person reviewing every minor's content, and the athlete's own blocked categories.
- **Forms only when there's a dispute.**

**P8-BE-02, the rules confirmation:**
- `rules-attestation.ts`, wording version `2026-10-20`, served at `GET /public/rules-attestation`.
- **Recorded:**
  - on the application (`rulesAttestationVersion`);
  - on the guardian's agreement step;
  - at `GET`/`POST /me/rules-attestation`.
- A minor's own tick doesn't count, and a minor's own login is refused.
- **Enforcement:** `Tenant.requireRulesAttestation` (in `/signup-rules/settings`, off by default) is checked in `assertMayCommit`, so it covers every accept and list path.

**P8-BE-03, the dispute pause:**
- **The model:** `DealDispute` and `DealDisputeDocument` (migration `20261020120000`, one open dispute per order) and `deal-disputes.ts`.
- **While paused,** `deal-pause.ts` blocks:
  - the deliverable moves and submitting a draft;
  - order moves other than cancelling, and accepting the order;
  - releasing the earning.
- **Earning:** held when the dispute opens. On RESUME it goes back to where it was (APPROVED_FOR_PAYOUT returns as ELIGIBLE). On CANCEL the order is cancelled and the earning stays held.
- **Emails:** `dealDispute.opened`, `documentsIn` and `resolved`.
- **Access:** RBAC §39, resource `dealDispute`.

**Tests and documents:**
- `deal-disputes.test.ts` (13 tests), plus the tenant-isolation sweep, the matrix digest (`c38aba9da7b833e8`), the fact-coverage decisions and the fake transactions in four older tests.
- Updated: the Phase 1 plan, the Legal Work Brief, the Go/No-Go review and the tracker (P8-BE-02 and -03 rows; the P0-LEG-06 row redefined).
- Drive: item 1 is now draft v0.6, adding Section 9 (your own rules) and Section 10 (concerns about a deal). Item 6's guardian agreement gains Section 5 and a second tick box. The older versions are in the Drive trash.

**Frontend still to do (not started; backend only):**
- the tick on `/join` and on the guardian's page;
- the athlete portal prompt;
- BTG's dispute desk;
- the athlete's order banner with the upload.

The switch stays off until the frontend ships.
- **Frontend tasks raised** (Ready, for the teammate): `P8-FE-03` (the rules tick on `/join` and the guardian's page), `P8-FE-04` (the portal prompt and the settings switch), `P8-FE-05` (BTG's dispute desk) and `P8-FE-06` (the paused-deal banner and upload). They're on the tracker and in the Phase 1 plan.
