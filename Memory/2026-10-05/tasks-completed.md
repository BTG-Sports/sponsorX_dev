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

## HeckerCreatives — P1-ART-14 follow-ups

- The board lists 5 live campaigns, down from 8.
- A "See all N live campaigns" row closes the panel. Only roles that may open the Campaigns desk see it.

## HeckerCreatives — P1-ART-15: New sign-ups as the "Intake Stream" (Code review)

The owner asked for /admin/new-signups to get the same wow-factor redesign, with every list paged by the house rule (memory: pagination-pattern). The layout was picked in the visual companion: A, "Intake Stream". Spec: `docs/superpowers/specs/2026-10-05-new-signups-intake-stream-design.md`. Branch `feature/P1-ART-15-new-signups-stream`, stacked on P1-ART-14.

- **Backend: `GET /signups/stream` and `/signups/stream/summary`** (`domain/signups-stream.ts`, pure merge in `signups-stream-rules.ts`).
  - There are six sources, each a Prisma query under `whereFor` with one real sort column:
    - athletes, by `createdAt`;
    - verified guardians by `verifiedAt`, and rejected ones by `rejectedAt`;
    - approved sponsors by `decidedAt`, and held ones by `createdAt`;
    - organisations, by `submittedAt`.
  - For page p: count everything, clamp, read p·size keys per source, merge newest first, slice, then load only that page's ids with the desks' own row builders. Those builders are now exported from `signups-desk.ts`, `sponsor-requests.ts` and `onboarding-profile.ts`. The old endpoints are unchanged.
  - No raw SQL, so every read stays under the P8-SEC-02 static check (`tenant-scope:` notes inside each call).
  - The filters run in the database: `kind`, `review=1` (the desks' own held rules) and `q`.
- **Tenant isolation flagged `/signups/stream`.** It shows tenant A's admin the outside organisation's onboarding row. That row is tenant A's own, already shown on `/onboarding/signups`, so the test's allowlist now includes the stream, with that reason written beside it.
- **Test gotcha:** test tenant AND row/user ids must be unique across test files. My first `ss_btg` / `ss_admin` / `ath_held` collided with `phase2-seller-summary.test.ts`, and `suite-isolation.static` caught it. Everything is now prefixed `sst_`.
- **Test DB was stale (`ColumnNotFound`).** `npm run db:test` rebuilt it.
  - Full backend suite: 161/165 files.
  - Remaining failures, not caused by this work: `next-edition-e2e` fails the same with these changes stashed, and `sql-rules-in-migrations` hits Windows `spawnSync npx ENOENT`.
- **Frontend:**
  - `components/intake-stage.tsx` (hero, rows) and `intake-fx.tsx` (KindChips, ReviewToggle on `useListNav`).
  - The house `PagerRow` / `ListSearch` / `PendingList`.
  - `lib/new-signups-live.ts`: `streamParams` (maps legacy `?tab=`), `streamApiQuery`, `streamRowView`, `intakeHeadline`, all tested.
  - The page moved to `(stream)/` for a dark loading screen.
  - Sensitive edits are paged on `epage` / `esize`.
  - `OpsGround` takes a `word` (INTAKE).
  - `.sx-ops` now re-pins `--sx-admin` and the status colours, because the house pager's admin tone was light-theme slate on the dark stage.
- **Restarted the dev API on :4000.** The owner's `npm start` (combined.mts) doesn't watch, so the new routes 404'd until it was restarted with the same command.
- **Verified:**
  - Frontend 1152 tests, eslint, `next build` (worktree).
  - Backend stream tests 8/8, tenant-isolation, tenant-scope.static and openapi.coverage.
  - Playwright walk as BTG_ADMIN: chips, toggle, legacy `?tab=review`, search, size; dark, light and 390; no console errors, no overflow.
  - rimraf was emptied again by the worktree teardown and restored.

## HeckerCreatives — P1-ART-16: /admin/applications as the "Scouting Board" (Code review)

The owner asked for the review desk to get the same treatment. Direction A, "Scouting Board", was picked from three mockups (`.superpowers/brainstorm/applications/`). Spec: `docs/superpowers/specs/2026-10-05-applications-scouting-board-design.md`. Branch `feature/P1-ART-16-applications-scouting-board`, stacked on P1-ART-15.

- **Visual only.** `applications-desk.tsx` had markup and classes changed; its logic, server paging and review actions are untouched.
  - Tabs became stage pills.
  - The list became a grid of glass player cards: score ring, safeguard chips, and a 48-hour bar (`waitMeter`, tested) that turns orange past 48h.
  - `OpsStage` now writes `--rx` / `--ry` on `[data-tilt]` cards, so they tilt toward the pointer.
  - The drawer's portaled root pins `.sx-ops`, so it stays dark for Frost users. It also got a glowing factor bar (role=meter) and restyled buttons.
- **OWNER FEEDBACK, mid-build:** "don't make the design like a landing page or a hero section, this is a dashboard."
  - The 64px headline and the dek were replaced by a compact title row plus four KPI tiles (`KpiTile`, now shared in `ops-stage.tsx`).
  - The same was then applied to /admin/new-signups at the owner's request (`IntakeHeader`; `intakeHeadline` removed).
  - `OpsGround word=""` drops the outlined word.
  - Saved as Claude memory "admin-desks-are-dashboards". /admin itself still has its hero, so ask the owner before changing it.
- **The e2e contract held:** each card is still the row `<button>`, named with the athlete's name, and the `Minor` text is exact. The dialog's label and button names are unchanged.
  - `loop-p3-application`: the adult path (desk → drawer → start review → approve → activate) passes.
  - The minor path fails at line 223, on the public join page ("Waiting on your guardian"), before it reaches the desk. Not caused by this work.
- **Verified:**
  - Frontend 1153 tests, eslint, `next build` (worktree).
  - Walk as BTG_ADMIN: 12 cards, tilt, drawer dark in light theme, 390 with no overflow, no console errors.
  - rimraf restored again after the teardown.
- **Tracker:** P1-ART-16 is Phase 1 row 292 (Order 32.99, Code review); ranges extended to 292; today's snapshot recomputed.

## HeckerCreatives — P1-ART-17: sign-up rules as the "Control Panel" (Code review)

The owner asked for /admin/new-signups/rules in the same structure. Direction A, "Control Panel", was picked (`.superpowers/brainstorm/rules/`). Spec: `docs/superpowers/specs/2026-10-05-signup-rules-control-panel-design.md`. Branch `feature/P1-ART-17-signup-rules-control-panel`, stacked on P1-ART-16.

- **Dashboard header:** a back link, the title and four tiles. The minors rule became a designed `role="switch"`. The place form got mono-caps codes, an age stepper (14–25, arrow keys), and Remove with a confirm.
- **Owner feedback during the build:**
  1. "put a highlight on the edit panel… you're just scrolling up", then "the hint is still not noticeable". The fix has six parts:
     - a glow on a wrapper, because the panel's chamfer clip-path cuts its own box-shadow;
     - a two-beat pulse (`.sx-ops-flash`);
     - a bold callout, "Editing Alabama, United States — adult at 19", with numbered steps and a Cancel;
     - a ringed age stepper;
     - the picked tile or chip kept lit (`aria-pressed`);
     - a live region.

     Saved as Claude memory "scroll-to-needs-a-loud-cue".
  2. "what if there are more countries and more state/provinces?" The first cut tiled every place: 3,786px tall with 85 places, growing without bound. It now has:
     - a search across every country, by code or name. Country names come from `Intl.DisplayNames`; `lib/region-names.ts` names the US, CA, MX, AU, BR and IN subdivisions.
     - a country rail that scrolls inside its own panel;
     - one country at a time: exceptions as tiles, places that follow the default as chips, capped at 40 with Show all.

     The page now stays about 1,345px whatever the count.
- **Data note:** PR (Puerto Rico) appears both as a US region and as its own country row in the dev table. Both are shown as they are.
- **Verified:**
  - Frontend 1162 tests, eslint, `next build` (worktree).
  - Walk as BTG_ADMIN: search → Enter → callout; Remove armed then kept; rail switch and the Not 18 filter; chip → form; saving MD unchanged ("Saved. 0 athletes worked out again."); 390 with no overflow; no console errors.
  - Two React key warnings were found and fixed during the walks: a server element passed into a client slot needs a key, and sibling elements were sharing `key={pulse}`.
  - rimraf restored after the teardown.
- **Tracker:** P1-ART-17 is Phase 1 row 293 (Order 32.995, Code review); ranges extended to 293; today's snapshot recomputed.
- **P1-ART-17 follow-up (owner):** "why do you still have that show all 48, what if you did is list the items 20 items per page, make the items large, add more detail on each items?"
  - The exceptions tiles and the following chips are now ONE list of large cards: code badge, name, age, a status line against the default, and a history line ("Default table" / "BTG staff" · date, from `updatedBy` / `updatedAt`).
  - Exceptions come first, then All / Exceptions / Follow the default tabs.
  - The list shows 20 per page with the house `Pagination` above (with "Showing x–y of n") and below. It is client-side, because the table is bounded. The fixed 20 is the owner's number, not the usual 12/24/60.
  - The bottom pager scrolls back to the top of the list.
  - New helpers `placeList`, `placePage`, `statusWords`, `changedWords`, with tests. Frontend 1164 tests.
- **P1-ART-17 follow-ups (owner):**
  - **Equal heights:** "make the item list panel and the country list panel have the same height". From lg the rail is pinned (absolute, inset 0) to its grid cell, so the country panel sets the row height (34rem floor) and the rail's list scrolls inside. Measured 958/958 (US), 544/544 (BR), 713/713 (CA).
  - **The editor is a popup with real places:** "this is better if this is a popup… what if I put xyz since this is a free input, it should be dropdown and listing all of the available countries in the world".
    - `components/place-dialog.tsx` replaces the inline form: one modal for adding and changing, with the house `useDialogFocus` contract, portaled with `.sx-ops`.
    - Country is a designed searchable `ComboBox` over all ISO 3166-1 codes (`COUNTRY_CODES` in `lib/region-names.ts`, named by `Intl.DisplayNames`).
    - State is "Whole country" plus the known subdivisions (US/CA/MX/AU/BR/IN), else whole country only.
    - Options already in the table say "in table · N", and choosing one switches the dialog to changing it.
    - A change closes the dialog and is announced on the board.
    - The minors switch is now a full-width panel.
    - Walk: Add → "germ" → Germany (already in table) → Mexico/Jalisco → "Add JAL, MX" (not saved); Esc closes; a card opens "Alabama, United States"; focus returns to the card; saving Maryland via search worked; 390 fine; no console errors.
    - New helpers `countryOptions`, `regionOptions`, `filterOptions`, with tests. Frontend 1167 tests.
