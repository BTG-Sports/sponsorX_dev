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

## HeckerCreatives — P1-ART-14: /admin as the "Mission Control" stage (Code review)

The owner asked for the admin dashboard to get the landing's wow factor. Scope is `/admin` only: the shell and the other desks are unchanged. Picked in the visual companion: direction A "Mission Control", full bleed. Spec: `docs/superpowers/specs/2026-10-05-admin-ops-stage-design.md`. Branch `feature/P1-ART-14-admin-ops-stage`.

- **What it is:** a fixed-dark HUD stage in both themes, bled to the edges of the content column (negative margins cancel PortalShell's `<main>` padding).
  - Ground: reuses /login's light, depth, motes and ping, plus /packages' floor and outlined word ("OPS").
  - Hero: a scrambled eyebrow with the Postgres pill, the headline "N things need / BTG's hand today.", and an action ring (each queue's share).
  - Chamfered glass queue cards with count-ups, lit brackets and a pointer spotlight.
  - Campaign progress bars and Systems status lights.
- **Files:**
  - `components/ops-stage.tsx` (server) and `components/ops-fx.tsx` (OpsStage pointer vars, OpsCount).
  - CSS in the `.sx-ops` block at the end of `globals.css`.
  - The page moved to `app/(app)/admin/(board)/page.tsx`, a route group, so it has its own dark `loading.tsx`. The URL is still /admin.
- **No new figures.** New pure helpers in `lib/ops-board-live.ts`: `boardHeadline`, `ringSegments`, `QUEUE_TONE`, `CampaignLine.pct`. All are tested in `tests/gap-screens-live.test.ts`.
  - A role with no card of its own gets no ring and no count, rather than "All clear".
  - Links to desks the role can't use are hidden.
- **Entrance is plain CSS animation**, not `html[data-sx-loaded]`: the portal has no boot screen, so the landing's transition rules would never release. `ScrambleText` gained `immediate`.
- **Verified:**
  - Frontend tests 1147/1147, eslint clean, `next build` green in a detached worktree.
  - Playwright walk as BTG_ADMIN and FINANCE (e2e keys p7.admin / p7.finance): dark, light, 1440 and 390, reduced motion. No console errors, no x-overflow.
  - The phone ring label wrapped after a fix.
- **Environment gotcha:** `node_modules/rimraf` in the main checkout was EMPTY (since 2026-10-02). That broke `next build` ("Can't resolve 'rimraf'" via exceljs) and `/athlete/earnings` on dev. It was restored from `rimraf@2.7.1`, the lockfile's version. The worktree teardown emptied it again, and it was restored again. Check it after any worktree build.
