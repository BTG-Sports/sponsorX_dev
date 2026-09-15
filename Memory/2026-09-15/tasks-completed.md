# 2026-09-15 — tasks completed

## Task — Redesign `/admin/campaigns/new` (Create Campaign) UX

**Trigger:** user asked to redesign the Create Campaign page for a "wow factor"
with a good, easy-to-learn UX. Design was presented and approved (guided wizard
+ live projection rail) before any code, per the standing rule.

### The problem
The old [page.tsx](../../src/app/(app)/admin/campaigns/new/page.tsx) was a static
server component: the "fields" were read-only display boxes, the stepper was
decorative (hardcoded to step 1), the athlete checkboxes changed nothing, and
the summary never moved. It looked like a form but did nothing.

### What was built
Rebuilt as **one client island** —
[campaign-builder.tsx](../../src/components/campaign-builder.tsx) — matching the
established applications-desk idiom (URL-synced state, animated score rings,
local demo actions, `filter-kit` toolbar, `sx-animate` motion):

- **Five focused steps** (`builderSteps` fixture updated): Inventory → Details →
  Athletes → Rewards → Review & Launch. The stepper is real and clickable, with
  completed ✓ states and a filled progress line. Step 3 gates Next until ≥1
  athlete is picked (teaches the managed-loop core).
- **Step 1 · Inventory** — selectable package cards from the `mediaInv` fixture;
  choosing one sets the CPM and seeds the budget.
- **Step 2 · Details** — real inputs + a **budget slider** driving live reach
  (budget$ ÷ CPM × 1000); platform toggles.
- **Step 3 · Athletes** — selectable cards with sweep-in **ScoreRing** (§14
  Content Value Score), instant search + sport/tier filters, dismissible chips.
  A category-conflicting athlete is shown **Blocked** (§26), not hidden.
- **Step 4 · Rewards** — optional; toggle + coupon preview, links to Reward
  Creator.
- **Step 5 · Review & Launch** — receipt summary + roster + `sx-pop` launch
  confirmation, honestly noting invitations stay held until counsel clears the
  Campaign Order template (§08).
- **Live projection rail** (sticky): reach tweens on every change via a
  ref-based `AnimatedNumber` (same set-state-in-effect workaround count-up.tsx
  uses); reach/budget/roster/platforms, all `est`-labelled per the
  stats-provenance rule.

### Refactor
Extracted `ScoreRing` out of applications-desk into shared
[score-ring.tsx](../../src/components/score-ring.tsx); applications-desk now
imports it. No duplication.

### Follow-up — builder now opens in a modal (user request)
User asked for a **"Create New Campaign" button → popup modal** rather than the
builder filling the page. Reconciled the modal-cramping concern by making it a
**spacious modal** (max-w-6xl · 92vh · internal scroll), so the two-column
wizard + rail keep their full-page layout.

- `/admin/campaigns/new` is now a **launch screen**: hero + a "how it works"
  five-step preview + the Create New Campaign button (also aids the
  learning-curve goal). No `/admin/campaigns` list page exists — the builder is
  launched globally from the sidebar, the dashboard and a campaign's detail
  page, so this screen is its home.
- New [campaign-launcher.tsx](../../src/components/campaign-launcher.tsx): the
  button + the modal. Modal plumbing mirrors the applications-desk review
  drawer — portaled to `<body>`, Escape/backdrop close, scroll-lock, focus
  moves to the close button and returns to the trigger, animated
  backdrop/`sx-pop` panel with a closing fade + fallback timer.
- CampaignBuilder gained two props: `syncUrl` (off in the modal, so closing
  leaves no stale `?step`) and `onCancel` (Cancel closes the modal instead of
  linking to /admin). Each open mounts a fresh builder = clean slate.

### Follow-up 2 — route removed, list page added, popup relocated (user request)
User: remove the New-campaign page **and** its nav item, make creating a
campaign a **popup inside the campaigns page**, and the campaigns page must
**list campaigns first**, then open the actual campaign.

Findings that shaped it: there was no `/admin/campaigns` list — the "Campaigns"
nav item pointed straight at `/admin/campaigns/c1` (the ops dashboard), and the
detail page's "Edit campaign" button linked to `/admin/campaigns/new`.

Done:
- **Deleted** the `/admin/campaigns/new` route entirely (the launch screen too).
- **New list page** [/admin/campaigns](../../src/app/(app)/admin/campaigns/page.tsx):
  campaign cards built from `campaignDetailX` (c1 Player of the Week, c3
  Community Campaign — flagged "Needs attention" from its `notice`), each a
  progress meter + pacing/engagement/reward stats, linking to
  `/admin/campaigns/[id]`. The **Create New Campaign popup** lives in its header.
- **Nav** (admin/layout.tsx): dropped "New campaign"; "Campaigns" now →
  `/admin/campaigns`.
- **CampaignLauncher** gained `label` / `variant` (primary|secondary) /
  `className` so the same popup serves the list header ("New campaign",
  primary) and the detail header ("Edit campaign", secondary — repointed from
  the dead `/new` link).
- **Repointed every dead `/admin/campaigns/new` reference** so nothing 404s:
  dashboard "Briefs to match" queue, `lib/back.ts` `builder` target
  (→ /admin/campaigns, "Back to Campaigns"), the /map sitemap, and
  build-preview. Only a code comment mentions the old path now.

### Verification
`tsc --noEmit` clean · `eslint` clean · `next build` succeeds — route table
shows `/admin/campaigns` (static) + `/admin/campaigns/[id]` (dynamic), and
`/admin/campaigns/new` is gone. Dev SSR: `/admin/campaigns` returns 200 with
both campaign cards, the New-campaign button, the Needs-attention flag and the
progress meters. Client interactions (list → detail, popup open/close, the
5-step builder) are demo-only, local-to-visit — nothing persisted.

## Task — Complete the sponsor campaigns path (List → Detail → Report)

**Trigger:** user asked to complete `/sponsor/campaigns/c1/report`, sensing
"there's a list or some content before reaching /c1/report." There was: the
report existed but nothing led to it — the sponsor **Campaigns** nav item
pointed straight at `/sponsor/campaigns/c1/report`, skipping any list/dashboard.
Design brainstormed and approved (List → Detail → Report), spec at
[docs/superpowers/specs/2026-09-15-sponsor-campaigns-path-design.md](../../docs/superpowers/specs/2026-09-15-sponsor-campaigns-path-design.md).

### Data reconciliation (the decision that shaped it)
Two campaign fixture families: `sponsorCampaigns` (c1–c5, the sponsor's
portfolio, already drives the dashboard's "5 campaigns") vs `campaignDetailX`
(rich series/roster/topContent/notice, only c1 + c3). The list **must** show all
5 or it contradicts the dashboard and reads as a bug. So the detail page is
**tiered**: c1/c3 render the full dashboard; c2/c4/c5 render an honest lighter
detail from portfolio-summary data. No campaign is faked with data it lacks.

### What was built
- **New list** [/sponsor/campaigns](../../src/app/(app)/sponsor/campaigns/page.tsx):
  one card per `sponsorCampaigns` entry — monogram, state badge (or "Pacing
  behind" when `sponsorCampaignsX.pacing === "BEHIND"`), deliverables meter,
  views·spend·athletes stats — linking to `/sponsor/campaigns/[id]`.
  Owner-framed; **no** "New campaign" launcher (Phase 1 managed — BTG staff
  create campaigns, not sponsors). Standard `demoState` empty/loading/error.
- **New detail** [/sponsor/campaigns/[id]](../../src/app/(app)/sponsor/campaigns/[id]/page.tsx):
  header (monogram, state badge, "Presented by … · pkg · endsIn") + a **View ROI
  report →** CTA (`?from=sponsor-campaign`), swapped for a muted "available once
  delivery begins" when `state === "STAFFING"`. Rich tier (c1/c3): pacing hero
  (`RadialGauge` + `campaign-ui` `paceFor`/`paceProjection`), a sponsor-reworded
  attention banner (data-driven from roster flags — **no** operator verbs, per
  the portal rule), stat tiles with provenance chips, performance `AreaChart`,
  **read-only** athlete roster (no `RosterOps` action drawer), top-content
  `HBarList`. Lean tier (c2/c4/c5): summary stat tiles + state-appropriate copy.
- **Nav** (sponsor/layout.tsx): "Campaigns" `href` `/sponsor/campaigns/c1/report`
  → `/sponsor/campaigns`.
- **Back-links**: `back.ts` gained a `sponsor-campaigns` target
  (→ /sponsor/campaigns); the report page resolves `from=sponsor-campaign`
  **inline** using its own `id` (`/sponsor/campaigns/${id}`, "Back to campaign"),
  since the static TARGETS map can't express an id-dynamic target. Existing
  `from=campaign` (admin origin) untouched.

### Deferred (unchanged, flagged for later)
The ROI report still renders c1's `roiReport`/`roiGauge` fixtures regardless of
`id` — a c3/c4 report shows c1's numbers. Wiring it to real campaign lifecycle
state (empty → partial → full as deliverables verify) is deferred until real
campaign state exists; fine for the PM demo.

### Verification
`tsc --noEmit` clean · `eslint` clean · `next build` succeeds — route table adds
`/sponsor/campaigns` and `/sponsor/campaigns/[id]` (both dynamic), report route
intact. Dev SSR (all 200, no render errors): list shows all 5 with c3 "Pacing
behind"; c1/c3 render the rich dashboard (pacing, roster, report CTA; c3 shows
the attention banner); c5 renders the lean/STAFFING tier with no report CTA;
unknown id → "Campaign not found"; report reached via the detail CTA shows the
"Back to campaign" link. All demo/fixture data — nothing persisted.

### Follow-up — search, filters and sort on the campaigns list (user request)
User asked to add search, filters and sort to `/sponsor/campaigns`. Built to the
applications-desk idiom (instant, no Apply button; URL-synced so a filtered view
is shareable) rather than a form, per the prefer-app-like-UX rule.

- **New client island** [sponsor-campaigns-list.tsx](../../src/components/sponsor-campaigns-list.tsx):
  instant **search** (name + package), **Status** filter
  (Active/Reporting/Staffing/Completed), **Pacing** filter (On track/Behind),
  **Sort** (Name A–Z · Views · Spend · Progress %), dismissible active-filter
  chips + "Clear all", a live "N of M" count and a filtered-empty state. State
  seeded from and synced to the URL (`?q=&status=&pace=&sort=`) via
  `replaceState`. The card markup moved from the server page into the island.
- **filter-kit**: added a `sponsor` tone (the `--sx-sponsor` token already
  existed) so the search/dropdowns/chips tint in the sponsor color, not
  athlete/admin. Shared component — athlete/admin tones untouched.
- **page.tsx** now shapes the `CampaignRow[]` server-side (source of truth
  still `sponsorCampaigns` c1–c5) and passes them + `initial` to the island;
  demo/empty/loading handling stays on the server page.

Verification: `tsc --noEmit` clean · `eslint` clean. Dev SSR (island seeds
filters from the URL, so filtering is verifiable server-side): base → 5 cards;
`?q=community` → c3; `?status=STAFFING` → c5; `?pace=behind` → c3; `?q=zzzzz` →
"No campaigns match"; sort orders confirmed for spend/name/views/progress.

### Follow-up — pagination (user request)
User asked why the toolbar showed "5 of 5" and to make the list support
pagination. The "5 of 5" was the match counter — replaced. Chose **12 per
page**; pager design `‹ 1 2 3 4 5 … 10 … 25 ›` (first/last always shown, window
around current, ellipsis gaps, prev/next arrows).

- **New reusable component** [pagination.tsx](../../src/components/pagination.tsx):
  a controlled, tone-aware pager + an exported **pure** `pageItems(page, count,
  siblingCount?, boundaryCount?)` helper (MUI-style truncation). Returns null
  for ≤1 page. Lives on its own so other lists can adopt it.
- **Wired into** the campaigns island: `PAGE_SIZE = 12`, `page` state seeded
  from `?page=` and synced to the URL (omitted when page 1); any
  filter/sort/search change resets to page 1 via an `onFilter` wrapper; a
  seeded out-of-range `?page=` clamps via a derived `safePage` (no
  setState-in-effect — that tripped `react-hooks/set-state-in-effect`).
- **Counter replaced**: the standalone "N of M" chip is gone. A range line
  ("Showing X–Y of Z[ matching]") shows **only** when filtered or when there's
  more than one page — so the default single unfiltered page (today's 5
  campaigns) shows no counter and no pager, which is what removed the odd
  "5 of 5".

Verified: `pageItems` output checked for count=25 across page positions (early →
`1 2 3 4 5 … 25`, middle → `1 … 12 13 14 … 25`, end → `1 … 21 22 23 24 25`) and
small counts collapse correctly; the range line "Showing 1–1 of 1 matching"
shows when filtered, and `?page=99` clamps to page 1. `tsc` + `eslint` clean.

**Tweaks (user requests):** (1) **always show the pager** — added an
`alwaysShow` prop to Pagination (renders `‹ 1 ›` with disabled arrows for a
single page); enabled on the campaigns list. (2) **right-align it** — dropped
the hardcoded `justify-center` from the component so alignment is
consumer-controlled via `className`; the list passes `justify-end`. Verified on
the running server: pager present at rest, `justify-end` applied, Next disabled
on the single page.

**Page-size selector (user request):** added a **12 / 24 / 60 per page**
dropdown beside the pager, in a `justify-between` footer row (size left, pager
right). `pageSize` state defaults to 12, seeded from and synced to `?size=`
(omitted at 12), and changing it resets to page 1. Reused the filter-kit
`Dropdown` with a new **`includeAll={false}`** prop (added to the shared
component) so it renders just the three sizes with no forced empty "all" row —
a page size is always set. `page.tsx` seeds `size` from the URL. Verified:
dropdown present next to the pager, trigger reads "12 / page" by default and
"60 / page" under `?size=60`. `tsc` + `eslint` clean.

Follow-ups: dropdown moved to sit **directly beside the pager** (footer row
`justify-end` instead of `justify-between`). And, since it's at the page bottom,
the filter-kit `Dropdown` gained a **`placement="up"`** prop (panel opens with
`bottom-full mb-1.5` instead of `top-full mt-1.5`) so the page-size menu opens
**upward** and no longer extends/scrolls the page; the page-size dropdown uses
it. Default placement stays "down" for the top-of-page filter/sort dropdowns.

Then user asked to move the pagination + page-size controls **above the item
list**: now one row directly under the filter toolbar / chips and before the
grid — range indicator left (`mr-auto`), page-size dropdown + pager right. With
the controls back near the top, reverted the page-size dropdown to the default
downward `placement` (the `placement="up"` prop stays on Dropdown for future
bottom-of-page use). Verified via SSR: both controls render before the first
campaign card. `tsc` + `eslint` clean.

Finally, user asked to **duplicate the pager before and after the list**. Added
a second `Pagination` below the grid (right-aligned, `alwaysShow`), sharing the
same `safePage`/`totalPages`/`setPage` as the top one so they stay in sync. The
page-size dropdown + range indicator remain only in the top row. Verified via
SSR: two `aria-label="Pagination"` navs, one before the first card and one after
the last. `tsc` + `eslint` clean.

Then user wanted the **page-size dropdown duplicated at the bottom too**, so the
bottom row now mirrors the top (dropdown + pager). The bottom dropdown uses
`placement="up"` (opens upward — it's at the page bottom). Range indicator stays
top-only. All four controls share the same state. Verified via SSR: two size
dropdowns + two pagers, one set before the list and one after. `tsc` + `eslint`
clean.

## Task — Wire search / filter / sort / pagination on `/sponsor/marketplace`

**Trigger:** user asked to complete all frontend functions on the sponsor
marketplace — especially the sorting, filtering, search and pagination of each
tab (Packages, Athlete inventory, Media properties).

### The problem
The marketplace [page.tsx](../../src/app/(app)/sponsor/marketplace/page.tsx) was
a server component that rendered **every** fixture row per tab with no paging,
and its `FilterChips` were purely decorative (`title="Filters not wired"`,
hardcoded "Basketball ✕" + inert Sport/Geography/Tier/Budget buttons). Nothing
searched, filtered, sorted or paged.

### What was built
One generic client engine reused across all three tabs —
[marketplace-catalog.tsx](../../src/components/marketplace-catalog.tsx),
following the proven sponsor-campaigns-list idiom (instant, URL-synced, no Apply
button), tinted `sponsor`:

- **`useCatalog<T>` hook** — the shared filter/sort/paginate/URL-sync engine:
  instant search, N filter dropdowns (config-driven), a sort menu, page + size
  state, any change resets to page 1, out-of-range `?page=` clamps via a derived
  `safePage` (no set-state-in-effect). Syncs `?q=&<filter>=&sort=&page=&size=`
  via `replaceState`, **preserving `tab` and `demo`** so a filtered view is
  shareable per tab.
- **`CatalogShell`** — toolbar (search + filter dropdowns + right-aligned sort),
  dismissible active-filter chips + "Clear all", filtered-empty state, and the
  dual page-bar (range line + 12/24/60 size dropdown + numbered pager) rendered
  **above and below** the grid, matching the campaigns list. Card body is a
  render prop, so only the per-tab card differs.
- **Three tabs**, each with data-derived filter options:
  - **Packages** — search name/note/contents; filter Availability; sort
    Featured first · Name · Price ↑/↓ (`parseAmount` handles `"$1,500–$3,000"`,
    `"~$2,500"`, `"$15K–$30K+"`).
  - **Athletes** — search name/sport/geo/job; filter Sport · Tier · Availability
    · Verification (Verified/Self-reported); sort Followers · Engagement ·
    On-time · Price · Name. Sponsor prices only — `AthleteRate.amount` still
    never reaches the client (guide §04, §30 test).
  - **Media** — search name/property/platform; filter Availability · Platform
    (from the flattened `platforms` arrays); sort Est. views · CPM · Price ↑/↓ ·
    Name.

The card markup + `IdentityCard` frame moved verbatim from the server page into
the island; the informational footer notes (§7, the AthleteRate rule, the CPM
warn card) stay on the server page. The **tab strip stays a server nav** (`?tab=`
Link), now preserving the `demo` param in its hrefs.

### Verification
`tsc --noEmit` clean · `eslint` clean. Dev SSR (server on :3000, all tabs 200):
`?tab=packages` renders the search box, Availability filter, Sort control, two
pagers and 6 "Request a brief" cards; `?tab=athletes` renders Sport/Tier/
Availability filters + 5 "Add to brief" (Leila `SOLD_OUT` → "Join waitlist");
`?tab=media` renders Platform/Availability filters + 6 "View Details", each with
two pagers. Filter/sort/pager interactions reuse the same primitives already
proven on the campaigns list. All demo/fixture data — nothing persisted.

## Task — Wire the sponsor "Request a brief" / "Add to brief" flow (frontend)

**Trigger:** user asked what the marketplace "Request a brief" button should do
per the docs, then said to build it — **frontend only**. Design brainstormed and
approved (side drawer · in-place confirmation · wire packages + athlete buttons);
spec at
[docs/superpowers/specs/2026-09-15-sponsor-brief-request-drawer-design.md](../../docs/superpowers/specs/2026-09-15-sponsor-brief-request-drawer-design.md).

### The problem
The packages **"Request a brief"** and athlete **"Add to brief"** buttons were
decorative stubs (`title="… not wired"`). Per the docs they're the front door to
the managed-marketplace loop (§9 screen 4, §13, §17: *sponsor brief → matching →
invitation → Campaign Order → …*). The whole flow is Stage 4, **Blocked** in the
task board — FE `P4-FE-01` depends on the backend `CampaignBrief` model
`P4-BE-02`, which doesn't exist. There was **no brief UI anywhere**.

### What was built
New client component
[brief-request-drawer.tsx](../../src/components/brief-request-drawer.tsx) — a
right-side drawer, **frontend only, nothing persisted**:

- **Plumbing copied verbatim** from the applications-desk review drawer: portaled
  to `<body>`, `role=dialog aria-modal`, `sx-drawer`/`sx-backdrop` in-out
  animation, Escape + backdrop close, body scroll-lock, focus to the close button
  → returns to trigger, `animationend`-drives-unmount with a 300ms fallback.
  Sponsor-toned.
- **`BriefSeed`** discriminated union — `{kind:"package"}` (name + price) or
  `{kind:"athlete"}` (name, sport, jobName, sellPrice). Non-null seed opens the
  drawer; the parent clears it to close. Keyed on seed identity so each open is a
  clean slate.
- **Pinned context header** shows what's requested (package badge, or "Requested
  athlete" badge). **Form** captures exactly the `CampaignBrief` fields
  `P4-BE-02` names: Objective (req) · Budget (req, seeded from package price /
  `money(sellPrice)`) · Timing (start date + 2/4/8/12-week duration) · Targeting
  (Sport/Geography/Tier dropdowns, options from `distinct(athleteInv)` like the
  catalog filters; **sport pre-filled** for an athlete seed) · Category (the
  competitor-conflict field, §26) · optional Message. Submit is gated on
  Objective + Budget.
- **On submit** → in-place success state ("Brief received. BTG will match, price,
  run conflict checks and follow up — Phase 1 is managed, no self-service
  checkout (§17)"), plus a persistent "a request, not a purchase" sub-line. No
  network. `AthleteRate.amount` never enters the component — sponsor sell prices
  only (guide §04).

### Wiring
[marketplace-catalog.tsx](../../src/components/marketplace-catalog.tsx):
`PackagesCatalog` and `AthleteCatalog` each hold one `briefSeed` state and mount
a single `<BriefRequestDrawer>`; the two stub buttons now `setSeed(...)` (packages
→ package seed; athletes → athlete seed, still disabled/"Join waitlist" when
`SOLD_OUT`). Media tab untouched. No fixture/backend changes.

### Verification
`tsc --noEmit` clean · `eslint` clean. Dev SSR (server on :3000, all tabs 200):
the package "Request a brief" and athlete "Add to brief" stub tooltips are gone
(remaining "not wired" strings are portal-shell chrome + the intentional sold-out
waitlist). Drawer open/submit/close is client-interactive — not driven in a
browser this pass, but the plumbing is the verbatim, already-proven
applications-desk drawer. Nothing persisted; each open is a fresh form.
