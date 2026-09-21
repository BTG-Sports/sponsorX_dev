# 2026-09-16 — tasks completed

## Task — Complete `/athlete/invitations` frontend functionality (sort, filter, search, pagination)

**Trigger:** user asked to complete the frontend functionality on the athlete
invitations page: sorting, filter, search and pagination.

### The problem
The page ([page.tsx](../../src/app/(app)/athlete/invitations/page.tsx)) was a
pure server component from the 2026-09-14 redesign: search was a GET form
(full navigation per keystroke-less submit), the state tabs were `<Link>`s
(full navigation per click), there was **no sort control, no job filter and no
pagination** — the whole filtered set rendered at once.

### What was built
The interactive surface moved into **one client island** —
[invitations-inbox.tsx](../../src/components/invitations-inbox.tsx) — following
the marketplace-catalog / sponsor-campaigns-list idiom exactly:

- **Instant search** (`SearchInput`, athlete tone) across sponsor, campaign,
  job name and job ID — no Apply button, per the standing app-like-UX rule.
- **State tabs** (All / Needs response / Accepted / Declined / Expired) as
  client buttons with live counts; counts reflect the current search + job
  filter so they answer "of what I'm looking at, how many per state".
- **Job filter** dropdown — distinct `SX-nn · Job name` rows derived from the
  fixture.
- **Sort menu** — default is the original urgency-first order (open invites
  first, soonest expiry on top); options for expiry-soonest, offer high→low /
  low→high, sponsor A–Z. The expiry sort keeps open invites ahead of resolved
  ones so an EXPIRED fixture string ("expired 3 days ago") can't sort into the
  actionable set.
- **Dismissible chips** for active search/job filters + "Clear all".
- **Pagination** — shared [pagination.tsx](../../src/components/pagination.tsx)
  numbered pager (`alwaysShow`) + 12/24/60 page-size dropdown, the whole page
  bar (with "Showing X–Y of Z matching", `aria-live`) duplicated above and
  below the grid; bottom size-dropdown opens upward. Any search/filter/sort
  change resets to page 1.
- **URL-synced** via `history.replaceState`: `?state=`, `?q=`, `?job=`,
  `?sort=`, `?page=`, `?size=`, preserving `?demo=` — shareable and
  reload-safe. The server page seeds the island from `searchParams`, so a
  pasted URL renders pre-filtered.

### What stayed server-side
Heading, demo states (empty/loading/error/minor), the guardian notice, the
whole-inbox **stat strip** (deliberately unfiltered — "what's waiting for me")
and the §08 blocked-acceptance footer. The two helpers both sides need
(`urgencyHours`, `isOpen`) moved to a new shared module
[invitations-ui.ts](../../src/lib/invitations-ui.ts), since a `"use client"`
file can't export plain functions to a server component.

### Card markup
Unchanged — the invitation card (identity band, decision numbers, job row,
usage/exclusivity, decline reason, blocked accept + decline + full-terms
actions) moved verbatim from the page into the island.

### Verification
`npx tsc --noEmit` clean, `npx eslint` clean on the three touched files,
`npx next build` passes (`/athlete/invitations` dynamic, ƒ).

### Files
- `src/components/invitations-inbox.tsx` — new client island
- `src/lib/invitations-ui.ts` — new shared helpers (urgencyHours, isOpen)
- `src/app/(app)/athlete/invitations/page.tsx` — reduced to the server frame

## Task — `P1-FE-09` · Sponsor dashboard "Export report" — client-side PDF + XLSX

**Trigger:** user asked for a working export function behind the `/sponsor`
Export report button, producing the report a client would actually read, in
both PDF and Excel.

### Design
One serializable **`SponsorReport` model**
([report-data.ts](../../src/lib/report-data.ts)) built by the server page from
the same fixtures the screen draws — when real data lands, only the builder
changes; the two renderers and the island keep their contracts. Money stays in
cents in the model; each renderer converts at the last moment. Every KPI
carries its **§22 provenance label** (VERIFIED · MetricDaily, Zoho Books,
ATTRIBUTED, ESTIMATED) and both formats print it — the projection rows are
italicised and marked EST in both outputs.

### Report contents (both formats)
Executive summary (6 provenance-labelled KPIs), insights, reward funnel with
step conversions, campaign portfolio with totals row, top athletes with
share-of-delivered-views, 31-day cumulative daily series + 4 ESTIMATED
projection points, data-trust provenance mix, methodology notes, confidential
footer.

### Implementation
- [export-report.tsx](../../src/components/export-report.tsx) — client island
  replacing the inert button: dropdown (PDF / Excel), busy spinner, error row,
  outside-click/Escape close, `aria-haspopup`/`role="menu"`. Both renderers are
  **dynamic-imported on click** so jspdf/exceljs never enter the dashboard
  bundle.
- [report-pdf.ts](../../src/lib/report-pdf.ts) — jspdf + jspdf-autotable, A4,
  brand header band, light-theme print palette (dark-theme neons fail on white
  paper), page footers with page X of Y.
- [report-xlsx.ts](../../src/lib/report-xlsx.ts) — exceljs, 5 sheets (Summary,
  Daily performance, Campaign portfolio, Reward funnel, Top athletes), real
  numbers with Excel number formats (money `"$"#,##0`, shares `0.0%`) so the
  client can pivot/re-total, styled headers, frozen panes, totals row.
- New deps: `jspdf`, `jspdf-autotable`, `exceljs` (package.json).
- The eventual §19 render-report worker replaces only the generation step
  (queued job + signed R2 download); the model is its contract. Pending
  decision gate **G-07** (`P0-PMO-05`) on whether PDF is a hard requirement.

### Verification
`next build` passes (Turbopack); eslint clean; a Node harness ran the real
pipeline: valid 2-page PDF (`%PDF`), valid XLSX that round-trips through
exceljs with totals matching the screen ($30,250 spend = sponsorBudget.spent;
823,400 views = hero total; 47 athletes). Browser click-through still worth a
manual glance.

### Task board
Added **`P1-FE-09`** (Order 33.9, Stage 1, FE, Code review, started
2026-09-16) to the Phase 1 sheet; extended autofilter, status validation,
3 conditional-formatting ranges and 15 Dashboard/where-the-work-happens
formulas from row 192 → 193. Note: first insert collided with the
already-taken `P1-FE-08` / Order 33.8 (athlete invitations inbox) — renumbered
mine and kept theirs in place. Google Sheet mirror remains the human's
end-of-day step.

## Task — `P1-FE-10` · Campaign ROI report "Export report" — client-side PDF + XLSX

**Trigger:** user asked for the same PDF + Excel export on
`/sponsor/campaigns/[id]/report` (screen 12), replacing its inert
"Download PDF" button.

### Design
Second consumer of the export pattern, so the shared plumbing moved into kit
modules first:
- [report-pdf-kit.ts](../../src/lib/report-pdf-kit.ts) — print palette, page
  geometry, `table`/`heading`/`paragraphs`/`note`, brand `headerBand`,
  `footers`.
- [report-xlsx-kit.ts](../../src/lib/report-xlsx-kit.ts) — brand colors,
  number formats, `styleHeader`/`sectionTitle`/`titleBlock`.
- `report-pdf.ts` / `report-xlsx.ts` refactored onto the kits;
  `report-data.ts` grew `meta.fileStem` and a shared `buildReportFunnel()`
  (both reports print §16's four-stage funnel with the same derived rates).

New model [campaign-report-data.ts](../../src/lib/campaign-report-data.ts)
(`CampaignRoiReport`, built by the server page, later by P7-BE-05's real
assembly): return block (2.73×, invested ZOHO BOOKS, attributed
merchant-validated coupons §16, media value ESTIMATED — never merged into the
return figure), 8-point return timeline with break-even, composition
(format / platform with computed shares / geo markets), funnel, efficiency vs
BTG-curated benchmarks (ESTIMATED), delivery, top content, recommendation
(+22% lift, ESTIMATED), methodology.

Renderers: [campaign-report-pdf.ts](../../src/lib/campaign-report-pdf.ts)
(3-page A4, zone order mirrors the screen) and
[campaign-report-xlsx.ts](../../src/lib/campaign-report-xlsx.ts) (5 sheets:
Summary, Return timeline, Composition, Reward funnel, Top content; return
multiple numeric with a `0.00"×"` format so it can be charted).

### Island generalized
[export-report.tsx](../../src/components/export-report.tsx) now takes a
discriminated `ExportPayload` (`sponsor-dashboard` | `campaign-roi`), picks
the renderer pair by kind, names the file from `meta.fileStem`, and still
dynamic-imports everything on click. Both pages pass the payload; the ROI
page's stale "renders on the worker via Playwright" header comment updated.

### Verification
`next build` passes; eslint clean on all 11 touched files; Node harness for
the campaign pipeline: valid 3-page PDF, 5-sheet XLSX round-trips, platform
shares sum to 1.0, and the Summary sheet's numbers reconcile ($52,500 ÷
$19,200 = 2.73×). Redundant break-even wording found in the workbook output
and fixed in the builder.

### Task board
Added **`P1-FE-10`** (Order 33.95, Stage 1, FE, Code review, started
2026-09-16) after P1-FE-09; ranges and 15 formulas extended 193 → 194; no
duplicate IDs. Google Sheet mirror remains the human's end-of-day step.

## Task — `P1-FE-11` · Athlete earnings statement "Export report" — client-side PDF + XLSX

**Trigger:** user asked for an export button on `/athlete/earnings` (the page
had none), same approach as the sponsor exports.

### Design
Third consumer of the export pattern —
[earnings-report-data.ts](../../src/lib/earnings-report-data.ts)
(`AthleteEarningsReport`). Owner-framed per the portal rule: this is the
athlete's own **statement**, not a sponsor artefact. The page's two scopes are
printed with the data, not left to memory: canonical career figures
(`athleteCareer`, Postgres — $46,250 career, $8,400 on the way, $4,700/month
avg, 96% on-time) are explicitly separated from the in-cycle §21 journey
buckets (In review $190 / Cleared $150 / Payout approved $320 / Paid $785)
and the HELD strip ($120 + plain-English hold reason). Activity rows filter
to the signed-in athlete only (4 rows, $630 total) and carry EARNING_COPY
status + STATUS_DETAIL "what it means" text. Phase-1 constraints printed in
the notes: status only, no money moves through SponsorX, no bank/tax fields
anywhere (§24, §26, Addendum A6).

Renderers:
[earnings-report-pdf.ts](../../src/lib/earnings-report-pdf.ts) (2-page A4
mirroring the screen's four questions: at a glance → where your money is →
monthly trend → activity, plus per-status meanings and Good-to-know) and
[earnings-report-xlsx.ts](../../src/lib/earnings-report-xlsx.ts) (3 sheets:
Summary, Monthly earnings, Activity; money as real dollars with currency
formats, HELD row in warn color).

### Island
`ExportPayload` grew an `athlete-earnings` kind (the two-branch if became a
switch); page header wrapped in the flex row with the island on the right.
Empty demo state keeps no button — nothing to export.

### Verification
`next build` passes; eslint clean; Node harness: valid 2-page PDF, 3-sheet
XLSX round-trips, activity filtered to the athlete's 4 rows totalling $630,
trend average $4,700 matches the screen. Caught and fixed a fill-color typo
(`751 % 256`) in the PDF renderer before running.

### Task board
Added **`P1-FE-11`** (Order 33.97, Stage 1, FE, Code review, started
2026-09-16) after P1-FE-10; ranges and 15 formulas extended 194 → 195; no
duplicate IDs. Google Sheet mirror remains the human's end-of-day step.

## Task — `P1-FE-12` · `/admin/approvals` redesign — Approvals desk (cards, drawer, pipeline hero)

**Trigger:** user asked for a redesign of the admin content-approvals page
with "wow factor" but an easy learning curve, then confirmed: search,
pagination, filter, sorting, and the item list as **cards**.

### The problem
The page ([page.tsx](../../src/app/(app)/admin/approvals/page.tsx)) was the
pre-desk pattern: a flat stack of always-expanded cards with dead buttons,
spec jargon (§21, R2, signed URLs) in user-facing copy, no search/filter/sort/
pagination, and only 2 queue rows — nothing taught the reviewer how the
pipeline works.

### What was built
The applications-desk idiom (2026-09-14), applied to content review:

- **Hero band** — gradient count of deliverables awaiting a decision, aging
  pulse line (>24h, `AGING_HOURS`), median turnaround / approval rate, and a
  **"How content clears" pipeline strip**: the §21 state machine taught as
  four desks (Athlete submits → BTG review → Sponsor review → Cleared) with a
  live count per desk. The drawer's stage tracker repeats the same four
  labels, so the mental model is taught once and reinforced.
- **[approvals-desk.tsx](../../src/components/approvals-desk.tsx)** — the
  page's one client island: tabs (Needs review / Cleared / All) with live
  counts; instant search across title/athlete/campaign/sponsor; campaign +
  format dropdowns; sort (waiting longest default — matches the hero's "puts
  them first" claim — plus due-soonest, newest); dismissible filter chips;
  **card grid** (sm:2 / xl:3 cols) with an asset banner (kind glyph, state
  badge, aging badge), title, athlete · campaign, sponsor + due footer;
  shared **pagination** (12/24/60, bars above and below, bottom dropdown
  opens up); URL-synced `?tab=&q=&camp=&kind=&sort=&page=&size=` with
  `?demo=` preserved, seeded back by the server page.
- **Review drawer** (portaled to body, same close/focus/scroll-lock
  mechanics): signed-asset preview placeholder ("private bucket, short-lived
  signed links" in plain English), stage tracker, per-state "what happens
  next" copy, details grid, and a decision bar that **walks the real state
  machine locally with Undo**: Start BTG review → Send to sponsor → Approve &
  publish (the card visibly moves to the Cleared tab), plus Request revision
  (local `REVISION` state, "sent back to the athlete"). "This visit only",
  per the ApplicationsDesk precedent.
- **[approvals-ui.ts](../../src/lib/approvals-ui.ts)** — shared server/client
  helpers: `EffectiveState` (= DeliverableState | "REVISION"), STATE_TONE,
  ADVANCE map, STATE_DETAIL plain-English copy, PIPELINE_STEPS, deskIndex,
  inQueue, dueValue ("May 15" sort key), waitLabel.
- **Fixtures** — `contentReviewQueue` re-typed (`ReviewContentItem`) and
  extended with 4 admin-only rows (Amara Diallo, Jordan Okafor, Maya Chen,
  Leo Barros — mixed states/formats/waits, one aging at 50h) so the desk
  reads as a network queue, not one athlete; Shammah's rows still derive from
  `deliverables` (athlete portal untouched); new `contentCleared` (derived
  cleared rows + 2 extras with `clearedAt`). Admin dashboard's "awaiting
  content" count rises 2 → 6 consistently.

### Verification
`npx tsc --noEmit` clean; eslint clean on all four touched files; page
fetched from the running dev server — hero, pipeline strip, tabs, card grid,
pager and aging badge all present in the SSR HTML (text-node `<!-- -->`
separators accounted for).

### Files
- `src/app/(app)/admin/approvals/page.tsx` — rewritten server frame
- `src/components/approvals-desk.tsx` — new client island
- `src/lib/approvals-ui.ts` — new shared helpers
- `src/lib/fixtures.ts` — queue extension + `contentCleared`

### Task board
Added **`P1-FE-12`** (Order 33.98, Stage 1, FE, Code review, started
2026-09-16) after P1-FE-11 at row 51; autofilter, status validation, 3
conditional-formatting ranges and 15 Dashboard formulas extended 195 → 196;
no duplicate IDs. Google Sheet mirror remains the human's end-of-day step.

## Task — `P1-FE-13` · `/admin/rewards` desk + Reward Creator as a modal wizard

**Trigger:** three user messages, one flow — redesign `/admin/rewards/new`
with wow factor and an easy learning curve; the rewards page should show the
**list first** (search, filter, sorting, item list); creation should be a
**popup**, not a page.

### The problem
There was no rewards list at all — the admin nav jumped straight into
`/admin/rewards/new`, a static one-shot form (decorative stepper, native
selects, frozen preview, dead buttons). No way to see what rewards exist,
their state, or whether fans are redeeming them.

### What was built
- **[rewards-desk.tsx](../../src/components/rewards-desk.tsx)** — new
  `/admin/rewards` client island, applications-desk idiom: funnel strip
  (Active / QR scans / Claims / Redeemed **summed from the rows' RewardEvent
  counts**, so it reconciles with `rewardFunnel` 8,200/4,300/1,870 by
  construction, §22); instant search (offer/sponsor); status + redemption-type
  dropdowns; sort (newest, redemptions, scans, redemption rate, offer A–Z);
  dismissible chips; card grid with hash-seeded deterministic **QR
  thumbnails** (greyed unless ACTIVE) and per-card scans → claims → redeemed
  + redemption-rate meter (zero-traffic rows show the plain-English
  `REWARD_COPY` state line instead); shared pagination (12/24/60, bars above
  and below); URL-synced `?q=&status=&type=&sort=&page=&size=` with `?demo=`
  preserved, seeded by the server page.
- **[reward-creator.tsx](../../src/components/reward-creator.tsx)** — the
  creator rebuilt as a three-step wizard (`rewardSteps`) with
  campaign-builder mechanics (clickable stepper, per-step `sx-animate`,
  plain-English gates). Step 1: sponsor/offer chips + redemption types as
  **explained cards** — sweepstakes visibly blocked "Needs legal" (§16).
  Step 2: fan-card design + theme swatches. Step 3: per-athlete distribution;
  each picked athlete shows their opaque token (one reward, many tokens,
  §16; conflicts blocked, not hidden, §26). **The wow that teaches:** a
  sticky phone-framed live preview of the exact fan card, re-rendering per
  keystroke, whose FNV-1a-hash-seeded QR visibly re-patterns as the design
  changes (deterministic → no hydration drift; real QR/tokens are R2's job on
  save).
- **Create is a modal** — the campaign-launcher plumbing (portal, Escape,
  scroll lock, focus return, backdrop fade) inside the desk; a created reward
  prepends locally as SCHEDULED with sx-pop highlight + Undo toast.
- **Routes** — new `/admin/rewards` server page seeds the island;
  `/admin/rewards/new` is now a `redirect("/admin/rewards?new=1")`
  (force-dynamic; ?new=1 opens the modal on load, then is never written back
  so the URL self-cleans). Admin nav repointed to `/admin/rewards`;
  campaign-builder's "Design the full reward" link goes to the canonical URL.
- **Fixtures** — `rewards` (14 rows), `RewardState`, `REWARD_COPY`,
  `REWARD_TYPES` in fixtures.ts. Only rows with fan traffic carry event
  counts, which is why the funnel sums close exactly.

### Verification
`tsc --noEmit` clean; eslint clean; `next build` passes (both routes ƒ).
Against `next start`: funnel numbers, 12 QR cards and both pager bars in the
SSR HTML; `?status=ACTIVE&q=grill` seeds to the right 2 cards; `?demo=empty`
renders the empty state; the legacy URL redirects (meta refresh on cold
document loads — this Next version's streaming behavior — instant client-side
in-app). Modal interaction itself is worth a manual click-through.

### Files
- `src/app/(app)/admin/rewards/page.tsx` — new server frame
- `src/app/(app)/admin/rewards/new/page.tsx` — reduced to a redirect
- `src/components/rewards-desk.tsx` — new client island (list + modal)
- `src/components/reward-creator.tsx` — new wizard island
- `src/app/(app)/admin/layout.tsx` — nav href
- `src/components/campaign-builder.tsx` — reward link href
- `src/lib/fixtures.ts` — rewards fixtures
- `docs/superpowers/specs/2026-09-16-admin-rewards-desk-design.md` — spec

### Task board
Added **`P1-FE-13`** (Order 33.99, Stage 1, FE, Code review, started
2026-09-16) after P1-FE-12; ranges and Dashboard formulas extended 196 → 197.
Google Sheet mirror remains the human's end-of-day step.
