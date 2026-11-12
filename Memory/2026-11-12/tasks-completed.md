# 2026-11-12

## Tester support message, and the support and help desk plan (rcfworks)

- **What happened.** On 2026-11-10 a staging tester sent two identical messages through the staging Contact page: "Need full access to complete test run".
  - They reached infinex1's Gmail because support@sponsorx.net is only a Cloudflare forward there (set up 2026-10-07; it has no mailbox or password and can't send).
  - Rodney forwarded the "New sponsor: Midwest Running Co needs your review" email asking whether it was real, and for his login.
- **What staging showed.** Read-only queries; production reads were blocked in this session.
  - **Athlete sign-up** (softball, Plata High, MD): held. The ID "doesn't read like a government ID", and the date of birth on the account isn't on it.
  - **Sponsor brief** "Midwest Running Co" (SponsorX Test Drive): held. The proof of business PDF has readable text but doesn't name the business. It also made a Zoho CRM lead (7554807000013348002).
  - "Midwest Running Co" isn't a real business that we could find; it's made up for the test.
- **Replies drafted** (plain text, sent by the user from Gmail):
  - **To the tester:** both sign-ups approved so they can finish (the user approves them on staging: /admin/new-signups/athletes/cmwaxn32j00jz0cqignvgxyup and /admin/sponsor-requests/cmwaybrju00kl0cqisybjkn43).
  - **To Rodney:** it's a test. His admin logins (rcarr@icarrefound.org) exist on both sites since 2026-10-29. Use "Forgot password?" if the temporary-password email is lost.
- **Plan agreed with the user: Polish group G (items 41–43), six rows Ready on the Polish sheet.**
  - **POL-BE-41 / POL-FE-41, Support inbox:**
    - statuses;
    - replies written in SponsorX and sent from noreply@;
    - the support@ email shrinks to a notice;
    - the sender's records and their problems shown beside each message.
  - **POL-BE-42 / POL-FE-42, "What's wrong" tags** on held sign-ups, sponsor requests and organisations, in lists and pages.
  - **POL-BE-43 / POL-FE-43, help desk form:** pick a topic, tick cases, Submit; "Other" opens the message box.
  - IDs follow polish.md's rule (number = item number), so the backend rows are 41–43, not the 37–39 first mentioned in chat.
  - **Decided (later the same day):** all six rows are rcfworks', front end included; people can tick more than one case; replies go by email only (no conversation page).
- **New doc:** `documentation/SponsorX-Helpdesk-Cases.md`.
  - 380 cases in 8 topics: Account 90, Payments 79, Guardians 63, Campaigns 58, Shop 49, Rewards 23, NEXT 17, Other 1.
  - Each case is matched to the code that causes it (main_development `db34ceb7`).
  - 69 cases have no admin page to fix them. They're listed under "Gaps" and are not part of 41–43.
- **Gaps worth raising separately (not yet on the board):**
  - campaign earnings can't be moved from any page (admin/finance is view only; VOIDED can't be shown);
  - no page to give a login or change an email;
  - closed users are told "isn't set up";
  - replacing a guardian is API-only;
  - no fan lookup;
  - nothing starts a campaign's final report.
- **Tracker:** Polish rows 62–67 added (Order 58–63, stage 7 "G · Support and help desk"). Autofilter, the Status list and the colour ranges now reach row 67, and the header says 63 tasks across 43 flaws.

## Wrap-up

- No board tasks moved to Done today: the day was the tester's support message and planning Polish group G.
- **Stage Progress:** 2026-11-12 row appended. 318 Done, 15.5 days left, same as 2026-11-11.
- **Next:** POL-BE-41 (support inbox, backend), once the plan PR is merged. Then 42 and 43, then the three front-end rows.
- **Waiting on the user:** approve the tester's two staging sign-ups, then send the two drafted replies (to the tester and to Rodney) from Gmail.

## POL-FE-39 and POL-FE-40 (HeckerCreatives), on `fix/POL-FE-39-40-clean-pass`

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

## Live QA walk of every frontend page (HeckerCreatives)

- **How:** a Playwright crawler (scratchpad, rebuilt from the pattern in the
  memory notes) signed in as each QA login with a Clerk sign-in token and
  crawled from the seeded routes through every same-portal link, scanning
  `innerText` plus `title` / `aria-label` / `placeholder` attributes for
  section signs, task IDs, Phase/Stage talk, internal words, "not wired",
  "Demo data", "Sample data" and error pages. Eight roles: signed-out,
  admin, athlete, sponsor, finance, advisor, student, property.
- **Coverage:** 472 pages in the first pass (admin capped at 140), then an
  admin re-walk of 337 pages that reached every detail route (offers,
  payouts, sponsor requests, onboarding, deal disputes, delivery issues,
  new sign-ups, payment disputes, campaigns, forecasts, pricing). Every
  page answered 200 except `/r/DEMO_TOKEN` (no such token locally).
- **Found and fixed (commit on the same branch):** the test-provider badge
  on the athlete and property money and settings pages and the stand-in
  provider's banner said "staging only" (`order-payment-live.ts`,
  `payouts-live.ts`); the live revenue-splits blurb for the student pool
  still carried "(§5.5)" (`editions-live.ts`). All three are strings in
  libs the static scanner doesn't treat as copy.
- **Seen and left, with the reason:**
  - "Standin" / "standin · evt_standin_…" on `/admin/payments`,
    `/finance/payments`, payment events and disputes: the provider's name
    from the API. Local and staging run the test provider; production runs
    Stripe, so it reads "Stripe" there.
  - `http://localhost:3000/s/JORDAN-NS` on `/next/code`: the student's
    link is built from the current origin, so production shows the real
    host.
  - "QA walk data (P1-ART-22)" on athlete listing previews and the sponsor
    shop: listing descriptions a previous walk seeded into the local DB,
    not UI copy.
  - A signed-out visit to `/finance/payouts` logs "Not signed in." from
    `apiFetch` before the layout's redirect to `/login` lands (307). Noise,
    pre-existing, no page affected.
- Nothing else: no "Phase 1/2", "Stage 9", "Not built yet", "not wired",
  "Demo data" or "Sample data" on any rendered page for any role.

## Second QA walk: every page plus everything that opens on it (HeckerCreatives)

- **How:** the crawler (`crawl2.mjs` in the session scratchpad) now also scans
  hidden pre-rendered text and `<option>` labels, then clicks every opener
  that does not change data (user menu, filters, per-page and sort menus,
  tabs, accordions, row drawers, wizards, full-screen dialogs, validation
  summaries) and scans what appears: `role=dialog`/`alertdialog`, menus,
  listboxes, tooltips, tab panels, `role=status`/`alert` toasts, open
  `details`, popovers, and any new text. Buttons that navigate add their
  target to the queue, which reached about 800 pages links never did.
  Openers that mutate (approve, pay, delete, sign out, submit …) are never
  clicked; the local DB is unchanged.
- **Coverage:** 770 pages, about 7,700 clicks, about 6,300 popups, drawers,
  menus and panels (about 400 dialogs and drawers) across signed-out, admin
  (400, the cap), sponsor, finance, athlete, property, advisor and student.
  Every page 200 except `/r/DEMO_TOKEN` (no such token locally).
- **Found:** nothing new. Every popup, drawer, menu, tooltip and panel is
  clean for section signs, task IDs, Phase/Stage talk, "not built", sample
  banners and error pages. The only hits are the three data items already
  noted above (the local "standin" provider name, the origin-based
  localhost sales link, the seeded "QA walk data (P1-ART-22)" descriptions).
- **Harness notes:** the athlete deliverables calendar is a button per day,
  each a new `?month=&day=` URL; the first athlete run walked 269 days in
  four hours before being stopped, and the crawler now collapses `month`,
  `day` and `page>3` to one page. Click timeouts on `/admin/rewards/new`
  and `?open=` drawer pages are the dialog's backdrop correctly covering
  the page behind, not a defect.

## Landing page, looked at by hand after the second walk (HeckerCreatives)

- Desktop and phone widths, loader allowed to finish, every link listed,
  the three package cards and the phone menu opened, the page scrolled to
  the end; text, tooltips and the console all clean.
- **Fixed:** the hero's network figure read "1 Campaigns delivered".
  `lib/network-stats.ts` now gives each figure singular words for a count
  of one ("Campaign delivered", "Fan reward redeemed", …), with a test.
- **Seen and left:**
  - At phone width under `next dev` the Next dev-tools badge
    (`devIndicators.position: "top-right"`) sits on the hamburger, so the
    menu can't be tapped in dev; remove `nextjs-portal` and it opens.
    Production has no badge. Not changed — the position was chosen on
    purpose, and the fix is a one-line config call for the owner.
  - "Watch Our Story ▶" (`landing-close.tsx`) links to `#how-it-works`;
    there is no video on the page. Design wording from P1-ART; raised, not
    changed.
  - Nav labels read "HomeHomeHome" in extracted text: an `sr-only` copy
    plus two `aria-hidden` animation layers, so assistive tech reads each
    once. Not a defect.
