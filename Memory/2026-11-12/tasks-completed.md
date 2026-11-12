# 2026-11-12 — tasks completed

### POL-FE-39 and POL-FE-40 (HeckerCreatives), on `fix/POL-FE-39-40-clean-pass`

The second half of the clean pass raised 2026-11-11 (section F of
`documentation/polish.md`). Both at **Code review** on the Polish sheet
(rows 60–61), awaiting a PR; the branch is pushed with two commits, one per
task.

- **POL-FE-39, public pages, menus and the route map.**
  - `/packages`, `/about`, `/how-it-works`, `/join`: no "Phase 1" or "no
    self-service checkout until Phase 2". They say sponsors can send BTG a
    brief or buy listings in the marketplace and shop by card; campaign
    earnings are paid by BTG Finance outside SponsorX; shop and marketplace
    payouts go through Stripe. The `/packages` hero eyebrow said "Phase 1";
    it now says "BTG Sports Group".
  - Property page, brief flow and athlete profile lose their section signs.
  - `/map` is a 404 in production: `frontend/src/lib/route-map.ts` exports
    one flag (`NODE_ENV !== "production"`), read by the page, the footer
    (`site-chrome`), the portal sidebar (`portal-shell`) and both mobile
    sheets (`mobile-nav`). e2e still visits `/map` because Playwright runs
    `next dev`. The unused `ScreenStub` component is deleted.
  - Menus: the "Not built yet" tooltip reads "Coming soon", and the two
    inert entries that used it (advisor Roster, property Campaigns) are
    dropped. The portal header's inert Notifications and Help icons are
    removed, with their `TopIcon` helper.
- **POL-FE-40, admin desks, sponsor and NEXT screens.**
  - `components/not-in-role.tsx` gains `isSignedIn()` and `RoleCannotSee`:
    a page's sample branch checks the first and renders the second
    ("Not in your role — Your role can't see …. Ask a BTG admin."), so in
    production a signed-in person never sees sample figures. Used on the
    sponsor campaign, results, request and shop pages. The sample media
    listing (`/sponsor/marketplace/[jobId]`, fixtures only) tells a
    signed-in person "Not available yet" instead.
  - The admin desks already routed a staff role the desk isn't for to
    `NotInRole`, and their live reads cover every other signed-in role, so
    their sample branches reach only visitors; the banners now say "Sample
    figures — sign in as … to see the real …".
  - Wording: no section signs, task IDs, "Stage 9" or "Phase 1" on the
    admin desks, NEXT admin pages, NEXT student and advisor screens, reward
    creator and desks, analytics story and report, matching studio or
    fixtures. Disabled buttons say "isn't available yet". "waitlist not
    wired" is "Sold out"; the guardian agreement's draft badge reads
    "Draft — not the final wording".
  - Also fixed, outside the list: the athlete earnings notes
    (`lib/earnings-report-data.ts`) still said "Phase 1 tracks earning
    status only"; the admin marketplace order page said "staging only".
- **Checks:** frontend build, lint and all 1,957 unit tests pass. The
  scanner's remaining 9 lines are false positives (CSS class names
  containing "placeholder"/"todo", the intelligence pages' deliberate
  "(simulated)" labels, the development-only engine preview); none is on
  either task's pages.
- **Tracker:** POL-FE-39 and 40 at Code review, Date Started 2026-11-12,
  owner HeckerCreatives, notes appended. Stage Progress row 2026-11-12
  appended (unchanged from 11-11: 318 done, 15.5 days left; the Polish
  sheet is not in the stage counts).
- **Still to do:** open the PR, merge, then flip both rows to Done and
  mirror the Google Sheet.
