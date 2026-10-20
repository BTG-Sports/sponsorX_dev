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
