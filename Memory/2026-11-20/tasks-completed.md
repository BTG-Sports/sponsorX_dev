# 2026-11-20 · tasks completed

## Yesterday's close of day restored (rcfworks)
- The 2026-11-19 Stage Progress row and end-of-day entry (34d3f8fc) were pushed to
  `docs/POL-BE-116-done` after #499 merged, so they never landed. The same thing happened the day before.
- Put on their own branches: #501 (main_development) and #502 (main).

## Dependency audit — effect overridden to 3.22.5 (rcfworks)
- A new advisory, GHSA-7589-6fvf-x4pw (high, ReDoS in `Schema.TemplateLiteral`), hit `effect`
  3.20.0, used by Prisma's config loader (`@prisma/config` pins it exactly) and, as an optional
  peer, by `@hookform/resolvers`. The production audit was clean, but every PR's audit check failed.
- A patch exists, so it was fixed rather than allowlisted: root `overrides` → `effect` 3.22.5 (same
  major). npm's own suggestion was a downgrade to Prisma 6.12.
- **npm quirk:** `npm install` kept the old lockfile entry. Deleting the entry made npm drop the
  package entirely while still reporting "up to date". The lockfile's `effect` entry was set to
  3.22.5 by hand with the registry's integrity; `npm ci` installs it, `npm ls` shows it overridden,
  and a later `npm install` leaves the lockfile alone.
- **Checked locally:** audit check clean, scanner tests, secret scan, `prisma generate`, `prisma
  validate`, `prisma migrate deploy` (portable Postgres 17), both builds, lint, backend 288 files /
  4,052 tests, frontend 210 files / 2,524 tests. e2e not run locally.
- Recorded in `documentation/SponsorX-Security-Review-2026-10.md` (Dependency scan table).

## POL-FE-103 and POL-FE-104 assigned to HeckerCreatives (rcfworks)
- When POL-BE-103 and POL-BE-104 closed on 2026-11-18, the log named their screens as
  HeckerCreatives', but the tracker's Owner was left blank, so the two Polish rows sat unassigned.
- Polish sheet rows 149 (`POL-FE-103`, the school advisor's Profile page in `/advisor`) and 151
  (`POL-FE-104`, the school team's page in the property portal): Owner set to HeckerCreatives,
  still Ready. Their backend is Done and live.
- `5S1-FE-02` (certified-recruiting.com's footer) stays unowned for now: it's a GoDaddy editor
  change, not code in this repo, and needs whoever holds that login.

## main_development pulled; every startable frontend task built (HeckerCreatives) — Code review

- **Pulled:** `main_development` at `bffe5856` (43 commits: `POL-BE-116`, the upload audit `P9-BE-25…28` and `POL-BE-110…113`, the CI store). Six new migrations applied locally (`migrate deploy`, `prisma generate`). Branch `feat/POL-FE-103-104-107-116-P9-FE-13-16-2S4-FE-10`.
- **Built, nine tasks, all now Code review:** `POL-FE-103`, `POL-FE-104`, `POL-FE-107`, `POL-FE-116`, `P9-FE-13`, `P9-FE-14`, `P9-FE-15`, `P9-FE-16`, `2S4-FE-10`. What each does, its files and its walk are in `documentation/polish.md` (the four POL items) and below (the rest).
- **Not done: `5S1-FE-02`** (footer links on certified-recruiting.com). It is a GoDaddy site-editor task, not code, and unassigned; it needs whoever holds that login.
- **Checked:** `npm run build` (frontend) clean, with the four new routes; 218 / 218 test files, 2,718 tests; eslint clean apart from one unused-variable warning in a test. Walked live on the local servers at 1280 and 390 wide; no sideways scroll on any new page.

### P9-FE-13 · file picker on the rights page's "Add content"
- Any format up to 2 GB, straight to storage on a signed PUT with progress and Cancel; the piece is saved once the file has arrived; a refusal is shown in the API's words. A new Content list opens each file on a short signed link, or offers "Add its file". The student's draft picker takes any format up to 2 GB too. Every PUT carries the Content-Type the grant answered (`lib/direct-upload.ts`).
- **Walked:** an `.indd` file the browser can't name went to local storage as `application/octet-stream`, was added and listed, and "Open file" downloaded it. A published edition offers no file field, matching the backend's `CONTENT_FINAL_STATES`.

### P9-FE-14 · pictures, video, ads and the cover in the public reader
- `/next/[school]/[edition]`: the cover beside the masthead (above on a phone), each piece's photo or video, each sponsor's ad with its position; any of them null draws the piece as before. Plain `<img>`/`<video>`, lazy, http(s) only. Shapes in `lib/edition-reader.ts`.
- **Walked:** `qa-northside-high/qa_nx_ed_pub` loads at both widths. The local editions hold no pictures, so the pictures themselves were checked by tests only.

### P9-FE-15 · cover and press PDF on the editions page
- Upload and replace both, with a progress bar; the cover previews on a signed link; "Open the press PDF" downloads it by its name; a cancelled edition takes no file.
- **Walked:** a text file named `.png` was refused with "That cover couldn't be opened as a picture, so it was removed."; a real PNG uploaded and its preview loaded; a PDF uploaded and downloaded as `walk-press.pdf`. Put back afterwards.

### P9-FE-16 · the production board
- `/admin/next/production` (BTG admins): Needs you / Waiting on others / Ready / the four gates, tabs, List/Cards, search, edition and kind pickers, all in the URL. Each piece shows its needs in the API's words and one button to where it is fixed (advisor review, the rights row or the Clearance queue, approvals' edition artwork, the editions page's files).
- **Decisions:** not server-paged (the API returns one edition whole); artwork links land on the section, not the exact item; student pieces open in `/advisor/review`, where BTG admins may already review.
- **Walked:** every tab and the loading skeleton at both widths; the rights walk's piece showed "A digital right → Record a right" and the missing cover "Upload".

### 2S4-FE-10 · Deal Chat on the socket service
- `lib/deal-live.ts` holds the rules; `deal-socket.ts` is rewritten on them. Passes come from `POST /live-passes` (the old socket ticket and `/api/v1/socket` are gone, and `API_PUBLIC_URL` is out of `.env.example`). One connection per tab, only while a chat or the Messages list is open and the tab visible; join and leave per chat; `chat:*` events re-read; `session:renew` reconnects; `access:ended` stops; 503 / 409 / 403 and an unreachable service fall back to the existing refresh.
- **Decision:** the Messages button follows the inbox on every portal page (the plan's item 3), so its count is live; the stricter reading ("nothing connects unless the list is open") is a one-line change in `chat-dock.tsx`.
- **Also:** `frontend/next.config.ts` content security policy (report-only) now names `wss://socketservice.sponsorx.net` and `wss://socketservice-staging.sponsorx.net`.
- **Not checkable locally:** the staging criteria (a message on the other side within a second; a held message reaching BTG only). Locally the API answers 503 ("Live updates aren't switched on here"), so the walk saw only the fallback.

### For rcfworks / the owner
- **Every 503 from `POST /live-passes` is logged as an `[error …]` line by the API** — one per portal page load while live updates are off. Expected behaviour, noisy log.
- **BTG has no editor for a campaign's order** (`PUT /campaigns/{id}/order-details` exists; no task covers its screen).
- **The local Docker worker image is from 2026-11-16**, older than this week's backend; brief approval and anything the worker does may lag the code until it is rebuilt.
- **Tracker:** the nine rows set to Code review, HeckerCreatives, started 2026-11-20. `POL-FE-102`, `114` and `115` moved to Done (2026-11-19): merged by #487 and on `main` / `release`.

## POL-BE-117 + POL-FE-117 · Country → Region → City, picked from a 2026 list, never typed (HeckerCreatives) — Done

- **Asked (owner, 2026-11-20):** "For the countries: East Africa, USA, Tanzania, Uganda — we need this, then add their city and region. We need the updated 2026 list." Then: "its better if its dropdown that can be selected instead of free text" and "also add a search on the dropdowns". Choices asked and answered: East Africa as a **group of countries**; **every incorporated place** in the US; **the athlete profile, the sample editor, the team profile and sponsor campaign targeting**. Filed as polish item 117 (`documentation/polish.md`).
- **Branch:** `feat/POL-BE-117-POL-FE-117-place-pickers`, stacked on this morning's `feat/POL-FE-103-104-107-116-P9-FE-13-16-2S4-FE-10` (not pushed yet). Commits: backend, frontend, tests, then docs.
- **The data:** `scripts/places/build-places.mjs` writes `backend/places/places.json` (whole catalogue, 252 KB), `frontend/src/lib/places-data.json` (countries + regions, 20 KB) and `frontend/public/places/CC-RC.json` (214 city files). Inputs: the Census 2025 place gazetteer (download URL in the script; 19,472 incorporated places, Hawaii's 161 CDPs because it has no incorporated places) and `scripts/places/east-africa.json` (9 countries, 163 regions, 1,365 cities, researched today with sources and doubts per country — Burundi's 2025 provinces, Ethiopia's 2023 split, Uganda's 11 operating cities).
- **Backend:** `domain/places.ts` checks only what a write changes. Athlete profile changes take `countryCode` (a country change is a move; a minor's move to adulthood is held with its country **and city**); team city must be one of its state's places; East African briefs may narrow to their regions (`RegionCode`, 1–3 chars). `GET /athletes/me` returns `countryCode`.
- **Frontend:** `SearchSelect` in `filter-kit.tsx`, `PlacePicker` in `components/place-picker.tsx`, used on the wizard, the full and sample editors, the team profile (US: State → City), the campaign builder and the request edit.
- **Checked:** backend tsc clean; frontend tsc + eslint clean; new tests 13 backend + 11 frontend; full frontend suite green; `npm run build` green in a detached worktree. Walked as the QA athlete at 1280 and 390 (Tanzania → Dar es Salaam → Kigamboni, Texas's 1,221 places), nothing saved.
- **Full backend suite, read this before trusting a local run:** with the root `.env` loaded it showed 223 failures — almost all because `.env` has `DEAL_CHAT=on` (added 11-19 for the Deal Chat walk), which makes payment wait for a signed deal agreement. With `DEAL_CHAT=off DEAL_CHAT_SOCKET=off` the same 30 files leave 5 failures, all the known Windows-only static checks (CRLF / backslash paths / `spawnSync npx`) and `pilot-school` sharing the dev database. One real break was mine and is fixed: `pol-be-104-property-profile` moved a team's state without a city.
- **Housekeeping:** the build worktree teardown emptied `node_modules/rimraf` again; restored 2.7.1 from `npm pack`. Dev servers answered 200 afterwards.

### For rcfworks / the owner
- **A team outside the US** needs BTG to decide what documents it files (`requiredDocuments` is US law); the team profile stays US until then.
- **East African ages of majority** aren't in the age table, so athletes there count as 18 and are flagged (`majorityKnown` false). BTG can add the nine countries on the sign-up rules page.
- **Unincorporated US communities** (Silver Spring, Bethesda, Columbia MD, Arlington VA) aren't on the list; adding the Census-designated places (~12,500) is a one-line generator change if wanted.
- **Still typed elsewhere:** the /join application's state, a reward's venue, the NEXT apply flow.
- **Tracker:** `POL-BE-117` and `POL-FE-117` added to Polish (rows 164–165, Done, HeckerCreatives, 2026-11-20); autofilter, Status list and conditional formats extended to row 165; summary line 157 tasks / 113 flaws. Stage Progress 2026-11-20 row appended: 324 done, 21.0 days left (the +4 / −6.5 since 11-19 is `P9-BE-25…28`, set Done after yesterday's row).

### POL-FE-117, follow-up · /brief's Where step picked too
- Owner: "the /brief page still in free text". `components/brief-wizard.tsx` Where step uses `PlacePicker`; `lib/brief-flow.ts` keeps `marketCountry` / `marketRegion` / `marketCity` and writes `market` from them (`withMarket`), so `POST /public/inquiries` is unchanged; a region from the list is required. Tests: `brief-flow` updated (+2). tsc, eslint clean; walked at 1280/390 (Uganda → Central → Kampala, Continue to Contact), nothing sent.

## POL-BE-118 + POL-FE-118 · signing in after sending a brief: no bounce, and the page speaks about the request (HeckerCreatives) — Done

- **Reported by the owner:** after the brief, the first sign-in landed on the landing page; the second showed "Your account isn't set up yet … apply on Get started".
- **Causes:** the login widget set no redirect for a sign-UP (Google with a new address is one), so Clerk used `/`; and `/portal` knew nothing of pending applications. The owner's own request (local DB) was `NEW`, email unconfirmed, no login — as designed, but nothing said so.
- **Fix:** `signUpForceRedirectUrl` + provider fallbacks → `/portal`; `resolveActor` asks `pendingApplicationFor` — signing in with the request's address confirms its email and runs the automatic checks (a complete request opens and is claimed in the same sign-in), otherwise the 403 carries `pending` and `/portal` says what's left with the request page.
- **Checked:** backend tsc; frontend tsc + eslint; new tests (4 backend, 5 frontend) plus the sponsor auto-approval and sign-in suites; full frontend suite green; walked with a throwaway Clerk user (deleted after, with its brief and jobs).
- **For the owner:** your own request (`Local retail`, sent 07:20) will have its email confirmed the next time you sign in with that Google account; the page then asks for the proof of business, and the account opens once it is uploaded.

## Deal agreement PDF redesigned (HeckerCreatives) — Done

- **Asked by the owner:** the downloaded deal agreement (`SponsorX-deal-agreement-SX-….pdf`) was a plain `<pre>` dump — "add a design, it's too plain".
- **Change:** the page moved to `backend/src/domain/deal-agreement-page.ts` (`dealAgreementHtml`, re-exported from `deal-agreement.ts`). Dark brand cover (title line and order line verbatim, parties, amount, deliverables, signatures count, state pill), numbered D-sections, D2 as deliverable rows, D3 as a checklist, D4 chat messages as quoted messages, D5 amount large, signature cards per side, a dark record panel with an SVG seal and the full fingerprint; "NOT IN FORCE" watermark on a withdrawn form. A running footer (order, short fingerprint, Page x of y) via a new optional `renderPdf(html, { footerTemplate, margin })` in `report-render.ts` — the sponsor report call is unchanged.
- **The signed words are untouched:** every line of the body is on the page in order; only "- " and the heading full stop become styling. A body not in the DEAL template's shape prints verbatim. No script, no network (system fonts, inline SVG).
- **Checked:** backend tsc clean; new test (every line of a filled template, with quoted messages, is on the page; no script/handlers); `deal-agreement`, `security-hardening`, `report-render` suites pass except the two known Windows-only CRLF static checks. Rendered OPEN and SIGNED previews through real Chromium and read them page by page.
- **Follow-up · the download no longer looks hung.** New client island `components/deal-chat/agreement-download.tsx` (`AgreementDownload`) replaces all six plain links (agreement dialog, chat panel chip + button, order page Deal chat card, seller orders, sale page). A plain click fetches the route and saves under the API's filename; meanwhile the link spins and reads "Preparing PDF…", then "Still preparing…" after 4 s; a failure reads "Couldn't download — try again" for 5 s. A ref blocks a double click. Modified clicks and no-JS still go straight to the route. frontend tsc + eslint clean; walked live as the QA athlete on SX-P4DNEO01: busy label seen, file `SponsorX-deal-agreement-SX-P4DNEO01.pdf` saved in 1.4 s, two synchronous clicks started one download, and the saved PDF is the new design.

### POL-FE-117 follow-up · the sponsor shop's State filter was still the old US-only list
- Owner, 2026-11-20: "why the hell is this still using the old dropdown". The shop's Filters sheet (`components/sponsor-shop/shop-window.tsx`) was missed by POL-FE-117: it now uses `PlacePicker` in a new `filter` mode ("Any country / Any state / Any city" first in each list), three across on desktop, stacked on a phone. One chip in words ("In Takoma Park, MD", "In Tanzania") clears all three.
- Backend: `GET /marketplace/search` takes `countryCode` and `city`, and `stateCode` is 1-3 characters (some East African region codes are one letter; the old `length(2)` would 400). A team's listing is where the team is (US); an independent athlete's is where the athlete lives. A region or city without a country is a US one, so old `?stateCode=MD` links still work; a bad one narrows nothing and is named under Not applied.
- Checked: frontend tsc clean, full frontend vitest 220 files / 2,736 pass; backend tsc clean; `phase2-independent-listing` (new Where case: country, region, city, an athlete moving to Arusha), `pol-be-117-places`, `openapi.coverage` pass.

### POL-FE-117 follow-up · the age-of-majority page now reads the place list
- Owner, 2026-11-20: "we need to make the age of majority page align with the countries, regions, and city that we listed earlier". `/admin/new-signups/rules`: the rail is the place catalogue (United States · East Africa, then one "Not on the place list" entry for the older rows: Canada, Puerto Rico and others, kept because they still apply to anyone who signed up there). Every region has a card with its city count; a region with no row is a dashed card at the age it follows, and clicking it opens Add with the place chosen; a country with nothing set says "No age set" and offers to set it. "Add a place" offers only catalogue places, under each country's word for its regions, and says how many cities the age reaches. Buttons say names, not codes ("Add Dodoma").
- Backend: `setAgeRow` refuses a *new* row off the catalogue (422, in words); existing rows can still be changed or removed. `phase2-athlete-signup` BE-12 updated (ZZ and TZ-MD refused, TZ-01 added and removed).
- Checked: frontend tsc + eslint clean, full vitest 220 files / 2,742 pass (`age-table.test.ts` rewritten for the catalogue, 20 cases); backend tsc clean, `phase2-athlete-signup` passes. `tenant-isolation`'s last case fails locally because the running Docker worker dispatches tenant A's outbox email mid-test (`OutboxJob.dispatchedAt`), environmental, not this change. Walked live as the QA admin (US, Tanzania, the Dodoma add dialog, the off-list rows, the country dropdown) and as the QA sponsor (the Where filter on `?countryCode=US&stateCode=MD`): no page errors.
- Not done: the East African ages themselves. Every one of the nine countries shows "No age set" (athletes count as 18 and are flagged) until BTG sets them; a South Sudan › Abyei row at 18 was added by a BTG admin account during the session.
- `5S1-FE-02` (certified-recruiting.com's footer, GoDaddy editor): Owner set to HeckerCreatives on
  the user's decision. Still Ready.
