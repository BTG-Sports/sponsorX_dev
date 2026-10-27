# 2026-10-27 — tasks completed

> The day's earlier work on this branch (Get Started skips the sign-in page; /get-started redesigned) is logged under 2026-10-26's P8-FE-09 section, where it was started.

### /how-it-works built (the user's request: "finish the how it works page, design it based on the design you did on the other pages")

- **Before:** the nav's "How It Works" was inert text (`pending` in `site-nav.tsx` since 2026-09-30). The landing's basketball stop (`landing-steps.tsx`) is only the four-card teaser.
- **New:** `app/(public)/how-it-works/page.tsx` and `components/how-it-works-stage.tsx`, built on the /packages and /get-started parts (`Glass`, `chamfer`, `Eyebrow`, `SectionHead`, `StepRule`, `InsideBand`, `PackageGrid`, `StageReveal`, `Magnetic`, `ScrambleText`, `TiltSpot`).
  - **HowHero:** "Brands Brief. / Athletes Deliver. / Fans Redeem.", buttons to `#loop` and `#sides`, and "The Loop" card: sponsor → BTG → athlete → fan as pinging nodes on one clockwise ring, with a legend.
  - **InsideBand:** the §39 loop, application to sponsor report.
  - **LoopTrack:** six stops on the glowing track (vertical below lg, as JoinPath), each tagged with its sides.
  - **SideCards:** sponsor orange, athlete blue, team or venue green, fan yellow. Each card has four steps and a CTA (`/brief`, `/join`, `/onboarding`); the fan card has no account, so it shows "Just scan".
  - **Safeguards:** conflicts, minors, `NEVER_ASKED`, and reports from tracked events.
  - **HowClose:** "Get started" (`/get-started`) and "Talk to BTG".
- **Copy reuse:** `JOIN_MINUTES`, `REVIEW_DAYS` and `NEVER_ASKED` are imported, and the brief's and property application's promises are repeated as written there. The page is static, with no figures.
- **Also updated:** `get-started-stage.tsx` now exports `RunnerIcon`, `MegaphoneIcon` and `StadiumIcon`. The nav item is live (comment updated), and `/how-it-works` was added to `page-transition.ts`, its test, the route map, and `e2e/public.spec.ts`'s sweep.
- **Checked:**
  - Playwright on the owner's `next dev` (system Chrome, because the Playwright browser cache is out of date) at 1440 and 412: no horizontal overflow, the nav marks the page current, 0 console errors.
  - The first run showed a hydration mismatch. The dev server had a stale server compile of `site-nav.tsx` (it was still SSR-ing the inert span), and touching the file cleared it. That was not a code bug.
  - tsc and eslint are clean, and `tests/page-transition.test.ts` passes 16/16.
- **Not done:** no production build, because the owner's dev server is live. The work is uncommitted on `fix/P8-FE-09-dry-run-screen-findings`.

### Device-matrix QA of the frontend (the user's request: "QA test the frontend on all devices")

- **Scope.** 464 page loads: 154 public (14 routes × 11 viewports, 320px iPhone SE → 2560px), 165 signed-in portal (33 routes across all 7 roles × 5 devices), and 108 on real WebKit/Safari (public + every portal route on iPhone SE and iPad Mini), plus a 37-load re-check of the fixes. Run on the owner's `next dev` with the QA Clerk users (sign-in tokens).
- **Each load checked:** HTTP status, error text, console and page errors, 5xx responses, horizontal scroll and the element causing it, visible text running off-screen, broken images, tap targets under 24px on touch, and a screenshot. Contact sheets per device were reviewed by eye.
- **Clean everywhere:** no crashes, no 4xx/5xx, no console errors (Chrome), no broken images, no horizontal scroll on any public page.
- **Fixed (six, all verified at 320px in Chrome and Safari, desktop unchanged):**
  - `/advisor` and `/advisor/review` scrolled 30px sideways at 320px: Approve / Request changes / Decline ran out of the card. `live-advisor.tsx` action column now `max-w-full`, so the buttons wrap.
  - `/admin` scrolled 17px sideways at 320px, from two causes: the board's grid had no column template, so a section grew to its min-content (now `grid-cols-1` + `[&>section]:min-w-0`), and the "By queue" KPI tile left its list 0px beside the 96px ring (`ops-stage.tsx`: stacks below `sm`).
  - Athlete portal rows (`ArenaRow`, `arena-stage.tsx`) gave titles 46px at 320px ("Pre-e…"). The title now keeps 7.5rem and the right slot wraps to its own line.
  - Athlete KPI figures (`ArenaTile`) were clipped at 320px ("$1,400.(" on Earnings). The plate is now a size container and the figure scales `clamp(17px,13cqw,28px)` below `sm`.
  - `/brief` and `/join` in phone landscape (844×390): the sticky action bar covered all but one line of the step. Both bars are now `static` at `max-height:500px`.
- **Found, not changed:**
  - **Soft 404s:** `/athletes/<unknown>`, `/properties/<unknown>` and `/next/<unknown>/<unknown>` return 200 with the not-found UI. This is Next's documented behaviour when `notFound()` fires after streaming begins (`(public)/loading.tsx`), and the page carries `<meta name="robots" content="noindex">`.
  - **Stale route-map demo links:** `/athletes/demo-athlete`, `/properties/demo-property`, `/athlete/orders/demo-order` and `/sponsor/campaigns/demo-campaign/report` show "doesn't exist / not found" against live data.
  - **Safari console:** every page logs "frame-ancestors ignored in a report-only policy". It is repeated there deliberately (`next.config.ts`) and is already enforced by the real CSP and X-Frame-Options.
  - **Tap targets** under 24px: the footer links (17px, 25px pitch) and isolated text links pass WCAG 2.5.8's spacing exception. The landing's compact phone footer (about 19px pitch) and the sponsor "?" help buttons (16×16) do not.
  - **The landing's 3D city** never finished loading in headless browsers (software GL), so it was not assessable here.
- **Harness traps:**
  - Chromium emulating an iPhone or iPad (Safari UA) loops Clerk's dev handshake three times and lands deep links on the portal home. Real WebKit does not, so it is not a product bug; test Safari-UA devices on WebKit.
  - Use `@playwright/test` (1.56.1) from the repo root, not `playwright` (1.63, a transitive dependency), to match the installed browsers. WebKit was installed to `ms-playwright/webkit-2215`.
- **Checks:** tsc and eslint clean; frontend 1,712/1,712. Not production-built (the owner's dev server is live). Uncommitted on `fix/P8-FE-09-dry-run-screen-findings`.

### /about built (the user's request: "finish the about page, make sure the design is the same as the other pages")

- **Before:** the nav's "About" was the last inert item (`pending` in `site-nav.tsx`). No page existed.
- **New:** `app/(public)/about/page.tsx` and `components/about-stage.tsx`. It is built from the same parts as /how-it-works, /get-started and /packages (`Glass`, `chamfer`, `SectionHead`, `StepRule`, `InsideBand`, `PackageGrid`, `StageReveal`, `Magnetic`, `ScrambleText`, `TiltSpot`), on the same fixed-dark media ground.
  - **AboutHero:** "Real Athletes. / Real Partnerships. / On Record." with buttons to `#values` and `/contact`. Its "On Record" card shows three ledger entries (promised → delivered → proven) on a glowing spine, each with a pinging icon.
  - **InsideBand:** a "What we stand for" marquee (`VALUES_BAND`).
  - **Story:** three before → now cards (follower counts → audience fit; athletes guessing → their choice and visible earnings; uncheckable results → tracked events).
  - **Values:** four tone cards (fit over followers, the athlete decides, minors reach a person, real numbers only), in SideCard's shape with no CTA.
  - **Desks:** BTG's four desks (§10: Athlete Network, Admin, Content Approval, Finance) on the hexagon track, vertical below lg. Below them is the note that minors, sensitive categories and price floors always reach a person.
  - **Programmes:** SponsorX (→ /how-it-works, /packages) and SponsorX NEXT (→ /next/about, /next/schools). The NEXT copy comes from next-about-stage.
  - **AboutClose:** "Got a question? A person replies.", linking to /get-started and /contact.
- **Copy:** no names, no figures, no postal address (`BTG_POSTAL_ADDRESS` is still a go-live switch). "Athletes apply for free" was drafted and then cut, because nothing on the site says it.
- **Also updated:**
  - `how-it-works-stage.tsx` now exports `TargetIcon`, `QrIcon`, `ShieldIcon`, `GuardianIcon` and `PulseIcon`.
  - The nav item is live. No nav item is `pending` now; the support for it is left in place.
  - `/about` was added to `page-transition.ts` (label "About"), its test (plus an `/abouts` look-alike), the route map and `e2e/public.spec.ts`'s sweep.
- **Checked:**
  - Playwright on the owner's `next dev` (system Chrome) at 1440, 412 and 320: no horizontal scroll, the nav marks About current, 0 console errors.
  - At 320 the record card's title wrapped. Its side label now hides below 360px.
  - tsc and eslint are clean, and `tests/page-transition.test.ts` passes 16/16.
- **Not done:** no production build (the owner's dev server is live). The work is uncommitted on `fix/P8-FE-09-dry-run-screen-findings`.

### Device-matrix QA, second pass (the user's request: "QA test the frontend on all device"), after /about

- **Scope:** 1,751 page loads on the owner's `next dev`. Sign-in used Clerk tokens for all 7 QA roles.
  - 1,221 loads in the main run: every route in `src/app` except `/test-provider` and `/print`, which is 147 routes.
    - Public pages ran on 13 viewports (320 → 2560) plus real WebKit iPhone SE and iPad Mini.
    - Portal pages ran on 5 Chrome viewports (320, 390, 768, 1280, 1920) plus the same two WebKit devices.
    - Dynamic routes used real ids, found by following the first matching link on each list page.
  - 193 loads for 23 detail routes that had no link to follow. Ids came from the dev DB; made-up ids checked the not-found screens.
  - 169 loads re-checking the fixes.
  - 168 loads of every public page **signed in**. This morning's sweep was signed out only, and that is how it missed the header bug below.
  - The 320px contact sheets were reviewed by eye.
- **Clean:** no failed navigations, no 4xx/5xx, no Chrome console errors, no broken images. Every not-found or invalid-token page shows its own message.
- **Fixed (all re-verified on the devices that failed):**
  - **iPad (768) sideways scroll on 11 table desks**, from +9 to +352px: `/admin/audit`, `/admin/offers`, `/admin/sponsor-requests`, `/admin/payments/events` and four `/admin/intelligence/*` pages, plus `/athlete/sales`, `/sponsor/requests` and `/finance/payment-events`.
    - Cause: a column's `srOnly` header is `position:absolute`. Its containing block sat outside `.sx-table-scroll`, so it escaped the `overflow-x:auto` box and widened the page.
    - Fix: `.sx-table-scroll` now has `position: relative` (globals.css). No table cell has a popover that relied on escaping.
  - **`/login` hydration mismatch** (9 of 13 devices under parallel load).
    - Cause: Clerk's `<SignIn>` renders nothing on the server. When clerk-js finished loading before React hydrated, it rendered its host `<div>` during hydration, and React re-rendered the whole page on the client. It only reproduces under load: 5 of 12 parallel loads failed, 0 of 12 after the fix.
    - Fix: a new `AfterHydration` wrapper in `login-fx.tsx` (`useSyncExternalStore` with a false server snapshot) mounts `<SignIn>` after hydration. Nothing is visible before hydration, as before.
  - **Signed-in header past the screen on phones (+32px at 320).** "Property Dashboard" needs 372px, so on every public page a signed-in phone user scrolled sideways.
    - Fix: below 380px the button reads "Dashboard" (`site-nav.tsx`). The phone menu keeps the full label, and 380px and up are unchanged.
    - Verified for property, sponsor and admin at 320/360/375/380/390/412.
  - **Grids with only an `lg:` template.** Below lg the implicit `auto` track grew to its content's min-content.
    - Pages: `/admin/new-signups/rules` (+4 at 320), `/admin/onboarding/[id]` (+43), and the admin/finance dispute details (+16/+63 at 768).
    - Fix: `grid-cols-1` on all 13 `grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]` detail layouts and on the rules board (+ its loading.tsx). Onboarding's and `live-signup-profile`'s `dl` now use `minmax(0,1fr)`.
  - **`/property/roster` at 320 (+55):** three fixed columns in a 230px card. Below sm the athlete takes the first row, with state and share on the second; the header says "Athlete · State".
  - **`/finance/payouts/[id]` at 768 (+4):** a nowrap "✓ Approved automatically" chip in a 115px tile. The chips may now wrap inside that tile only.
  - **Offer form on Safari (+22 at 320):** WebKit doesn't clip a `<select>`'s chosen option to its box. A global rule now gives single-line selects (`select:not([multiple]):not([size])`) `overflow:hidden; text-overflow:ellipsis`. The offer form's three two-up grids also got `grid-cols-1`.
  - **Boot loader exit:** `landing-loader.module.css` `.overlay` is now `overflow: hidden`. The exit scales the stage to about 816px.
- **Found, not changed:**
  - The home page's sample "Featured athletes" link to profiles that don't exist (`/athletes/shammah-kwizera`). This was already logged as needing the owner.
  - **Tap targets under 24px with neighbours:**
    - the sponsor "?" help buttons (as this morning);
    - `/admin/audit` record-id chips;
    - `/admin/next/editions` "Mark content ready" at 320;
    - the `/admin/rewards/new` checkbox (14px) and Close button;
    - the home "View All" at 320;
    - the sidebar "← route map" link.
  - **WebKit "…due to access control checks" page errors:** these are Clerk fetches cancelled by the harness's next navigation, not a product error.
  - **The 3D city and boot loader** never finish in headless (software GL), so some screenshots catch the loader.
- **Checks:**
  - tsc and eslint are clean.
  - Frontend vitest: 1,711/1,712. `security-review.test.ts` › "no use client module reaches them" timed out at 5.3–5.6s against the 5s default under full-suite load. It passes alone, and with `--testTimeout=30000` the whole suite is 1,712/1,712. None of these changes add imports to a client module.
  - No production build (the owner's dev server is live).
  - The work is uncommitted on `fix/P8-FE-09-dry-run-screen-findings`.

## Phase 5 is now Certified Recruiting; the INFINEX game is Phase 6

- **Trigger:** the user received a partnership plan for Certified Recruiting, BTG Sports Group and SponsorX. Certified Recruiting's site, [certified-recruiting.com](https://www.certified-recruiting.com/), is already built by the user on GoDaddy (GoDaddy Airo) and is the partnership's main page. BTG's website already links to it: the "Recruiting" menu item. What's missing is a link from SponsorX.
- **Decision (user):** move every Phase 5 task to Phase 6 and put the new task in Phase 5. IDs renumbered `5S…` → `6S…` with the same sprint, category and number, following the 2026-10-16 precedent (4S… → 5S…). Each Phase 6 row notes "Formerly 5S…". Old `Memory/` logs and signed records (the Phase 4 sign-off) keep the old IDs.
- **New Phase 5** (`documentation/SponsorX-Phase5-Certified-Recruiting.md`, sheet `Phase 5`):
  - `5S1-FE-01` · Certified Recruiting card on SponsorX. A partner card linking to certified-recruiting.com, on the home page's "For athletes" section and the athlete dashboard. Status Ready, for the frontend.
- **Corrected the same day:** I first wrote `5S1-FE-01` as a new landing page on BTG's WordPress site, plus `5S1-PMO-01` to collect the inputs for it. That duplicated the GoDaddy site the user had already built. Both were replaced by the card task above before merging.
  - `5S1-FE-02` · Fix footer links on certified-recruiting.com (GoDaddy editor), the three problems below. Status Ready.
- **Found on certified-recruiting.com:**
  - the footer's SponsorX link goes to `sponsorx.com`, a different company; it should be `https://sponsorx.net`;
  - "SponsorX Next" goes to `next.sponsorx.com`, which doesn't exist; it should be `https://sponsorx.net/next/about`;
  - the Instagram and X icons point to the bare instagram.com and x.com.
- **Also changed:**
  - The Phase 5 doc is renamed `SponsorX-Phase6-INFINEX-Game.md`, and every plan's phase table is updated.
  - IDs updated in the INFINEX specs, the Virtual Registry and Taxonomy docs, the Go/No-Go review and two backend comments.
  - The CI skip list for phase plans, and `CLAUDE.md`.
  - Tracker: the Dashboard and Roadmap now show six phases; 15 formulas added, none lost.
- **Verified:** backend build, lint, secret scan and the scanner self-tests pass. The CI skip pattern skips the two new plan names.

## P8-BE-08 · Home page Featured athletes from real data (Done); P8-FE-10 raised

- **Trigger:** the frontend asked for the criteria behind the home page's "Featured athletes" panel. It showed the first four ACTIVE sample athletes with "Verified" badges, and the `P8-FE-09` notes had flagged it as needing the owner.
- **Criteria (decided by the user, 2026-10-27).** All must hold:
  - the athlete is ACTIVE;
  - the profile is complete: a photo plus every public field — "miss one, it gets rejected";
  - they are an adult, or a minor a Network Manager approved (no age on file counts as a minor);
  - BTG hasn't removed them.
- **Who controls it:** pinned athletes show first, then the latest verified post. At most four. BTG admin and the Network Manager pin, remove, restore and approve. The backend applies every rule; the frontend only shows the list.
- **Built:**
  - `domain/home-featured-rules.ts` (pure) and `domain/home-featured.ts`;
  - `GET /public/featured-athletes`;
  - athlete photo upload: `POST` and `PUT /athletes/{id}/photo`, a public bucket, pinned type and size;
  - `GET` and `POST /athletes/{id}/home-page`;
  - migration `20261027120000_athlete_home_featured` (4 nullable columns);
  - audit actions `homePage.*` and `athlete.photoSet`.
- **Safety rule added:** a minor's new photo resets their home-page approval.
- **Guard tests updated, with reasons:**
  - the public-bucket allowlist (`payments-pii`) now names the photo;
  - the cross-tenant sweep has sample bodies for the three write routes;
  - the writes include the tenant.
- **Verified** on a local Postgres 17: backend build and lint pass; 3,540 backend tests (237 files) pass; the secret scan passes.
- **Next:** `P8-FE-10` (Ready, frontend) — the panel reads the API, the athlete photo upload, and BTG's controls.

### P8-FE-10 · Home page Featured athletes from the API (Code review)

- **Trigger:** the user pointed at the task the P8-BE-08 criteria raised.
- **Branch:** `feature/P8-FE-10-featured-athletes`, from `main_development` at `66b0957b`.
- **The panel** (`landing-athletes.tsx`) now reads `GET /public/featured-athletes` (`server/featured-athletes.ts`, the network-stats pattern: 1.5 s budget, one-minute keep, edge forward).
  - It shows only the API's fields: photo, name, sport · position, city and state, and followers tagged Verified or Self-reported. Phones get a compact figure beside the arrow.
  - Removed: the job tag, tier, the sample reach and engagement, and the name's "verified athlete" badge.
  - No read or an empty list hides the panel, and nothing falls back to fixtures.
- **Athlete photo** (`athlete-photo-editor.tsx` + `server/athlete-photo-actions.ts`):
  - It is on the athlete's profile edit page once they're approved, and in BTG's section.
  - The browser checks type and size, PUTs the file straight to the public bucket, then confirms with the API.
  - A minor is told a new photo goes back to BTG.
  - Backend: `GET /athletes/me` now returns `photoUrl`, the CDN address and never the key (test in `athletes.me.test.ts`, OpenAPI summary updated).
- **BTG's controls** are a "Home page" section on `/admin/new-signups/athletes/{id}` (`home-feature-panel.tsx`, `lib/home-feature.ts`, `server/home-feature-actions.ts`).
  - It shows the on-panel state, or every reason the athlete is off ("Missing: photo, school", "Under 18 — waiting for approval").
  - Buttons: Pin / Unpin, Remove / Restore, and Approve / Withdraw for a minor. Pin is disabled while removed.
  - The section is drawn only when the API's BTG-only status read answers.
- **Bug caught in the walk:** keying the panel on its status remounted it on `router.refresh()`, so the confirmation message vanished after about a second. It now takes the server's fresh status without remounting.
- **Checks:**
  - frontend tsc and eslint clean; vitest 1,729/1,729;
  - backend DB tests (`athlete-login`, `athletes.me`, `home-featured*`, `tenant-isolation`) 42/42 on `sponsorx_test`, and the OpenAPI test passes.
- **Live walk** on the local stack, with MinIO:
  - the admin upload took "photo" off the missing list;
  - the athlete changed the photo, and a GIF was refused in the browser;
  - pin, unpin, remove and restore each showed its message and wrote its audit row;
  - sponsor and finance logins can't open the page;
  - the panel rendered at 1440, 390 and 320 with QA athlete Jordan's profile completed for the walk. Jordan's fields, photo and home flags were restored to their original nulls afterwards.
- **Not done:** the minor approve/withdraw buttons weren't clicked live (no minor QA athlete with a full profile). They're covered by unit tests and P8-BE-08's backend tests.
- **Also:** the Phase 1 doc now shows P8-FE-09 as Done (merged in #307 and #308).

### P8-FE-10 QA pass (the user's request: "QA test the backend and frontend regarding the task that you did")

- **Scenario:** staged on existing QA athletes, with a backup table and an md5 of the rows before. Restored afterwards with an identical md5, and the `qa_fe10_*` socials deleted.
  - SAM: an approved minor, pinned first.
  - JORDAN: an adult, pinned second.
  - QUINN: no age on file, approved, with a 35-character name.
  - Rory: an adult, self-reported.
  - THEO: no age on file, not approved.
  - VAL: removed.
  - a FEATURED athlete, complete.
  - CORA: no school.
- **API, 33 live probes, all pass:**
  - pinned order, the four cap, exactly nine public keys, each exclusion;
  - `/athletes/me` returns photoUrl and no key;
  - upload refusals: GIF, over 5 MB, never arrived (409), another athlete's key (422), another athlete's upload;
  - home-page status and actions refused for athlete, sponsor, finance, advisor, student and property; 401 with no login;
  - approving an adult and pinning a removed athlete are refused with their reasons; an unknown action is 400.
  - Two first-run "failures" were my seed: Rory's social had no count, so he was correctly blocked.
- **Browser, 94 checks:**
  - home panel on 11 devices, WebKit included: 4 rows in pin order, photos load, tags, profile links open, nothing outside the panel, no sideways scroll, no errors;
  - BTG's section for 5 cases on 7 devices;
  - the athlete photo on 7 devices, plus a 5 MB+ file, a storage 500, a dropped connection and the keyboard;
  - axe clean ×3; minor approve and withdraw clicked live; the API down leaves the home page loading in 1.5 s without the panel.
- **Fixed (commit `76c714c9`):**
  - (1) `GET /athletes/me` called `publicObjectUrl` from the route, a third place reaching the public bucket, so `payments-pii` would fail on CI. The address now comes from `athletePhotoUrl()` in `domain/home-featured.ts`.
  - (2) "Under 18" was shown for athletes with no age on file. It now reads "Under 18 or no age on file".
- **Build and suite:**
  - `npm run build` (backend + Next 16.4.2) is green in a detached worktree.
  - Backend suite on `sponsorx_test`: 3,525 pass, plus the five known Windows-only and timing files.
  - The worktree teardown again emptied `node_modules/rimraf`; restored 2.7.1 from `npm pack`.

### P8-FE-10 QA, second pass (the user's request: "QA test again frontend and backend based on the task you did for featured athletes")

- **No code changed; nothing new on `main_development`.** Same staged scenario. Fingerprint `1f3eb39c…` before and after, the `qa_fe10_*` socials removed, and the rate-limit counter cleared.
- **Repeated, all pass:**
  - 33 API probes. The first run's 10 admin "failures" were the harness reading the Clerk token before Clerk loaded; fixed by waiting for `Clerk.loaded`.
  - 101 browser checks: the first pass's 94 plus 844×390 landscape on the portal pages.
  - frontend vitest 1,729/1,729; tsc and eslint clean.
  - Backend suite on `sponsorx_test`: 3,519 pass. Failing: the four Windows-only files, plus `openapi.coverage`'s import hook timing out while the browser matrix loaded the machine (7/7 alone). The public-bucket guard with POSIX paths lists exactly branding, home-featured and storage.
- **New checks (17, all pass):**
  - The athlete uploads a real JPEG, then a WebP (each shown and loading), then removes the photo. The removal persists after a reload, and they drop off the home list.
  - BTG sets the athlete's photo: "photo" leaves the missing list, and the athlete sees it.
  - A minor's new photo, set by BTG, resets her approval (the reset is the API's rule). The section says "waiting for approval" again, the API drops her at once, and the home page caught up within its one-minute keep.
  - The public read's limit: 429 within 120 requests an hour, with Retry-After. The home page still loads while limited. The Redis counter was cleared afterwards so the dev server isn't locked out.
- **Not repeated:** the production build and the API-down check. The code is unchanged since both passed on `76c714c9`. A light-theme check doesn't apply, since the app has one theme since 2026-10-14.

### P8-FE-10 QA, third pass (the user's request: "thrid QA pass")

- **Found and fixed: the Network Manager couldn't reach the home-page controls.** They lived only on `/admin/new-signups/athletes/{id}`, which is BTG admins' alone ("Not in your role"); the API and the task both give them to the Network Manager.
  - The same section now opens in the review drawer of an approved athlete on `/admin/applications`, the Network Manager's desk. It is loaded on demand: `getHomeFeatureAction` in `server/home-feature-actions.ts` and `home-feature-loader.tsx`.
  - Walked: the Network Manager at 1280 and 390, and BTG admin, unpin and pin from the drawer. It fits the drawer with no errors, and applicants under review get none.
- **Production server** (`next start`, built in a worktree on port 3100): the panel's photos load, the athlete's direct upload works, and a server action (approve) works on the built app.
  - The CSP is still report-only; only frame-ancestors is enforced. When it is enforced, the web service needs `R2_PUBLIC_BASE_URL` (or photos on `*.r2.dev`). Prod's img-src has no local storage host.
- **More roles, all pass:**
  - the Network Manager and super admin get status and actions;
  - SAM's guardian may start an upload for SAM, not for another athlete, and can't see the status;
  - another tenant's Network Manager (made by moving `e2e_u_ck_nm` to `e2e_fan_tenant` for a moment; its row md5 was identical after) gets 404/403 on everything, with nothing changed.
  - Observation: a guardian has no screen to set the ward's photo. `/athlete/profile/edit` shows guardians the demo editor (pre-existing).
- **Robustness:**
  - a stale second tab pinning a removed athlete is refused with the API's reason;
  - a double-click sends one action (one audit row);
  - keyboard focus is visible;
  - a display name with HTML, accents, emoji and Arabic renders as text (no script, no injected element). BTG's page heads with the legal name.
- **Checks:**
  - frontend vitest 1,729/1,729; tsc and eslint clean;
  - the scenario was restored with an identical md5, and the QA socials and rate counters removed;
  - the worktree teardown emptied `node_modules/rimraf` again; restored 2.7.1.

### P8-FE-10 QA, fourth pass (the user's request: "fourth qa test pass")

- **Full regression on `c5af391e`, all pass:**
  - API probes 33/33;
  - browser matrix 101/101 (11 devices, WebKit included);
  - the Network Manager's drawer 8/8; roles 8/8 (incl. another tenant); robustness 5/5;
  - pass-2 extras 17/17 (JPEG/WebP upload and removal, BTG's photo, the minor's photo resetting approval, the rate limit).
- **New checks:**
  - **The applications desk after the drawer change:**
    - the four tabs open (Network Manager and BTG admin);
    - Escape closes the drawer and focus returns to the row;
    - a reviewable applicant keeps Approve / Request info / Reject;
    - "Info requested" applicants have no decisions (by design), and no applicant gets the Home page section.
    - The change only added lines (git diff: 0 removed).
  - **The drawer with the Home page section passes axe** once its fade-in has settled. The contrast "failures" were measured mid-fade; settled, there are 0 violations there and on BTG's page.
  - **The Network Manager uploads a photo from the drawer:** saved, the drawer stays open, and the new photo shows.
  - **A photo whose object is gone from storage:** the row keeps its 72px circle, and the empty alt shows no broken-image text.
  - **Reduced motion:** every row is fully shown.
  - **Without JS:** the panel is in the server HTML with every listed athlete; no sample names.
- **Fixed:**
  - the largest follower count (int4, 2,147,483,647) printed "2147M". `followersLabel` now does billions ("2.1B"); tested, and seen live.
- **Checks:**
  - frontend vitest 1,729/1,729; tsc and eslint clean;
  - the scenario was restored with identical md5s (athletes, and the Network Manager's user row); QA socials and rate counters removed.
