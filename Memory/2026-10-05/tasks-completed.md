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
