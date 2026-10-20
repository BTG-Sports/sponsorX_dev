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

