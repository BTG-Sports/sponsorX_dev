# 2026-09-24 — tasks completed

## `P1-FE-21` — the edition page map, as a live flatplan

*Code review. The design went through the visual companion (three concepts;
flatplan chosen), then an approved terminal design, then the spec:
`docs/superpowers/specs/2026-09-24-edition-page-map-design.md`.*

`/admin/next/editions` renders the Fall 2026 issue as facing spreads with ad
slots at their true positions — the editor's flatplan wall, live. Sold = solid
violet + sponsor monogram, reserved = dashed hold **naming who it is held
for**, open = quiet surface showing the rack price, editorial = stripes. The
back cover renders apart as a framed 1-of-1 with its price and the "unsellable
after close" warning. The §5.2 production gates (contentReady, rightsCleared,
revenueMet) are explicit pass/fail chips above a violet minimum-viable meter
that spells out the shortfall — $5,300 of $6,500, $1,200 to go, 16 days.

### Decisions worth recording

**The flatplan fixture is the single source, and tests make it so.**
`editionPages` (20 pages, 24 slots incl. `BACK-01`) now *derives*
`studentEdition.committedCents` — the student portal's edition card and the
admin map render projections of the same array. `tests/edition-fixtures.test.ts`
pins: Σ(sold values) = committed; counts = 11/4/9; back cover singleton; slot
codes unique; **Jordan's three attribution rows appear on the map with matching
sponsor and value**; and the two in-flight prospects (Iron Path Gym, Delgado's
Pizzeria) hold reserved slots by name. Two surfaces, one story.

**A hold names its holder.** RESERVED without `holdFor` fails the test —
a hold nobody can account for is an open slot someone is afraid to sell.

**Sale value ≠ rack price, visibly.** Rosa's quarter closed at $450 against a
$250 rack (coupon add-on); the drawer says "differs from rack — value frozen
at close." That is the `SalesAttribution` frozen-value rule surfacing in UI.

**Magazine geometry is respected.** The cover renders recto (right of the
spine), a trailing lone page verso — caught in the render-and-look pass, where
page 20 was stretching across the whole spread before the spacer fix.

**Portal chrome vs. programme color.** The screen lives in the admin portal
(steel chrome) but every NEXT inventory mark is violet — same split as the
student portal. State encoding is shape + color (fill / dashed / empty /
stripes), never color alone.

### Verification

62 frontend tests green (8 new invariants), backend untouched, build and
eslint clean. Overflow measured with headless Chrome at 390/470/768:
`scrollWidth === clientWidth` at every width (the P1-FE-19 lesson, now a
standing check — the rail here shipped with `min-w-0` from the start).
Screenshots eyeballed at 390 and 1280; the drawer, holds, monograms and gates
all render as specced. Admin nav gained "NEXT editions" (book glyph); the dev
route map lists the screen.

Board: `P1-FE-21` → Code review (HeckerCreatives, 2026-09-24), snapshot row
appended (Done 91 · 428 days — unchanged; Code review is not Done). Google
Sheet still needs its hand mirror at end of day.

## Merged and pushed — both developers' day, one branch

The second binary-board merge in two days, resolved the same way: took the
other side's xlsx, re-applied our three FE rows by hand, re-extended the
validation and conditional-formatting ranges (**third time the 237 trap has
fired** — his side had re-extended only the Dashboard, to a safe $400), and
appended the day's snapshot computed from the *merged* sheet: **Done 121 ·
354 days**, which is the first snapshot to count his Stage 5–7 closures.
The 2026-09-23 memory log conflicted add/add both times; both sides kept in
day order, nothing dropped.

Two merged-tree findings worth keeping:

- **His new `qrcode` dependency needs `npm install` after pulling** — the
  build fails with a missing-declaration error that looks like a types
  problem and is actually a stale node_modules.
- **`payment-policy-compliance.test.ts` broke on Windows paths with spaces:**
  `new URL(..).pathname` yields `/D:/iCARRe%20Solutions/…`, which spawnSync
  rejects with ENOENT before grep runs. Fixed with `fileURLToPath` — the
  cross-platform way to turn `import.meta.url` into a cwd. His test logic
  untouched; 1015 backend tests green on this machine after the fix.

Pushed `main_development` at `360743a` — flatplan, student portal, login
redesign and the board fixes all published.

## `P1-FE-22` — the ad slot inventory ledger

*Code review. The list behind the page map, per its own definition.*

`/admin/next/inventory`: every sellable position in one filterable table —
state as the flatplan's shape+color mark plus a badge, buyer or **named hold**
per row, rack price and frozen sale value side by side (Rosa's $450 against a
$250 rack renders the SalesAttribution frozen-value rule as a visible fact).
Totals strip: committed $5,300 (violet), $4,800 still on the rack, 46%
sell-through, $11,900 full rack value.

- **filter-kit reused, not rebuilt** — the acceptance's second clause.
  SearchInput + two Dropdowns + dismissible FilterChips, admin tone for desk
  chrome, violet only on data marks; filters instant, URL-synced via
  `replaceState`.
- **The two NEXT admin screens now cross-navigate:** every ledger row's
  "Map →" deep-links to its page's drawer on the flatplan (`?open=N`, back
  cover = 0) — `EditionFlatplan` gained `initialOpenPage` for it.
- **Contained scroll, not page scroll:** the table scrolls inside its own
  `overflow-x-auto` container; page-level `scrollWidth === clientWidth`
  verified at 390/470/768. The measurement script flags the table cells —
  correctly, they are wider than the viewport — but the page never moves.
- No new fixtures and no new invariants needed: the ledger is a projection of
  `editionPages`, so the existing suite already guarantees it cannot disagree
  with the map or the student portal.

62 frontend tests green, build and eslint clean, screenshots eyeballed at 390
and 1280. Board: `P1-FE-22` → Code review (HeckerCreatives, 2026-09-24).
Google Sheet still needs its hand mirror at end of day.

## `P1-FE-20` — the advisor desk

*Code review. The third NEXT surface of the day, and the cheapest by design:
its acceptance is mostly reuse.*

`/advisor` (applications) and `/advisor/review` (content) for one school.
The `Portal` union gained its **sixth member** — `advisor` shares the NEXT
violet with its own label ("NEXT Advisor"), because it is the same programme;
`PORTAL_ROLES` admits the Stage 9 `ADVISOR` string (matches nobody yet) plus
the two BTG admin roles for preview, exactly the `/next` precedent.

- **ApprovalsDesk reused unchanged** — the acceptance's second clause, and
  the P1-FE-20 definition's whole thesis: `DeliverableState` *is* an
  editorial workflow. The school's queue feeds it `ReviewContentItem` rows
  where campaign = section, athlete = student, sponsor = "Editorial" unless a
  paid feature previews placement. Jordan's rows mirror `studentAssignments`
  states one for one, so the student portal and the advisor desk tell one
  story about the same drafts.
- **Applications render note-first** — the advisor's real review is knowing
  the kid; the note is the biggest thing on the card. `StudentApplicationState`
  is the SUBMITTED/UNDER_REVIEW/APPROVED slice of spec §5.1's `StudentState`
  (which mirrors `AthleteState` deliberately). Approve / Request changes ship
  disabled naming `P9-FE-02`.
- **The boundary is stated on the desk itself:** the hero copy says publishing
  economics and rights stay with SponsorX — V3 §3's rule, put where the person
  it governs will read it.

62 frontend tests green, build and eslint clean, page-level no-horizontal-
scroll verified at 390/470/768, screenshots eyeballed. Board: `P1-FE-20` →
Code review (HeckerCreatives, 2026-09-24).

## `P1-FE-23` — revenue splits, deliberately unlike earnings

*Code review. The acceptance is negative space: "visibly distinct from the
athlete earnings surface." The design answers with structure, not styling.*

`/admin/next/splits`: the four §5.7 payees per edition — SponsorX 4,000 bps ·
school 3,000 · student pool 2,000 · editorial fund 1,000 — with amounts
**derived from committed revenue at render time, never transcribed**. Tests
pin bps summing to exactly 10,000, remainder-free allocation, and the four
kinds appearing exactly once each.

What makes it un-earnings, on purpose: the hero is a single 100% **allocation
bar** (four fixed categorical hues, labeled segments) where earnings has
payout tables and trend lines; shares speak **basis points**, which finance
never does; and a boundary card states the §5.7 rule where the reader is —
an Earning is one athlete's NIL compensation, a split is an edition
allocation, and keeping them apart is what stops a finance reconciliation
returning a minor's scholarship pool. The student-pool card repeats the §5.5
line: never paid to a student directly. Adjust-shares ships disabled naming
`P9-FE-05`.

65 frontend tests green (3 new), build and eslint clean, no page overflow at
390/470/768, screenshots eyeballed (one literal-backtick typo caught and
fixed). Board: `P1-FE-23` → Code review (HeckerCreatives, 2026-09-24).

## `P1-FE-30` — the points balance, and the tab goes live

*Code review. The student portal is now complete: all five tabs real.*

`/next/points`: violet balance hero (trophy, `pts`, CountUp) with the
next-SALES_500 meter; the accrual timeline ("written once, never edited" —
the §5.5 append-only shape rendered as fact); the earn vocabulary as a rules
card from a new `POINT_RULES` fixture (ARTICLE 50 · INTERVIEW 25 ·
APPOINTMENT 25 · SALES_500 100 · VIEWS_BONUS varies, the editor's call); and
a "what points are not" card. **No currency sign appears anywhere on the
page** — the same negative-space acceptance as splits, aimed at a parent.
"Redeem" ships disabled naming the genuinely open §14 question rather than a
wiring row: redemption is a business/legal decision, not a missing endpoint.

A new test pins fixed-value reasons to their rule's value, joining balance =
Σ accruals. The inert nav item and tab-bar slot went live; the dashboard's
points tile now links.

66 frontend tests green, build and eslint clean, no page overflow at
390/470/768, screenshots eyeballed. Board: `P1-FE-30` → Code review
(HeckerCreatives, 2026-09-24).

## `P1-FE-29` — the rights ledger, and the gate it feeds

*Code review. The last NEXT screen with no design dependency.*

`/admin/next/rights`: one table answering the production gate's one question —
*what may we do with this asset?* The hero shows **coverage per use**, because
print and digital are separate permissions (spec §5.3): Fall 2026 stands at
digital 6/9, print 5/9, which is precisely the digital-first-can-clear-while-
print-waits posture the spec designed for. The clearance queue names what is
missing and **who can grant it** (a guardian's print initials, an applicant's
enrolment-pending consent, a fresh acceptance for a use the original never
covered). The ledger renders per-permission marks, grant windows, and evidence
chips — consent acceptance vs negotiated licence, visually distinct.

Invariants added: **exactly one of acceptanceId/licenseRef per right** (the
spec's own rule — a right with both or neither is not evidence); **BTG content
pins `mayReuseCommercially` false** (V3 §6); every queue row names its gap and
its grantor. And the editions page's rights gate now **derives from the
clearanceQueue fixture** instead of a hardcoded "3" — one source, like
everything else on this edition.

69 frontend tests green, build and eslint clean, no page overflow at
390/470/768, screenshots eyeballed. Board: `P1-FE-29` → Code review
(HeckerCreatives, 2026-09-24).

## `P1-FE-27` — the free digital edition, readable

*Code review. Built despite the P1-ART-08 gate, deliberately: this is the one
design-gated screen the spec constrains hard enough that the rebuild risk is
minimal — principle 10 makes it a V1 product, and the acceptance forbids the
one thing a designer would add (a long-form type scale). Re-check against
ART-08 when it lands; noted on the row.*

`(public)/next/northside-high/fall-2026`: cover with a plain-anchor contents
(sections + minutes), then **the flatplan walked in page order** — articles on
the editorial pages, sold slots as sponsor cards, open slots as the house ad
that names the student sales model ("every ad in this magazine was sold by a
student — ask any of them for their code": the funnel, live from day one),
the 1-of-1 back cover pitch, and a masthead footer carrying the consent line.
Bylines carry class years, because a student's public portfolio is this page
existing.

Decisions worth keeping:

- **Reserved slots do not render.** A hold is not public information — the
  reader shows sold and open only.
- **Unknown editions 404.** One fixture edition exists; everything else is
  unreachable, which is the exact unpublished-is-unreachable behavior
  `P9-FE-07` later enforces against `EditionState`. The fixture behavior and
  the wired behavior agree by construction.
- **No new type scale** — prose is the house base/leading inside a measure.
  The named scope error, not committed.
- Two new invariants: every article opens on an *editorial* flatplan page,
  and **no byline belongs to an unapproved applicant** (caught live: the
  season-openers piece was first bylined to Maya Chen's fellow applicant
  Priya Nair, who isn't enrolled yet).

71 frontend tests green, build and eslint clean, no page overflow at 390/470,
screenshots eyeballed. Board: `P1-FE-27` → Code review (HeckerCreatives,
2026-09-24).

**Seven NEXT screens shipped today.** Stage 1's UI scaffold is now built
except the true audience-voice set — P1-FE-24, 25, 26 (public landing, apply
wizard, school adoption) and P1-FE-28 (claim flow) — which genuinely need
P1-ART-08 / the frontEndVersion2 rebuild before they're worth pixels.

## `P3-FE-01` — /join wired to the real API, the first Block B substitution

*Code review. With the NEXT scaffold done, the day pivoted from fixtures to
wiring — and the join wizard's own header had promised this seam from the
start: "P3-FE-01 wires the API and replaces only where answers go."*

The submit now POSTs through a **server action** — `API_URL` stays
server-side, per the api.ts rule that the browser has no business knowing the
address — to `POST /applications/intake`. Success carries the reference id
and continuation token into the localStorage draft and onto the submitted
screen; failure lands the API's field errors on the inputs they mean and
jumps back to the earliest offending step. The draft survives every failure.

**`draftToApplication` is pure and tested** (5 new cases): names join,
`stateCode` uppercases — with a new location-step check so "Maryland" fails
at the step instead of a round-trip — free-text level maps to the contract
enum or omits (guessing is worse), and the wizard's single follower total is
deliberately **not** split into per-account counts, because fabricated
provenance is worse than none (§22).

**A backend defect surfaced and fixed:** a `ZodError` carries no `status`, so
the error middleware answered a typo'd email with **500 internal_error** —
telling the caller we broke when they did. New `lib/error-body.ts` (pure,
"rules import nothing" pattern, 2 tests) maps validation to **400 with named
issues** for every contract route — the portals and §8's service account
alike.

**Verified end to end, not just by tests:** headless Chrome filled the real
wizard as a minor — the §4 guardian branch appeared (ten sections traversed;
an adult path is nine) — and the row landed in Postgres: SUBMITTED,
birthDate 2009-03-14, stateCode MD, school mapped from "team", the Instagram
handle stored SELF_REPORTED. Backend 1017 tests, frontend 76, build and lint
clean.

Board: `P3-FE-01` → Code review (HeckerCreatives, 2026-09-24). Eight rows now
sit at Code review from today. Google Sheet still needs its hand mirror at
end of day.
---

## Leftovers from 2026-09-23 — worked through (rcfworks)

| Item | State |
|---|---|
| Leftovers queue (PR #35) | Merged into `main_development`. PR **#36** `main_development` → `main` open; `b278323` builds clean, 1077 tests pass. |
| **`External_Id` vs `SponsorX_ID`** | **Resolved: `SponsorX_ID`.** Live Zoho `Accounts` field read 2026-09-24: `SponsorX_ID` is an org-level external field; no `External_Id` exists. `P8-INT-01`'s acceptance fixed in the Phase 1 doc and the tracker (Phase 1 `P164`), plus the code sample in Implementation Guide V2. |
| graphify graph | Rebuilt (`graphify update . --force`, AST only): 3965 nodes, 287 communities, indexes `frontend/` + `backend/`, zero `src/server` nodes left. The labels for the new communities are hub names; doc changes since 21 Sep are not re-extracted semantically. |
| Four stale remote branches | Verified fully on `main` (`b6_tracking_reward`'s only extra commit is the PR #24 merge). **Not deleted** — branch deletion needs the user's permission. |
| Railway production | **Done (manual approval mode).** Production `api` instance created (Dockerfile build, pre-deploy `prisma migrate deploy`, `/health`, `PORT=4000`) and deployed at `a7bed10` — all 9 migrations applied to Postgres-production, API listening, worker up. Production `web` now builds from the workspace split (`npm run start -w @sponsorx/frontend`) and is deployed at `a7bed10`, replacing the 18 Sep `59827ee7` build. Both services now have a `main` trigger in production. **Follow-up (same day):** production `api` now carries staging's `S3_*`, `R2_PUBLIC_BASE_URL` and `RESEND_API_KEY` (user's call: reuse staging storage until Phase 2 gives production its own buckets) and was redeployed. The API's private hostname was renamed `worker` → `api` in staging (it still carried the pre-rename `worker` endpoint from 21 Sep); verified from inside both `web` containers via `railway ssh`: `api.railway.internal` resolves and `/health` returns 200 in staging and production, `worker.railway.internal` is gone. Still open: no public domain on production — `sponsorx.net` (Cloudflare DNS, no A/MX/www records, so attaching it disturbs nothing) is the recommendation, because production Clerk is a **live** instance on `clerk.sponsorx.net` and sign-in would not work on an `up.railway.app` address. |
| `P7-BE-06`, `P7-BE-02` wording, §15 `invoice` row, stage 8 (O-2/O-5/O-6) | Still business decisions — unchanged. |
| `P6-BE-05` GeoLite licence, Google Sheet mirror | Still the user's. |


**Bug found and fixed:** `/t/<unknown code>` on staging redirected to `https://localhost:8080/` — `frontend/src/app/t/[code]/route.ts` builds the fallback with `new URL("/", req.url)`, and behind Railway's proxy `req.url` is the container's own address. Fixed by returning a relative `Location: /`; `frontend/tests/tracking-redirect.test.ts` reproduces the proxied `req.url` and failed before the change.

**Railway SSH:** an ed25519 key (`~/.ssh/id_ed25519`, registered as `bob-mac`) now lets `railway ssh --environment <env> --service <svc> -- <cmd>` run commands inside containers — the only way to test the private network, since the API does not log requests and httpLogs cover public traffic only.

## Business decisions taken 2026-09-24 (user) — applied

| Item | Decision | Applied |
|---|---|---|
| **`P7-BE-06`** report render worker | **Retained and parked**, not dropped. The frontend's browser PDF (`frontend/src/lib/report-pdf.ts`) is the demo for now. | Board → Blocked with a PARKED note; Phase 1 doc gains a *Parked* line. G-07's confirmation box stays blank — nothing was decided about requiring a file. |
| **`P7-BE-02`** earning release | **Option A:** one earning per order, released in full when the **last** deliverable is verified. Deliverables are already created from the order's NIL job at acceptance (`createDeliverablesFromJob`), so each is tied to the task originally set. | Wording amended in the Phase 1 doc and the tracker to match the code. No code change. |
| **Invoice visibility** | **BTG admin and the invoiced sponsor only.** Athletes never see invoices — they see their `earning`; the invoice would expose the margin (§7.1). | New RBAC resource `invoice` (matrix §11 + `policy.ts`): SUPER_ADMIN any · BTG_ADMIN own-tenant · SPONSOR_ADMIN/ANALYST own · everyone else denied, including FINANCE, CAMPAIGN_MGR and SALES. `invoicesForCampaign` / `paymentStatusForCampaign` gate on it, with the campaign lookup still narrowing a sponsor to their own campaigns. 13 new tests; matrix digest `bc4ddbf83a1e7538` → `441c358e69d81f98`, verified that only the four `invoice` cells moved. Tracker note on `P7-BE-04`. |

Verification: `npm run build` clean; backend 1027 passed / 13 skipped, frontend 65 passed.

## Backend batch — P3-DATA-01, P6-SEC-02, P6-SEC-03, P8-PMO-01, P2-BE-09 (rcfworks)

**Scope decision first (user, 2026-09-24):** no "sponsor may contact me about offers" consent option in Phase 1. It is now Phase 2 `2S6-BE-03`, and `P6-INT-01` (consent-gated Zoho lead push) moved with it as `2S6-INT-03` — it cannot meet its acceptance without that consent. Phase 1 board row set to *Dropped* with a MOVED note; Phase 2 sheet gained the two rows (Order 52.1, 52.2 — inside the existing ranges, no formula edits). Phase 2 now 66 tasks.

| Task | State | What enforces the acceptance |
|---|---|---|
| **`P3-DATA-01`** pilot cohort import | **In progress** — built, not yet run on staging | `npm run cohort:import -w @sponsorx/backend -- file.csv` validates the whole file against `AthleteApplicationInput` and queues ONE `athlete.importCohort` job; the worker creates each athlete through `createApplicantIn` (extracted from `/join`'s `submitApplication`) → SUBMITTED, skipping existing emails. Production refuses unless the file's sha256 is in `COHORT_IMPORT_APPROVED_SHA256` (Railway's `RAILWAY_ENVIRONMENT_NAME` tells staging from production — both run NODE_ENV=production). Example file: `backend/scripts/cohort-import.example.csv`. **Next step:** after merge + staging deploy, run it on staging via `railway ssh` with 25 rows, then Code review. |
| **`P6-SEC-02`** fan PII purpose limitation | Code review | The RBAC matrix already made reward events aggregate-only for every role (§10) and fan contact BTG-only (§7.2). A first cut that listed claim rows was **withdrawn** for breaking that. Enforcement is structural: `backend/tests/fan-pii.test.ts` fails the build if any query selects `fanEmail`, reads a RewardEvent without a column list, or puts the address in a raw SQL SELECT (mutation-checked). |
| **`P6-SEC-03`** fan unsubscribe | Code review | Signed `<claimId>.<hmac>` link (`lib/unsubscribe-token.ts`, own HMAC purpose) in the `reward.claimed` body and as RFC 8058 `List-Unsubscribe` headers → web `/u/[token]` (GET = one button, never withdraws — link scanners; POST = withdraw) → `POST /api/v1/public/unsubscribe/:token` → `withdrawFanConsent` stamps `RewardEvent.consentWithdrawnAt` (migration `20260924120000`), first tap wins, audited. The email worker refuses a fan template without the link and re-checks withdrawal in SQL before sending. Fan addresses no longer appear in the worker log. AC clause 3 amended (lead push → Phase 2). |
| **`P8-PMO-01`** OpenAPI | Code review | The spec had components but **zero paths**. All 70 operations now registered in `contracts/registry.ts` with the handlers' own Zod body schemas; `tests/openapi.coverage.test.ts` walks the live Express routers and fails on an undocumented route or a phantom path. |
| **`P2-BE-09`** repo layout | Code review | AC amended to the Addendum B layout; six stale pre-split `.gitkeep` placeholders removed (they pointed at `frontend/` for things that live in `backend/`); `tests/layout.test.ts` pins it. |

Verification: `npm run build` clean; backend 1083 passed / 13 skipped; frontend 69 passed; eslint clean.

**`P3-DATA-01` → Code review (same day).** After #42/#43 deployed (`ef90f10`, all four services green), the import ran on staging via `railway ssh --environment staging --service api -- npm run cohort:import -w @sponsorx/backend -- /tmp/pilot-cohort-staging.csv`: worker logged `25 created, 0 skipped`; the staging DB holds 25 `pilot.*@example.com` athletes in SUBMITTED. These are synthetic test athletes sitting in the staging review queue — reject or leave them; the real cohort is `P8-DATA-01`. A live re-run and a live production-refusal check were blocked by the permission classifier (production shell); both behaviours are covered by `tests/cohort-import.test.ts`.

## B8 batch — Zoho sync + hardening (rcfworks)

Ten tasks asked for; nine buildable. **`P8-DATA-01` needs the real first-25
cohort file** — it cannot be invented; the tool (`cohort:import`) is ready.

**Decisions taken (approved with the plan):** O-2 adopted — a campaign is a
Zoho Deal (keyed `brief:<id>`, renewal `renewal:<id>`). O-5 — `User.zohoUserId`,
filled by the backfill's Users step by email; a task's CRM owner is the staff
member who raised it, unmapped → API account. O-6 closed — the `SponsorX-Dev`
sandbox refresh token was minted today (user clicked the Self Client code;
exchanged here, Keychain `sponsorx-zoho-sandbox-refresh-token`). Staging `api`
now holds it with `ZOHO_EXPECTED_ORG_ID=7554807000000020005` and the
Notifications channel (`ZOHO_NOTIFY_*`), set with `--skip-deploys`.

| Task | State | What enforces the acceptance |
|---|---|---|
| `P8-INT-01` outbound push | Code review | Worker-only `src/lib/zoho.ts` + `src/domain/zoho-sync.ts`. Brief/campaign transitions ENQUEUE `zoho.pushDeal` / `zoho.pushTask` in their own transaction; the worker pushes parents first (account → contact → deal → task), every create an upsert on `SponsorX_ID`. |
| `P8-INT-02` loop prevention | Code review | One shared projection per object, hashed identically both ways; echoes dropped outbound and inbound; a push asserts Stage only when our row changed since the last sync; both-sides conflicts audited as `sync.conflict`. |
| `P8-INT-03` inbound route | Code review | `POST /api/v1/webhooks/zoho/crm` — channel token + id verified, delivery row + `zoho.ingestCrm` in one transaction. `tests/zoho-boundary.test.ts` proves nothing reachable from `src/app.ts` imports the Zoho client. |
| `P8-INT-04` delivery recording | Code review | RECEIVED / REJECTED at the route (both webhooks — the invoice route used to 401 unrecorded), APPLIED / REJECTED / FAILED by the worker. |
| `P8-INT-05` reconciliation | Code review | Nightly, report-only, one `ZohoReconciliation` row per module. |
| `P8-INT-06` leads + renewal | Code review | `Inquiry` + `POST /api/v1/public/inquiries` → Lead; campaign COMPLETED → renewal Deal + renewal task. |
| `P8-INT-07` backfill | **In progress** | Built and tested (idempotent). **Runs on staging after this merges** — `railway ssh … -- npm run zoho:backfill -w @sponsorx/backend`, then Code review. |
| `P8-SEC-01` matrix complete | Code review | `inquiry`, `syncTask` rows (doc + policy; digest moved only by them). `tests/authz.coverage.test.ts`: every Prisma model governed or declared internal. "Required CI check" cannot be enforced by GitHub on this Free account — it runs in CI on every push/PR. |
| `P8-SEC-02` isolation | Code review | **Found a real cross-tenant leak and fixed it** — see below. |

**The leak.** `whereFor()` returned a bare fragment that callers spread and
then overrode: `{ ...whereFor(...), id }`. `MATCHES_NOTHING` is `{ id: { in: [] } }`
and the `own` scopes key on `id`, so "matches nothing" became "this id in any
tenant" and "your own athlete" became "any athlete in the tenant". A tenant-B
athlete read tenant A's full sponsor report. Fixed at the source — `whereFor`
returns `{ AND: [scope] }`. `tests/tenant-isolation.test.ts` (every route × four
tenant-B actors, real API + DB, tenant-A fingerprint unchanged) and
`tests/tenant-scope.static.test.ts` both go red with the fix reverted.

**Found only against the live sandbox** (the fake org could not have):
Tasks cannot be upserted (Zoho: "module is not supported for this api") →
find-then-write on `SponsorX_ID`; COQL accepts only `=`/`!=` on the external
field → reconciliation pages the records API. Recorded in field-mapping §12.1.
Also fixed from tests: `Closing_Date` / Deal-name month were shifted a day by
the timezone. A full live run against `SponsorX-Dev` (all four objects, Lead,
renewal, dedupe, echo, zero-drift reconcile) passed; every test record deleted.
The worker's watch subscription was accepted live and then removed.

Verification: `npm run build` clean; lint clean; backend **1204 passed, 0
skipped** (local Postgres from a scratchpad binary, so the DB suites ran —
CI runs them too); frontend 69 passed. Stage Progress snapshot unchanged
(nothing moved to Done).

**Closed to Done (user's instruction, acceptance confirmed met):** `P8-INT-01`,
`P8-INT-02`, `P8-INT-03`, `P8-INT-04`, `P8-INT-05`, `P8-INT-06`, `P8-SEC-02`.
`P8-SEC-01` stays at Code review — its "required CI check" clause cannot be
enforced on this account. Follow-up #46 (CRM jobs wait in the outbox on a
worker without credentials) merged into `main_development`. Today's Stage
Progress snapshot updated: S8 7, Done 128, days left 333.

**`P8-INT-07` → Code review (after #45 deployed staging).** Migration
`20260924160000_zoho_sync` applied; the worker subscribed the Notifications
channel and ran a clean reconciliation on boot. `railway ssh … -- npm run
zoho:backfill -w @sponsorx/backend` against the sandbox: 10 accounts and 10
contacts imported with `SponsorX_ID` written back; a second run created 0.
Live inbound confirmed: an account renamed in the sandbox arrived at
`/webhooks/zoho/crm`, recorded `APPLIED`, and the staging sponsor took the new
name (origin ZOHO); the name was then restored. Staging now holds 10 sandbox
sample sponsors ("… (Sample)") — test data. #48 (`main_development` → `main`,
tracker only) is open so the two branches match.

## P8-DATA-01 — simulated pilot cohort (rcfworks)

**User decision:** "whatever we can simulate, we simulate" — a two-person team
cannot wait on BTG for data. The acceptance was amended from "the real
first-25" to a representative simulated cohort, replaced by the real one at
launch through the same `cohort:import` path (Phase 1 doc + tracker).

Staging now holds: **25 simulated athletes** from
`backend/scripts/pilot-cohort-simulated.csv` (5 minors at `16_17`, DMV states,
eight sports, fictional schools, `sim.*@example.com`), SUBMITTED in the review
queue — the 25 `pilot.*` rows from this morning's importer test were removed
first; and **5 simulated sponsors** (Harborline Coffee Co., Bayside Fitness
Studio, Chesapeake Auto Group, Rowhouse Pizza, Capital Sports Physio) with a
contact each, created in the Zoho sandbox and brought in by the backfill,
beside the sandbox's 10 "(Sample)" accounts. Board: `P8-DATA-01` → Code review.

## Batch 3 — five tasks + P7-BE-06 moved (rcfworks)

| Task | State | Proof |
|---|---|---|
| `P6-FE-02` fan redeem page on real tokens | Code review | `/r/<token>` is a script-free route handler over the new read-only `GET /public/rewards/:token`; claim/redeem are plain form POSTs; LANDING is an image beacon. `tests/redeem-page.test.ts` + a live curl run (real API + Next + DB): every state, a real claim with consent version, one redeem then "Already used", exactly one event of each type. |
| `P4-FE-01` marketplace + brief | Code review | New `GET /catalogue/packages|jobs` (sponsor prices). A signed-in sponsor sees them and files a real DRAFT brief via `submitBrief`; demo unchanged. `tests/brief-contract.test.ts` files the frontend's own body through the API. `/me` returns `sponsorId`. |
| `P4-SEC-02` field-level authz | Code review | `tests/sponsor-field-authz.test.ts`: pay markers in every pay column, every GET as sponsor, none leak (mutation-checked). |
| `P8-SEC-03` public surface review | Code review | `documentation/SponsorX-Public-Surface-Security-Review.md`. Fixed: rate limits counted the web server (edge key, set on staging), `javascript:` tracking destinations, validation 500 → 400. |
| `P8-OPS-02` load test | In progress | Runs on staging after this deploys. |

`P7-BE-06` → Phase 2 `2S7-BE-02` (Phase 1 row Dropped/MOVED; Phase 2 row 69,
all Phase 2 ranges and 15 Dashboard formulas extended 68 → 69; Phase 2 = 65).

**Correction to `P8-SEC-02`:** the write half of this morning's sweep was
weaker than reported — invalid bodies returned 500 and 500 counted as a
refusal. Now validation is 400, bodies are valid, and the sweep fails on
400/500; every write route is proven refused. Row stays Done, note added.

Also found: `stateCodesFor("Kigali, RW")` would have targeted "RW" as a US
state — limited to the 50 states + DC.

Verification: root build clean, lint clean, backend 1230 passed, frontend 94.

**Closed to Done (user's instruction, acceptance met):** `P2-BE-09`,
`P6-BE-05`, `P3-DATA-01`, `P8-DATA-01`, `P8-INT-07`, `P8-PMO-01`, `P4-SEC-02`,
`P6-SEC-02`, `P6-SEC-03`, `P8-SEC-01`, `P8-SEC-03`. Frontend Code review rows
left as they are (including `P4-FE-01`, `P6-FE-02`, and HeckerCreatives'
eleven). Stage Progress snapshot for today refreshed.
