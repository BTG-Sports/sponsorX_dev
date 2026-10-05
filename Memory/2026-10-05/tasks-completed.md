# 2026-10-05

## rcfworks — tester facility and walkthrough presentation (separate projects, outside this repo)

- **Tester facility:** `../sponsorX_tester_facility`, its own git repo, local only, with no remote. It is an admin page plus a small backend that create SponsorX test accounts directly in an environment's database and Clerk, the owner's choice of option (b). That means no app change: accounts skip Zoho sync, and app emails to them will bounce.
  - **Hosted on Railway staging:** the `tester` service, at https://tester-staging-8074.up.railway.app.
    - Per-person logins (`TESTER_USERS`) for infinex1, infinex2, rcarr and chantelleicarre.
    - Passwords are in the staging `tester` service variables (`TESTER_PW_*`); they were generated straight into Railway and never shown.
    - A `/data` volume holds the registry and log. Every action is logged with the operator's email, and writes `testAccount.*` audit rows.
  - **Sign-in:** "Sign in as" uses one-time Clerk sign-in tokens, so no inbox is needed.
  - **Kinds:** BTG staff, sponsor, adult athlete, minor athlete with guardian, team, advisor, student, and a story set.
  - **Production is not connected.** The production DB is unreachable from the staging service, and opening it to the internet was blocked by the safety system. The owner decided staging-only is fine for now. The options, if it's ever needed: a second tester service inside production, or public networking on Postgres-production.
- **Walkthrough presentation:** `../sponsorX_presentation`, local git only.
  - A client-only animated deck that plays over the REAL SponsorX pages, captured as static HTML (scripts stripped) from a local stack seeded with the story data. The capture can be re-run from `capture/`.
  - Part 1 "Everyone joins" is trimmed to 21 slides. Next pulses and glows once a slide's animation finishes.
  - **Findings for the app:**
    - "Coffee" isn't a business type (it's filed as Other, then Restaurant).
    - Stale copy: "BTG verifies every organisation…" on the application page, and "BTG has opened a sponsor account" in the account email.
    - An overlap on the athlete home ("Coming up" over "Offers waiting").

## Phase 2 Sprint 8 backend close-out (rcfworks)

- **2S8-QA-05 · Done.** Three robustness gaps:
  - Same-name applicants no longer collide on the athlete slug. The insert retries under a savepoint (`athlete-slug-race.test`, 6 concurrent same-name applications).
  - `seed-personas` runs on a used database. It picks a free slug and skips on an email clash (`pilot-school.test`).
  - `GET /payouts/me` adds `balanceCents`, `owedBackCents` and `owedBackNote`, and the athlete and property payout pages show money owed back after a refund. Netting money owed back against future payouts is unchanged; that is a policy choice.
- **2S8-OPS-02 · Code review.**
  - The new migration `20261005100000_utc_time_zone` sets the database to UTC and redefines `adslot_guard_sale` to use UTC.
  - `expire-invitations` uses `now() AT TIME ZONE 'UTC'`.
  - The Prisma and worker pools force `TimeZone=UTC`, and docker-compose and CI are pinned.
  - `utc-session.test` passes under Manila and Los Angeles sessions.
  - **It moves to Done after the next staging and production deploy applies the migration.** Staging's DB has no public URL, so it can't be checked from a laptop.
- **Suite:** 2675 of 2677 pass. The only failures are `next-edition-e2e` clauses 4–5, which were already failing on main; they are part of 2S8-QA-01's "CI green" work.
- **2S8-QA-01** (the end-to-end marketplace suite and a green CI) and **2S8-SEC-02** (OWASP review, dependency scan, secrets rotation) are in progress.
