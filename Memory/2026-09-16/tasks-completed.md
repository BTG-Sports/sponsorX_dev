# 2026-09-16 — tasks completed

> Two developers worked today on separate branches; both logs are kept below.
> `HeckerCreatives` on `development/Jan/frontend-page-reworks` (merged into
> `main_development`), `rcfworks` on `development/bob/roadmap_2`.

---

# HeckerCreatives — frontend

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
---

# rcfworks — tracker, decisions and diagrams

## Tracker update — eleven documents approved and closed

User: *"update the task sheet. most documents are approved, for those needing
technical approvals."* Read as: the sign-offs that are **technical** are given;
anything awaiting a signature or a commercial decision stays open.

### Closed Code review → Done (11), Date Done 2026-09-16, owner `rcfworks`

`P0-DATA-02` reward event taxonomy · `P0-DATA-03` Content Value Score v1 ·
`P0-PMO-03` email provider (Resend) · `P0-PMO-04` SMS out (G-06) ·
`P0-PMO-05` sponsor report format (G-07) · `P0-PMO-06` PDF worker dropped ·
`P0-PMO-12` baseline memory reconciliation · `P2-BE-01` dependency install ·
`P2-BE-07` contracts registry + OpenAPI · `P2-BE-09` repo layout ·
`P2-OPS-06` bare-`findMany()` lint rule.

### Held at Code review (3) — the outstanding approval is not technical

- **`P0-PMO-01`** payment policy — needs a signature from whoever runs athlete
  payouts. Everything technical in it is agreed.
- **`P0-PMO-09`** job catalogue economics — needs a **pricing** decision. The
  document reports athlete cost exceeding the sell floor on all seven jobs at
  the top of the base band with a Premium athlete, and recommends a floor rule
  of `price >= athlete cost x 1.4`.
- **`P0-PMO-10`** sponsor packages — needs a **pricing / inventory** decision.
  Packages cannot be seeded until each names its job codes.

Closing these two as technically approved would have buried a live commercial
problem in a Done row, which is why they were separated rather than swept in.

### Cascade — three tasks flipped Blocked → Ready

The board does not do this itself; each had exactly one dependency and it just
closed.

| Task | Sole dependency | Now |
|---|---|---|
| `P1-ART-04` sponsor ROI report layout for print | `P0-PMO-05` | Ready |
| `P3-INT-01` transactional email send interface | `P0-PMO-03` | Ready |
| `P8-PMO-01` OpenAPI specification (§38) | `P2-BE-07` | Ready |

### Diagram format recorded on the two ART rows

User asked whether Claude Design was needed for the art. It is not, for these
two: **`P0-ART-01` (ERD) and `P0-ART-02` (eight §21 state machines) are drawn as
Mermaid committed in `documentation/`**, because `P2-BE-02` builds the Prisma
schema and the enums directly from them — they have to diff in git and
regenerate when the schema moves. SVG/PNG exported from the Mermaid satisfies
the "readable at print size" criterion. Claude Design stays for the visual ART
tasks (`P1-ART-05/06/07`, `P4-ART-01`, `P5-ART-01`). Both rows carry this in
Notes so nobody re-opens the question.

### Board after

**31 Done · 20 Ready · 1 In progress · 3 Code review · 290 Blocked** = 345.

### Verified

All **77 formulas byte-identical** before and after — only existing cells were
written, **no rows inserted**, so the Dashboard's hardcoded ranges, the three
conditional-formatting ranges per sheet, the autofilter (`A4:R190` etc.) and the
Status data-validation lists are untouched. Workbook backed up to the session
scratchpad before editing; `openpyxl` installed in a throwaway venv there, not
globally and not into the project.

### Still to do

End-of-day mirror of the Google Sheet by hand, as the daily rule requires —
eleven rows to Done, three rows Blocked → Ready.

---

## `P0-ART-01` and `P0-ART-02` — the two §38 diagram deliverables

Both built and moved to **Code review**, owner `rcfworks`, Date Started
2026-09-16. Board: **31 Done · 18 Ready · 1 In progress · 5 Code review ·
290 Blocked** = 345. 77 formulas verified identical.

### Format, and why

User asked whether Claude Design was needed. It is not, for these two: they are
technical drawings that `P2-BE-02` builds the Prisma schema and enums from, so
they must diff in git and regenerate when the schema moves. **Mermaid source
committed in `documentation/diagrams/`, PDF rendered from it for distribution.**
The user asked for PDF explicitly. Claude Design stays for the visual ART tasks.

- **ERD** — one A0 landscape sheet, 29 models with relationships, PK/FK/UK and
  state columns. A0 because the diagram's aspect is 1.37 and at A1 the attribute
  text lands near 6.5pt; at A0 it is ~9.7pt and scales down cleanly to A1/A2.
- **State machines** — 9 pages A3 portrait, cover plus one machine per page,
  each page carrying the §21 line it was drawn from.

### Two findings worth carrying into `P2-BE-02`

**Five §20 tables are not modelled in Implementation Guide V2 at all:**
`sponsor_contacts`, `athlete_content_capabilities`, `athlete_brand_preferences`,
`integration_connections` — and `roles` / `user_roles` are collapsed into a
`Role[]` array on `User`, which contradicts both §20 and `CLAUDE.md`'s
"`tenants`, `roles` and `user_roles` in Postgres authorize", and cannot carry a
grant's scope, grantor or date. The sharp one is `athlete_brand_preferences`:
**§26's conflict check needs the athlete's restricted categories and only the
sponsor's side exists today**, so the check cannot currently be implemented.
`payouts` is deliberately absent per G-01 and is not a gap. Full table-by-table
audit in `documentation/diagrams/README.md`.

**§21 states forward paths only.** Nine arrows across six machines had to be
drawn to avoid dead-end states — a review that requests changes, a payment hold
that is resolved, a pause that is lifted. Each is labelled `(derived)` on the
diagram and called out on the cover page, as proposals for `P2-BE-02` to
confirm rather than established requirements. Campaign Brief and Athlete
Invitation needed none.

### Toolchain notes (cost time once; should not again)

- **Mermaid drops the newline after a bare `%%` line**, which glues the comment
  block onto the diagram declaration and fails the parse. Every comment line in
  these sources carries text, and the diagram declaration is line 1.
- **Chrome's `--print-to-pdf` does not recognise `@page { size: A0 }`** — it
  silently falls back to US Letter. Give explicit millimetres
  (`size: 1189mm 841mm`). A3/A4 names do work.
- A `.page` block taller than the printable area silently doubles the page
  count, footers landing on their own pages. Caught by counting pages, not by
  looking at the first one.
- Mermaid's default layout put the ERD at 7470×3382 (aspect 2.2, unprintable);
  `layout: elk` gives 4900×3588, aspect 1.37, which is what makes an A0 sheet
  work.
- `@mermaid-js/mermaid-cli` was installed in the session scratchpad with
  `PUPPETEER_SKIP_DOWNLOAD=1` and pointed at the installed Chrome — **nothing
  was added to the project**, which keeps the zero-new-dependencies-until-B0
  rule intact. The regeneration recipe is in `documentation/diagrams/README.md`.

---

## `P0-ART-03` — paginated process flowchart (new task, raised today)

User's reaction to the ERD: *"the phase 1 erd is quite large. can you make a set,
a flowchart with start and end. likewise divide the flowchart into pages so it
will be easy to navigate."* Asked whether each page should carry the flowchart
plus its tables, a pure process flowchart, or the ERD split by domain; they chose
**pure process flowchart**. The A0 ERD stays exactly as it is.

**Raised as a new task rather than folded into `P0-ART-01`**, whose acceptance is
the ERD and was already met. `P0-ART-03` was the next free ID; Order `20.5` puts
it directly after `P0-ART-02` without renumbering anyone else's rows.

### What it is

`documentation/diagrams/SponsorX-Phase1-Process-Flow.pdf` — 11 pages A3
portrait. Cover carries a whole-loop map with the page number for each stage,
an actor colour key and an index; then one §39 stage per page, START on page 2
and END on page 11, with black off-page connectors — *from page N* at the top,
*continues on page N* at the bottom — so the loop can be followed in either
direction.

Colour by actor: athlete/guardian, BTG staff, sponsor, fan, system/worker.
Record state changes are dashed boxes, so a reader can see exactly which enum
moves at each step and cross-reference the state-machine PDF.

**Every step is traceable**: §11 onboarding capture, §12 agreements, §13's
twelve-step managed campaign workflow, §16 the QR funnel, §21 the state
machines, §26 conflict checks. The blueprint v2.0 `.docx` in
`documentation/Master/` was read directly for each. Nothing invented.

Each page carries a one-line note in the margin holding the thing that is easy
to get wrong there — the sell-floor collision on stage 3, the missing restricted
categories on stage 5, the void-draft-acceptance consequence on stage 6, "only
REDEEM is a business outcome" on stage 8, "PAID is a bookkeeping mark" on
stage 9.

### The layout lesson

First render was unreadable: commentary written as graph *nodes* made the pages
1:3.3 tall and forced the diagram down to ~6.5pt on A3. **Moving commentary out
of the graph and into the page margin** cut the tallest page from 2536px to
2144px and brought every page to 8–11pt. Prose belongs in the page, not in the
flowchart.

### Tracker

New row at **Phase 1 row 185** — deliberately *appended into free rows inside
the existing ranges* (`I5:I190`, autofilter `A4:R190`) rather than inserted, so
**not one formula, validation or conditional-formatting range needed touching**.
77 formulas verified identical. The two subtitle cells that state totals were
corrected by hand — Dashboard `A2` 336→337 delivery and 345→346 total, Phase 1
`A2` 186→187 tasks and 446→447 person-days — because those are text, not
formulas, and nothing updates them automatically.

**Board: 31 Done · 18 Ready · 1 In progress · 6 Code review · 290 Blocked = 346.**

---

## `P1-ART-05` — fan reward landing design, reviewed and accepted

Designed in Claude Design from a brief written for it, extracted to
`documentation/Design/fan-reward-landing/SponsorX Reward Landing.dc.html`
(source zip kept in `documentation/Design/other landing pages/`). Seven
artboards at 390px: offer, claim/consent, claimed, returning fan, already
redeemed, expired, unavailable.

**Acceptance met** — consent language placed, offer presentation designed,
single-use and expired states designed.

### What was actually verified, not eyeballed

**Contrast.** Every `color:` declaration was extracted and its ratio computed
against its *real* background, not against the page ground. All pass WCAG AA.
Lowest on-ground value is white at 50% = **5.36:1**; the inverted code card is
18.4:1; the primary button 6.8:1. Four colours fail against the dark ground and
that is correct — they are dark ink on the light card. **Checking against the
page ground alone would have produced four false failures**, which is the trap
in auditing a design that deliberately inverts one surface.

**No-JS.** The three `<script>` tags in the `.dc.html` are Claude Design canvas
infrastructure (`support.js`, the `_ds` bundle, a `text/x-dc` logic block), not
page code. The design uses one email field and a native `required` checkbox, so
validation works with JS off.

**Content rules.** No invented statistics, no countdown, no account or app
prompt, nothing collected beyond an email.

### The finding worth keeping

**The consent copy makes three promises that no task in the 348 delivers.**
Searched every Task, DETAILS and Acceptance field: zero hits for unsubscribe,
opt-out or lead export.

1. *"You can unsubscribe from any of it, at any time, in one tap"* — no
   unsubscribe mechanism exists anywhere in the programme.
2. *"Northbridge Coffee receives your email address"* — nothing hands claimed
   emails to the sponsor. `P6-SEC-02` is fan PII *purpose limitation*, which
   points the other way.
3. *"We emailed this code to you as well"* — a transactional send at CLAIM,
   depending on `P3-INT-01` (Ready, unbuilt) and named in no reward task.

This is the design doing its job: deciding what a screen says forced three
backend commitments into the open before `P6-FE-02` wires the page. Either the
backend gains them or the consent copy narrows before launch. **A consent
promise that is not true is the worst possible version of this page**, so it
cannot be left to be discovered during the pilot.

Not raised as tasks — flagged to the user for the call.

**Board: 33 Done · 17 Ready · 1 In progress · 7 Code review · 290 Blocked = 348.**

---

## Tracker sweep — two gaps raised, one finding retracted

User asked for the trackers to be updated. Audited the whole board first rather
than assuming: **no Blocked task had all dependencies Done, and no Ready / In
progress / Code review task had an unmet dependency.** All 20 of the day's rows
were already applied. The xlsx needed no correction.

### A finding of mine was wrong, and the check is the lesson

I reported that the `P1-ART-05` consent copy promised the sponsor would receive
the fan's email with no task delivering it. **`P6-INT-01` — "Consent-gated lead
push to Zoho" — already covers exactly that**, with `P6-SEC-02` limiting the
fields to what consent permits. My keyword search had looked for *export*,
*lead export* and *claimed emails*; the task says *lead push*. **A keyword
search across a 350-row board is evidence of absence only when the vocabulary
is right** — the confirming step is to read the neighbouring rows in the same
stage, which is what surfaced it.

### The two gaps that are real

| New task | Why |
|---|---|
| `P6-INT-02` · Email the reward code to the fan at CLAIM | The three notification-job tasks cover applications (`P3-INT-02`), invitations (`P4-INT-01`) and deliverables (`P5-INT-01`). **None covers the fan.** The design's claimed screen says the code was emailed; without this the on-screen code is the fan's only copy, and losing signal in a venue loses the reward. |
| `P6-SEC-03` · Fan unsubscribe and consent withdrawal | The consent copy promises unsubscribe "at any time, in one tap" and nothing delivered it. `P6-SEC-01` records that consent was **given**; nothing records it being **taken back**. A consent record with no withdrawal path is not a consent mechanism. |

Both Blocked, weight 1d, no legal dependency (standing rule). Written into free
rows 188–189 inside the existing ranges, Orders `131.5` and `134.5`, so **no
formula, validation or conditional-formatting range was touched** — 77 formulas
verified identical. Subtitles corrected to 341 delivery / 350 total / 191
Phase 1 tasks / 451 person-days.

**Only one free row now remains inside `I5:I190` on the Phase 1 sheet.** The
next person to raise a Phase 1 task must extend the Dashboard ranges, the
autofilter and the Status validation by hand, or the Dashboard silently
undercounts. Worth doing deliberately rather than discovering it.

**Board: 33 Done · 17 Ready · 1 In progress · 7 Code review · 292 Blocked = 350.**
