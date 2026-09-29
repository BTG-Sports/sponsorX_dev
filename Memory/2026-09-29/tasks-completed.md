# 2026-09-29 — tasks completed

## `npm run deploy` — one command for staging and production (rcfworks)

No board task; tooling asked for by the programme owner.

- **What it does.** `scripts/deploy.mjs`, run as `npm run deploy` from the
  repo root. It deploys the latest commit on **GitHub `main`** (never the
  local working tree) to Railway `api` and `web` in **staging**, waits for
  both to succeed, then asks for a typed `yes` before deploying the **same
  commit** to **production**. Usage: `npm run deploy production`,
  `npm run deploy staging` (staging only), `npm run deploy dry run` (show,
  change nothing). Bare `npm run deploy` prints this usage and does nothing.
- **How.** The Railway CLI's own login (`railway api`, GraphQL
  `serviceInstanceDeployV2` with `commitSha`), polling `deployment.status`.
  A production deploy held at `NEEDS_APPROVAL` is approved by the script,
  since the typed `yes` is that approval. No new dependency.
- **It does not wait for GitHub's checks** — they are refused while the
  Actions quota is exhausted (see 2026-09-28).
- **Documented** in `documentation/SponsorX-Deployment-Runbook.md` §1, "Deploying by hand".
- **Verified.** Dry run resolved both environments; a real staging-only run
  deployed `e73764a` to staging `api` + `web`, both SUCCESS. Production was
  not deployed by the test — it already ran the same code (`29bda05`; the
  only later change is this log folder's sibling, the 09-28 summary).

## Also noted

- Everything merged on 2026-09-28 was already live in both environments at
  `29bda05` (21:02 Manila).
- **Tracker Slack/Sheet broadcasts are down while GitHub Actions is out of
  minutes.** `Tracker notify` failed on the #111 push (13:02 UTC 09-28) and
  `Tracker digest` failed its 13:12 UTC run. Once billing is fixed or minutes
  reset (1 Oct), re-run both from the Actions tab (`Run workflow`).

## Payment-provider board pack (`2S0-PMO-03` groundwork, no status change)

- Reviewed `2S0-PMO-03` for the programme owner: provider requirements,
  recommendation (Stripe Connect, Express accounts, separate charges and
  transfers — one payment splits across several properties/athletes and the
  reserve needs delayed transfers), what BTG must supply, and our side (the
  `backend/src/lib/payments.ts` adapter interface; raw-body webhook
  verification).
- Board pack saved to the owner's Google Drive as a Google Sheet,
  "SponsorX Payment Flow Board Pack" (id
  `1Uu_sBQKTatic6_iM1chDcjgN8OxyGJ_U1er4Yx6L2VQ`), 7 tabs: Summary,
  Flowchart (cell-drawn swimlanes), Flow Steps, Money Split Example (live
  formulas; reproduces the ledger design's $2,799.97 worked example to the
  cent), Provider Options, What's Needed, Waiting Tasks.
- Task stays **Blocked** — waiting on the owner's provider decision.

## Walkthrough logins on staging (no board task; programme owner's request)

- `backend/worker/jobs/seed-personas.mts`, called from `seedEnvironment`
  (so it runs at every non-production worker boot, idempotent). Creates the
  people in the two sign-up-to-payout stories, each at the point the story
  hands over to them: Riley's athlete application SUBMITTED (Hawks roster,
  20% team share), Jordan's student application SUBMITTED (Northside, minor,
  guardian verified), Maya FEATURED and claimable (guardian NOT verified),
  Northside Sports "Fall 2026" SELLING with a 26-slot rate-card flatplan,
  Harbor Coffee and Bowie Auto Care as sponsors, the Westfield Hawks as a
  TEAM property, and five BTG staff logins (admin, network, campaigns,
  finance, sales).
- **No passwords.** Every login is a Clerk test address
  (`<name>+clerk_test@example.com`), code **424242** on staging's development
  Clerk instance; placeholder `clerkId`s are claimed on first sign-in.
- Tested in `tests/pilot-school.test.ts` (same file as the pilot school, whose
  fixed ids it shares): every login claims its row with the right roles and
  links, Riley is in the review queue, Jordan only in Ms. Patel's queue, the
  edition is selling with every slot open, Maya's profile is public and
  claimable. Mutation-checked. Full suite: 1701 pass; the one failure is the
  known local-only QA-02 lock-timing test.
- **Gap found:** approving an athlete who applies through `/join` creates no
  login for them — the seed pre-creates Riley's and Maya's for that reason.

## Walkthrough gaps raised as tasks; `P3-BE-15` built (rcfworks)

- **Five rows added** (Phase 1 sheet rows 256–260, ranges extended to 260;
  header now 256 tasks · 615 person-days; plan doc 196 · 465), all raised by
  the programme owner from the staging walkthrough:
  - `P3-BE-15` (BE, 1d): an approved athlete, and a linked guardian, get a
    login. **Code review.**
  - `P4-FE-07` (FE, 1d): qualify / approve / close a sponsor brief from the
    admin workspace; the Campaigns page links to briefs waiting for matching.
    Ready.
  - `P3-FE-06` (FE, 3d): athlete portal home on real data. Ready.
  - `P3-FE-07` (FE, 3d): property portal on the manager's own property. Ready.
  - `P7-FE-06` (FE, 3d): admin Operations Board on real data. Ready.
- **`P3-BE-15`.** `src/domain/athlete-login.ts`. Called inside
  `reviewApplication`'s transaction on APPROVED — the only path to APPROVED,
  so `/join`, cohort imports and featured-profile claims are all covered —
  for the athlete and a linked guardian, and from `linkGuardian` when the
  athlete is already APPROVED/ACTIVE (the second path). Rows are
  invitations to claim (placeholder `clerkId`); an address held by any
  account in any tenant is never taken over, and the decision's response
  carries `login: { athlete, guardian }` (`created` / `already-linked` /
  `address-in-use` / `no-email`). Audited as `user.provision`
  (`AUDIT_ACTIONS.permission.loginProvision`). Approval email: "Sign in with
  this email address". Tests: `tests/athlete-login.test.ts` (real Postgres,
  sign-in through the identity path, incl. the late-guardian path) and seven
  in `application.review.test.ts` (takeover, duplicate, no-email, other
  decisions, rollback). Mutation-checked three ways. Full suite 1713 pass;
  the one failure is the known local-only QA-02 lock-timing test.
- **Frontend follow-up (not built):** the review panel does not yet show the
  `login` outcome; `address-in-use` would be worth surfacing to reviewers.
- Claude Design brief for the four FE screens handed to the programme owner.

## The four walkthrough screens, built and wired (rcfworks) — Code review

From the programme owner's Claude Design canvas
(`claude.ai/artifact/FKsn5RzUa7pU3UNRa65yE3`), frontend built on the owner's
explicit request, with the backend each needed:

- **`P4-FE-07` Briefs queue.** `/admin/briefs` (new admin nav item):
  state tabs + counts, search, sport filter, a detail panel (beside the list
  on desktop, full screen on phone) with Qualify / Approve / Close with a
  reason / Open in Matching Studio. Campaigns page: "N briefs waiting for
  matching →", hidden at zero. **Backend:** `CampaignBrief.closeReason`
  (migration `20260929120000_brief_close_reason`), required when BTG staff
  close (422 otherwise; a sponsor withdrawing their own owes none), returned
  by GET /briefs, kept on the `brief.close` audit row; package price added to
  the brief list.
- **`P7-FE-06` Operations Board.** `/admin` now reads the new
  **GET /operations/board** (`src/domain/operations-board.ts`: applications
  waiting / over 48h, deliverables in BTG review, briefs to qualify / to
  match, held / disputed earnings — each through `whereFor`, `null` for a
  role that doesn't read it tenant-wide, 403 for non-staff) plus the existing
  delivery-health and integration-health reads. Sample GMV / growth / "median
  brief → match" removed; Clerk dropped from integration health (no source).
- **`P3-FE-06` Athlete home.** `/athlete` from `/athletes/me`,
  `/invitations`, `/deliverables`, `/earnings`; a guardian sees their ward's
  work without a profile block.
- **`P3-FE-07` Property home.** `/property` from `/properties/mine` and
  `/team/roster`. Inventory shows active/paused, not listing review status
  (not on the item row).
- **Checks.** Backend `tests/operations-board.test.ts` (9, two tenants, per
  role, card = list; mutation-checked twice); isolation sweep now covers
  /operations/board and closes with a reason so the tenant check is what
  refuses; `zoho-sync.test.ts` closes with a reason. Frontend
  `tests/gap-screens-live.test.ts` (17). Full suites: backend 1721 pass (the
  one failure is the known local-only QA-02 lock test), frontend 392 pass,
  build and lint clean. **Walked locally** (own Postgres + API + `next dev`,
  test logins): every screen desktop and phone; qualify and close-with-reason
  clicked for real; the qualified brief opens in the Matching Studio.
- **Noted, not changed:** the Matching Studio titles a brief by its
  objective text ("Pick who goes on Two basketball clinics…'s roster").

## Phase 1 frontend ↔ API close-out (HeckerCreatives)

Scope: the rest of `P2-FE-01`, taken over from rcfworks at the user's
instruction. The goal was that no signed-in user sees fixture data presented as
their own. Branch `development/P2-FE-01-live-reads`. Fixtures stay for `?demo=`
and for signed-out visitors.

## `P2-FE-01` — remaining fixture-only screens wired → Code review

Every page follows the existing pattern:
- a server reader returns `null` for anyone who isn't that role, which renders
  the demo;
- there is no catch, so an outage is an error page, never fixtures.

- **Sponsor Campaigns list and detail.**
  - `server/sponsor.ts` is the shared reader; the dashboard now uses it too.
  - The list reads `GET /campaigns`. Live cards show views as "—" (views
    belong to the ROI report), and the views sort is hidden when every row
    lacks views.
  - The detail reads `GET /campaigns/:id/ops`. That endpoint is already
    sponsor-safe: invites are gated and orders are scoped by `whereFor`.
  - Another sponsor's campaign id shows "Campaign not found", never a sample.
  - `CampaignRow` now allows `views`/`spend` to be null and accepts any §21
    campaign state.
- **Admin Operations Board** (`server/admin-board.ts`). No new endpoints:
  - booked / invoiced / collected and pacing come from `/campaigns`;
  - the four work queues come from each desk's own list;
  - `/operations/integration-health` and the latest `/audit-log` entries.
  - Each section handles a 403 on its own ("not in your role"), so FINANCE
    and SALES get a partial board instead of an error.
  - Capped lists show "N+".
  - Figures with no source are not drawn: quarter-on-quarter GMV, median
    brief → match time, the growth line.
- **Athlete home.**
  - `server/athlete-home.ts` makes the athlete's own reads:
    `/athletes/me`, `/invitations`, `/deliverables`, `/earnings` and
    `/athletes/:id/guardian-readiness`.
  - `lib/athlete-home-live.ts` is pure and tested:
    - a lapsed invite isn't "open";
    - only the athlete's own moves are queued;
    - a minor without a verified guardian gets no upload link;
    - disputed earnings aren't counted as earned.
- **Property portal.**
  - `server/property.ts` reads `/properties/mine` and `/team/roster`
    (own-property scope).
  - It shows the roster and inventory. Audience figures are not drawn, because
    nothing measures them per property.
- **NEW backend read `GET /public/properties/:slug`**
  (`domain/property.ts` `publicProperty`, route, registry row,
  `tests/property.public.test.ts` with 4 tests).
  - Returns public FEATURED/ACTIVE athletes with the same field list as
    `publicProfile`.
  - **Minors are counted (`minorsNotListed`), never named.** This is my call;
    see the flags below.
  - No price, inventory, contact or legal name.
  - The public page renders real slugs. The demo slugs (`btg-sports-talk`,
    `demo-property`) keep the sample, and any other slug shows not-found.
  - The page doesn't link roster names, because an ACTIVE athlete's public
    page is still a fixture (raised `P3-FE-06`).
- **The public `/brief` now actually submits.** Before today, "Send to BTG"
  only changed local state.
  - Server action `brief/actions.ts` → `POST /public/inquiries`, which writes
    an Inquiry row and a queued `zoho.pushLead` in one transaction.
  - The structured answers travel in `message`, labelled.
  - Edge headers are forwarded, so the rate limit applies to the visitor
    (P8-SEC-03).
  - A failure keeps the draft and says so. `?demo=submitted` never posts.
- **Athlete profile editor** (product decision, user, 2026-09-29: "seed from
  live, save socials only").
  - `components/live-profile-editor.tsx` shows every §11 section from
    `/athletes/me`.
  - Socials save through `PUT /athletes/:id/socials`. The API labels an
    athlete's own numbers SELF_REPORTED.
  - Every other section says "ask your BTG contact". Raised `P3-BE-15` for real
    post-approval edits.
- **Already done, left alone:**
  - The portal chrome greets the Clerk user in every layout (QA pass 5).
  - The NEXT student pages are live through `next/live.ts`.
  - `/sponsor/marketplace/[jobId]` is demo-only by design: it is reachable
    only from the demo "Media properties" tab, which is hidden for live
    sponsors (no Phase 1 model).

**Verified**
- Tests: backend vitest 1700/1700; frontend vitest 386/386, 17 of them new.
- Lint, `tsc` and `npm run build` are green.
- 8 signed-in Playwright walks are green against the dev stack, with 0 console
  errors and 0px overflow at 390:
  - the sponsor sees only their own campaigns, and the cross-sponsor id shows
    not-found;
  - admin board and FINANCE partial board;
  - athlete home;
  - property manager (`seed_prop_northside`);
  - public property with adult named and minor counted;
  - brief submission (Inquiry row plus 1 `OutboxJob`);
  - editor socials save (`SELF_REPORTED` in `AthleteSocial`).
- The walk spec was a throwaway in `e2e/` and has been deleted.

## Tracker

- `P2-FE-01` → **Code review**, owner HeckerCreatives, with the notes above.
- Raised **`P3-BE-16`** (Order 65.7): post-approval athlete profile edits.
- Raised **`P3-FE-08`** (Order 82.5): ACTIVE athlete public profile on real
  data.
- Autofilter, Status DV and the three CF ranges extended to row 257. The
  Dashboard and Stage Progress formulas already run to 400.
- Stage Progress snapshot row for 2026-09-29 appended. Done is unchanged at
  219, because the day's work went to Code review, not Done.

## Flags for the team

- **Public roster policy.** Should a school's public page name its minor
  athletes? I made it count them and not name them. Each minor's own
  `/athletes/[slug]` is still public, per the existing `publicProfile`.
  Someone should confirm this.
- **`tests/pilot-school.test.ts` deletes the dev seed.** Its cleanup removes
  `seed_prop_northside`, so running the backend suite against the dev DB drops
  the pilot school. Re-seed with `seedPilotSchool(client, "seed_tenant_btg")`
  from `worker/jobs/seed-environment.mts`. The test should restore it or use
  its own id.
- **Public `not-found` returns HTTP 200** under `(public)/loading.tsx`
  streaming. The not-found UI renders, but crawlers see 200. This is
  pre-existing and affects every public `notFound()`.
- The inquiry has no staff desk in SponsorX. It lives as a Zoho Lead (§18).
  That is fine for Phase 1, but a brief sent from `/brief` is not a
  `CampaignBrief`.

**Nothing committed yet.** Everything above is in the working tree.

## QA pass 7 → [qa-pass7.md](qa-pass7.md)

23 adversarial/edge checks on the P2-FE-01 tree: 21 pass, 2 real defects (F-1 NUL-byte slug → 500 on three public routes; F-2 brief failure copy promises a saved draft but step-4 answers are lost), plus 3 low and 3 info. Not fixed yet.

## QA pass 8 → [qa-pass8.md](qa-pass8.md)

Failure modes, 132-campaign volume, hostile data, cross-tenant, keyboard, 31-route regression smoke, and the production standalone build: all green on the stated checks. New findings: F-9 (medium: /campaigns 100-row cap shown as the whole truth, list + board money undercount), F-10 (medium: saveSocials throws on expired session / outage → error boundary), F-11..F-13 (low), F-14/F-15 (info). Not fixed yet.

## Fix pass for QA 7 + 8 → [qa-pass8.md](qa-pass8.md#fix-pass--passes-7-and-8-same-day)

Fixed F-1…F-6, F-9…F-13 and F-15. F-14 closed (environment). F-7 (public 404 status) and F-8 (analyst spend policy) remain for the team. New: paged `GET /campaigns` + `GET /campaigns/:id`, `server/campaigns.ts`, `lib/brief-inquiry.ts`, `tests/nul-input.test.ts`, `tests/campaigns-paging.test.ts`. Backend 1711/1711, frontend 391/391, build green, re-test walks green.

## QA pass 9 → [qa-pass9.md](qa-pass9.md)

Static review + official e2e + scale/a11y probes. Found and fixed: F-16 (HIGH: public school page named FEATURED minors with no recorded age; now only confirmed adults are named), F-17 (HIGH: raw NUL bytes made three source files binary to git), F-18 (athlete save erased BTG-verified socials), F-19 (row-id cursor truncated on delete and was a cross-tenant existence oracle; now keyset), F-20 (brief timeout copy invited duplicates), F-21..F-23 (low). axe contrast hits were mid-animation artifacts (0 when settled). Official e2e 15/7/0, backend 1720/1720, frontend 391/391, build green.

## Server-side pagination for every growing list → [pagination.md](pagination.md) (`P2-FE-02`, Code review)

37 list screens inventoried; every unbounded one is now offset-paged by the API with DB-side search/filter/sort and summary aggregates for its counts and money; bounded catalogues left client-side on purpose. Backend 1821/1821, frontend 454/454, build green, official e2e 15/7/0, 20-route signed-in walk green.

## Check pass — every page, every role → [check-pass.md](check-pass.md)

14 role identities + signed-out, 195 page visits, access matrix, axe on 47 pages. 0 crashes / 5xx / console errors / overflow; access matrix correct; no cross-tenant or cross-sponsor leak; axe 45/47 clean. Findings C-1..C-5 (2 medium, 3 low), not fixed yet.

## Check-pass fixes C-1..C-5 → [check-pass.md](check-pass.md#fix-pass--c-1-to-c-5-same-day)

Role-aware admin desks + nav (lib/admin-access.ts, "Not in your role"), guardian demo notices, campaign-detail role state, brief-picker contrast, SX-03 notice. Re-walked per role; frontend 458/458, build green, official e2e back to baseline after one transient API-unreachable flake.
## Merge of `main_development` into `development/P2-FE-01-live-reads` (HeckerCreatives)

rcfworks built the athlete home (`P3-FE-06`), property home (`P3-FE-07`),
Operations Board (`P7-FE-06`) and the briefs desk (`P4-FE-07`) in parallel with
`P2-FE-01`/`P2-FE-02`. Resolution: **their screens, our data layer.**

- `/athlete` — their `buildHome`; reads switched to top-3 server pages
  (`/invitations?state=open&sort=expiry`, `/deliverables?state=<DUE_STATES>&sort=due`)
  with counts from `/invitations/summary` + `page.total` and money from
  `/earnings/summary`. Kept the F-3 "not linked to an athlete profile" state.
- `/property` — their `buildPropertyHome`, fed from paged `/team/athletes`
  (`?page/size`) and `/team/inventory` (`?ipage/isize`) instead of
  `/team/roster`; `PagerRow` above and below each list. `teamAthletesPage` now
  selects `legalName`.
- `/admin` — their board on `GET /operations/board`; delivery health capped at
  8 rows (`page.total` in the title); cards filtered by `mayUse` (C-1).
- `/admin/campaigns` — our server-paged board plus their briefs-waiting banner,
  counted from `page.total` of one-row `/briefs` pages.
- Removed my now-orphaned `server/athlete-home.ts`, `server/admin-board.ts`,
  `server/property.ts`, `components/property-lists.tsx` and
  `tests/athlete-home-live.test.ts` (their `gap-screens-live.test.ts` covers it).
- **Tracker:** took theirs, re-applied: `P2-FE-01` Done (owner
  HeckerCreatives), `P2-FE-02` Done (row 261). My raised rows collided with
  rcfworks' `P3-BE-15`/`P3-FE-06` and are renumbered **`P3-BE-16`** and
  **`P3-FE-08`** (Ready). Ranges extended to row 263. Stage Progress
  2026-09-29: S2 21, Done 221, Days left 89 (that figure counted Dropped
  weight; the end-of-day row below uses the tracker script's definition).
- Not yet in the Phase 1 plan doc: definitions for `P2-FE-02`, `P3-BE-16`,
  `P3-FE-08`.

## Tracker sync script runs on Windows (HeckerCreatives)

- `scripts/tracker/tracker_sync.py`: `load_board` now closes openpyxl's
  read-only workbook (the open handle made `board_at`'s temp-file unlink fail
  with WinError 32), and `main()` forces UTF-8 stdout (the Slack emoji crashed
  a cp1252 console). Tests 15/15; `notify` and `digest` dry-runs clean.
- Why: the Slack/Sheet post for the `be0dd9a` push (P2-FE-01/P2-FE-02 Done,
  P3-BE-16/P3-FE-08 raised) didn't go out — Actions is out of minutes. It can
  now be sent by hand from Windows:
  `notify --before 5650915 --after be0dd9a`, then `digest` (README has the
  steps). Don't use `Run workflow` for it: `after~1` is the same board.

## `P3-BE-16` · Post-approval profile edits, and `P3-FE-08` · ACTIVE public profile (HeckerCreatives)

The two tasks I raised this morning, closing my Phase 1 list.

**`P3-BE-16` — change requests, reviewed by BTG.** Product decision: the
board's acceptance ("public-facing changes reach the public profile only
after BTG approves") settles the open question — a change-request model, and
*every* reviewed section goes through BTG (restrictions and capabilities feed
matching and the §26 conflict check, not only the public page).
- `AthleteProfileChange` (migration `20260929180000`): `sections`, `fields`
  Json (column → proposed value, only what differs), `note`, state
  PENDING/APPROVED/DECLINED/WITHDRAWN, reviewer notes/by/at.
- Resource `athleteProfileChange` in policy.ts + scope.ts (nested under the
  athlete: ATHLETE own, GUARDIAN ward, BTG_ADMIN/NETWORK_MGR own-tenant ×3,
  SUPER_ADMIN any). RBAC doc §5 row added first; matrix digest →
  `dde2dbbea5dc8018` (grid without the new rows still hashes to the old
  `49b852630719d073` — nothing else moved).
- `domain/athlete-profile-change.ts`: submit (post-approval states only,
  drops unchanged fields → 422 if nothing changes, supersedes an open one on
  the record), withdraw, my list (cap 10), paged desk list with the
  athlete's `current` values, decide (approve writes the Athlete row in the
  same tx, audits `athlete.restrictionsSet` separately; decline needs
  notes) + emails `athlete.profileChangeApproved/Declined` (worker templates
  added).
- Routes: `GET /athletes/me/profile-changes`, `POST /athletes/:id/profile-changes`,
  `GET /profile-changes?page&size&state`, `POST /profile-changes/:id/approve|decline|withdraw`
  — registry + openapi coverage list + tenant-isolation PARAM/BODY maps.
- Frontend: `/admin/profile-changes` desk (NETWORK_MGR/BTG_ADMIN/SUPER_ADMIN via
  admin-access + nav; server-paged, "now → proposed" table, §26 badge on
  restriction changes, Approve / Decline-with-notes island); the live editor
  now has forms for identity (legal name read-only), sport, capabilities,
  interests, restrictions → "Send to BTG for review", a banner for the open /
  last-decided request with Withdraw. Pre-approval athletes are told the
  application is what changes.
- Tests: `backend/tests/profile-change.test.ts` (16), authz matrix/coverage,
  tenant-isolation (all six routes refused across tenants),
  `frontend/tests/profile-changes-live.test.ts` (6).

**`P3-FE-08` — ACTIVE athletes on real data.** `publicProfile` now selects
the §11 public sections (city, level, achievements, capabilities, interests,
socials with source) — still no legal name, contact, birth date, band, grad
year, rates or restrictions. `/athletes/[slug]`: `fetchPublicAthlete` answers
ok / missing / down; missing → `notFound()`, down → error boundary, ACTIVE →
new `active-profile.tsx` ("Request a proposal" → `/brief`), FEATURED
unchanged. The fixture profile is no longer reachable on this route.

**Bookkeeping.** Tracker: both Done (owner HeckerCreatives, 2026-09-29);
snapshot row for 2026-09-29 replaced with the end-of-day numbers. Phase 1
doc: definitions added for `P2-FE-02`, `P3-BE-16`, `P3-FE-08` (they had
none). Not done: the Operations Board has no "profile changes" queue card
yet (the nav link and the desk's own count cover it for now).
- Verified: `npm run build` clean; `next start` smoke — `/athletes/jordan-reed`
  and `/athletes/sam-ellis` (ACTIVE adult / minor) render live with no legal
  name, age or rates in the HTML; `/athletes/nobody-here` renders the
  not-found page. NB the response status is 200, not 404: the `(public)`
  `loading.tsx` streams the shell before `notFound()` can run — the same
  behaviour as `/properties/[slug]` and the other public pages. A real 404
  would need that boundary removed for these routes; not done today.
- The FEATURED branch was not re-walked (no FEATURED athlete in this local
  DB — Maya is the persona seed); its page code is unchanged and
  `next-rights.test.ts` covers the API shape.

## All remaining design tasks designed; NEXT public pages built and wired (rcfworks)

- **Designs (Claude Design, from the programme owner's one brief)** — all four
  remaining ART tasks now at Code review with their canvases:
  `P1-ART-08` NEXT public pages (JJ3fteuVxQM39Ysj7k7GAz), `P6-ART-01`
  printable QR formats (UmkyjWppiZ2PPDoeJ5RnBU), `2S0-ART-01` the 14 Phase 2
  screens (RNykbEaHgkiMppTXandrrB, 144 artboards), `4S0-ART-01` the 10
  INFINEX screens (KBMLqnbXedfz6UiXTRC6Ue; the row says 12, the plan
  defines 10). Phase 3 has no ART task.
- **Batch 1 built — `P1-FE-24/25/26`, `P9-FE-06` (Code review).**
  - `/next/about` landing — at /next/about because `(app)/next` is the
    student portal (spec §8 put both at /next; one URL, two pages).
  - `/next/apply` wizard, phone-first; guardian step on the API's own minor
    rule; progress saved on the device. **Not built (noted):** emailed
    resume link, guardian consent email, "my school isn't here" waitlist —
    the copy promises none of them.
  - `/next/schools` proposal, print-clean; contact `next@sponsorx.net` is
    SIMULATED (`NEXT_CONTACT_EMAIL`).
  - Backend: `POST /public/students/applications` now requires and captures
    a minor's guardian (422 without); `transitionStudent → APPROVED` creates
    the student's and guardian's logins (`athlete-login.ts`); new
    `GET /public/next/schools` and `GET /public/next/editions`.
  - Tests: backend `next-public-apply` (8, mutation-checked twice),
    `next-students` updated to the guardian rule; frontend `next-apply` (9).
    Walked locally: a 15-year-old applied on a phone and reached Ms. Patel's
    advisor queue.
- **Merged main_development in** (teammate's P2-FE-01/02 live reads and
  paging, P3-BE-16/P3-FE-08). One import conflict in `student.ts`, both
  kept. After the merge: backend 1872 pass (the known local QA-02 lock test
  the one failure), frontend 484 pass, build and lint clean. Tracker: took
  the teammate's workbook and re-applied my eight rows.
- **Next batches:** printable QR templates (P6), then the Phase 2 screens
  whose backend exists. Phase 4 can't be connected — no backend exists.
- **Batch 2 — `P6-ART-01` printable QR, made usable.** `/print/reward`
  (admin access; "Print templates" beside "Download QR" in a reward's QR
  panel) fills the poster 11×17, table tent 4×6 folded and sticker 3×3,
  light or dark brand, with the token's real signed QR image, sized in real
  inches (`@page`). Measured in the browser: QR 4.00 / 1.75 / 1.25 in. The
  panel's padding adds 2 modules to the PNG's own 2 (quiet zone ≥ 4,
  `lib/qr-print.ts`, tested). No sponsor logo is stored, so the sponsor's
  name is the wordmark. Checked locally with a real QR from the worker's own
  renderer (a live reward needs R2, which this Mac doesn't run).
