# Sponsor portal — "the Stadium Board" (P1-ART-23) — design + build contract

**Date:** 2026-10-11 · **Branch:** `feature/P1-ART-23-sponsor-stadium` (from `feature/P1-ART-22-athlete-arena`)
**Owner's ask:** redesign **every** sponsor page the way the admin (Mission Control) and athlete
(the Arena) portals were redone: dashboard structure, every list server-paged with the house
pager, but with a look clearly distinct from both. Lead with statistics, because this is a
dashboard. "Wow factor", awwwards-level, **and user-friendly for non-technical people.**
Direction chosen in the visual companion: **A · Stadium Board** (mockups in
`.superpowers/brainstorm/24-1791723650/content/`).

## 1. Identity: admin = Mission Control, athlete = the Arena, sponsor = the Stadium Board

The sponsor's logo appears on the LED boards around a stadium. That is the motif.

| | Admin (`.sx-ops`) | Athlete (`.sx-arena`) | **Sponsor (`.sx-stadium`)** |
|---|---|---|---|
| Theme | fixed dark | theme-aware | **fixed dark** (a night stadium; the ThemeToggle is hidden as on admin) |
| Hue | steel + cyan | athlete blue + orange flare | **sponsor orange `--sx-sponsor` as LED light**, warm near-black ground `#0b0a09`; green for good, red for late |
| Shape | chamfers, corner brackets | 18px rounded plates, slanted speed bar | **LED panels: 6px radius, a 1px orange hairline border, a faint horizontal scan-line texture** (`repeating-linear-gradient`, about 2.5% white) |
| Numerals | upright mono | bold italic "jersey" | **bold upright sans, tabular, with an orange glow halo** (`text-shadow`), as if lit |
| Signature | floor grid, scan sweep | floodlights, lanes, stripes | **the LED ticker**: a full-width strip under the top bar that scrolls live facts. Plus a **dot-matrix band** along the bottom edge of the stage and a warm glow from the top left |
| Entrance | rise up | slide in from the left | **power on**: a tile flicks on (opacity plus a brief brightness flicker, staggered); rows cascade top to bottom |
| "Needs you" | cyan | orange flare | **solid orange count badge with a slow pulsing glow** (orange already means the brand, so attention is shown by a *filled, pulsing* shape, not by colour alone) |

Never put a chamfer, corner bracket, floor grid, speed bar or lane on the sponsor side, and never
put the ticker or the scan-lines on the other two. Reduced motion: the ticker stops (and is
replaced by a static row of facts), there is no flicker, and the count-ups show their final value.

## 2. Friendly for non-technical users (applies to every page)

- **Plain words only.** One map, `frontend/src/lib/sponsor-words.ts`, turns every enum into
  everyday language, and pages never print a raw enum:
  - CampaignState: DRAFT "Being set up", STAFFING "Finding athletes", APPROVAL "Needs your OK",
    ACTIVE "Running", REPORTING "Wrapping up", COMPLETED "Finished", CANCELLED "Cancelled".
  - BriefState: DRAFT "Draft", QUALIFIED "Being matched by BTG", APPROVED "Ready for you",
    CAMPAIGN_CREATED "Became a campaign", CLOSED "Closed".
  - MarketplaceOrderState: PENDING_SELLER / PENDING_APPROVAL "Waiting for approval",
    APPROVED / AWAITING_PAYMENT "Ready to pay", PAID / IN_DELIVERY "In progress",
    FULFILLED / CLOSED "Delivered", CANCELLED "Cancelled", REFUNDED "Refunded".
  - MetricSource: VERIFIED_API "Checked with {platform}", VERIFIED_MANUAL "Checked by BTG",
    SELF_REPORTED "Reported by the athlete", ESTIMATED "Estimate", ATTRIBUTED "Linked to your
    campaign".
  - Metric names: views → "People reached", engagements → "Likes, comments & shares",
    CPM → "What you pay per 1,000 people reached", SCAN/LANDING/CLAIM/REDEEM → "Scanned QR /
    Opened offer / Claimed / Redeemed".
- **A `?` explainer** (`StadiumHint`, a small client popover with hover, focus and tap) next to
  every number that could be unclear: one sentence, no jargon.
- **The provenance pill reads "● Updated 9:41 AM"**, not "Postgres · read". Where the data comes
  from is in the `?`.
- **Status chips use colour plus a word** (never colour alone): Running (green), Needs your OK
  (orange, filled), Behind (red), Finished (grey).
- **Empty states say what to do next**, e.g. "No campaigns yet. Find athletes to start one →".
  An all-clear "Needs you" says "You're all caught up ✓".
- **Status bars** (`StadiumSteps`) show where a request, campaign, order or checkout stands, in
  3–5 plain steps.
- **Phone:** tiles go two-up, then one-up; wide tables become stacked cards below `sm`; no
  horizontal page scroll at 390px.

## 3. Page anatomy (as on admin and athlete — memory `admin-desks-are-dashboards`)

1. `StadiumHead`: a small `<h1 class="sx-page-title">`, the "Updated" pill, actions on the right.
   No hero, no dek, no watermark word.
2. `StadiumTiles` → 3–5 `StadiumTile`s. Every figure comes from a summary, counts or overview
   read, never from the rows on screen. Money is in cents. A tile may carry a sparkline, a change
   against the previous period (▲/▼, coloured) and a link to the page it counts.
3. The work: controls (instant, URL-driven, filter-kit `Dropdown` with `tone="sponsor"`, no Apply
   button, no native `<select>`), then the list.

## 4. Pagination (memory `pagination-pattern`, verbatim)

Server-paged always: `?page=&size=` read with `pageParams`/`apiListQuery`; 12/24/60, default 12;
defaults omitted from the URL; any filter, search, sort or size change resets to page 1; the API
clamps an out-of-range page. Controls sit above **and** below. The top `PagerRow` carries the
range text only when filtered or when there is more than one page, and the bottom size menu
opens upward. The pager is `alwaysShow`. A second list on one page gets its own keys
(`pageParamsFor`). `tone="sponsor"`. Only genuinely bounded sets stay unpaged: the cart, one
order's lines, one campaign's athlete roster.

## 5. Shared kit (new; mirrors the arena kit's API so pages read the same)

- `frontend/src/app/globals.css`: a `.sx-stadium` block after `.sx-arena`. It holds tokens
  (`--st`, `--st-glow`, `--st-line`, `--st-plate`), the ground (top-left glow, dot-matrix band,
  pointer light), panels and scan-lines, numerals, title, pill, ticker, chips, badge pulse, steps,
  buttons, tabs, drawers, tables, nav, the power-on entrance and the reduced-motion overrides.
  It also overrides `.sx-card` / `.sx-stat` so detail islands that are not rewritten still pick
  up the skin.
- `frontend/src/components/stadium-stage.tsx`: `StadiumGround`, `StadiumTicker` (server:
  takes `facts: string[]`, duplicates them for a seamless loop, `aria-hidden` with an `sr-only`
  list), `StadiumHead`, `StadiumTiles`, `StadiumTile` (`format`, `delta`, `spark`, `share`,
  `href`, `hint`), `StadiumPanel`, `StadiumSection`, `StadiumChip`, `StadiumBadge`,
  `StadiumSteps`, `StadiumRow`, `StadiumGhost`.
- `frontend/src/components/stadium-hint.tsx`: the `?` popover (client).
- `frontend/src/components/stadium-trend.tsx`: client island, the large chart. A metric switch
  (People reached / Clicks / Redeemed), an SVG area chart with a glowing line, and a hover/focus
  crosshair with a tooltip ("Sep 28 · 5,840 people"); keyboard ←/→ steps through the days. Draws
  from the overview's `daily` series. No chart library (recharts stays unused, as elsewhere).
- Reused, not rebuilt: `ArenaCount` (count-up) from `arena-fx.tsx`; `FunnelSteps`, `HBarList`,
  `Sparkline` from `charts.tsx`, restyled under `.sx-stadium`; `PagedTable`, `ServerList`,
  `PagerRow`, `ListSearch`, `ListFilter`, `TabStrip`.
- `PortalShell` gains `stage="stadium"` (root `.sx-stadium`, `OpsStage` pointer light +
  `StadiumGround`, ThemeToggle hidden). `StagePortals` puts the class on `<body>` for drawers.
- `sponsor/loading.tsx` → `StadiumGhost`.

## 6. Sidebar (`sponsor/layout.tsx`, via `lib/nav-groups.ts`, pinned in `tests/nav-groups.test.ts`)

- **Dashboard**, alone on top.
- **Campaigns** (megaphone): Campaigns, Requests.
- **Marketplace** (store): Cart (with an item-count badge), Find athletes, Orders, Shop.
- **Account** (gear): Billing · soon, Messages · soon, Settings · soon (inert, as today).

Analytics, Rewards and Leads leave the sidebar: the new dashboard and results pages cover what
they promised, and they had no route. Routes are unchanged (`/sponsor/marketplace` is labelled
"Find athletes"). Requests is a new route, `/sponsor/requests`. Its list moves off the
campaigns page, where a "Your requests" tile links to it.

## 7. Pages

Every page has a live mode and a demo mode (`?demo=`, fixtures). Both render through the same
stadium components; demo keeps its fixtures and its "Sample data" pill.

### 7.1 Dashboard — `/sponsor`
- **Ticker:** campaigns running · people reached today · posts waiting for your OK · fans who
  redeemed today · top city. All are from the overview read; a fact with a zero or null value is
  left out.
- **Head:** "Your sponsorships", Updated pill, a **range switch (7 days / 30 days / 90 days / All
  time, `?range=`, default 30d)** that drives every number below, and "+ New request".
- **Five tiles:** People reached · Likes, comments & shares (with "x% of people reached") · Link
  clicks · Fans who redeemed · Money spent (invoiced, with a paid share bar and "$x paid · $y
  still to pay"). The first four carry a sparkline and a change against the previous period of
  equal length; "All time" shows no change.
- **Row:** `StadiumTrend` (2/3) + **Needs you** (1/3): posts waiting for your OK → the campaign's
  review section; artwork to approve; invoices to pay; orders waiting. Each row has a count badge.
- **Row:** From scan to redeemed (`FunnelSteps`) · What you pay per 1,000 people reached (paid ÷
  views; **no benchmark is shown**, because Phase 1 holds none: `sponsor-report.ts` L111) · Posts
  delivered (x of y, late count, next due).
- **Row:** Your top athletes by people reached (top 5) · Where fans redeemed (top 5 cities,
  `HBarList`).
- **Your campaigns:** `PagedTable` (Campaign + athlete count, Status chip, Posts delivered with a
  mini bar, People reached, Redeemed, Spent, Next due), with search, a status filter and sort.
  This replaces the old portfolio list and the duplicate report-links list. Each row links to the
  campaign, and the row menu offers "See results".

### 7.2 Campaigns — `/sponsor/campaigns`
Tiles: Running · Needs your OK · Behind schedule · Total budget (with a share-spent bar), plus a
"Your requests: n in progress →" link tile. Tab strip with counts (All / Running / Needs your OK
/ Finished) from `/campaigns/summary.byState`, plus search and sort. Server-paged (already). It
gets the new look and plain words.

### 7.3 Requests — `/sponsor/requests` (new route)
Tiles: Being matched by BTG · Ready for you · Became campaigns (from `/briefs` `counts`). Tabs
by state; each row has a `StadiumSteps` mini bar (Sent → Matching athletes → Price agreed →
Campaign live). Server-paged through the existing paged `/briefs`. The 20-row cap goes.

### 7.4 One campaign — `/sponsor/campaigns/[id]`
Head: name, status chip, "See results →". `StadiumSteps` (Planned → Athletes signed → Posting →
Finished, from CampaignState). Tiles: Posts delivered x/y (bar) · Athletes · Spent of budget ·
Next post due. **Waiting for your OK** first: post cards with preview, caption and **Approve** /
**Ask for changes** (the existing review actions). Then Artwork, then the athlete roster
(bounded, not paged). The campaign's posts list is server-paged via `GET
/deliverables?campaignId=&page` with `keys={{page:"ppage", size:"psize"}}`.

### 7.5 Campaign results — `/sponsor/campaigns/[id]/report`
Range switch as on the dashboard. Tiles: People reached · Likes, comments & shares · Fans who
redeemed · What you pay per 1,000 people reached. Row: `StadiumTrend` (overview read with
`campaignId`) + **"How sure are we?"**: the reach split by source in plain words with ✓/○
marks. Row: From scan to redeemed · Best athletes. Then link clicks by post, observations, the
published posts as a gallery, and edition placements. It is all the existing `/report` payload
except the daily series.

### 7.6 Find athletes — `/sponsor/marketplace`
Tiles: Athletes available · Ready-made packages · Sports. Tabs: Packages / Athletes & jobs, with
search, a Sport filter and a Budget filter. A server-paged card grid with its own keys per tab.
Picking a card opens the existing request drawer. The client slicing in
`marketplace-catalog.tsx` goes.

### 7.7 One athlete job — `/sponsor/marketplace/[jobId]`
Restyle only (Head with "Request this", three tiles, details). It stays on fixtures, as today.

### 7.8 Shop — `/sponsor/shop`
Tiles: Spots for sale (search total) · In your cart · Cart total (from `/cart`). The GET form,
native selects and **Apply** button are replaced by instant `ListSearch` + `ListFilter`s (Type,
Sport, Price, Dates). A server-paged card grid; "Add to cart" posts in place with a toast and
the cart badge updating. The 50-item cap goes.

### 7.9 Cart — `/sponsor/cart` and Checkout — `/sponsor/checkout`
Cart: rows plus a sticky order summary (Subtotal, Fees, Total, "Checkout →"); bounded, not
paged. Checkout: `StadiumSteps` across the existing four steps (Hold your spots → Billing contact
→ Terms → Place order) and a live hold countdown ("Spots held for 14:52") from the reservation's
expiry. The logic is unchanged.

### 7.10 Orders — `/sponsor/orders`
Tiles: Waiting for approval · In progress · Delivered · Total spent (from the new orders
summary). Tabs with counts, search, server-paged rows (Order #, items, status chip, placed,
total).

### 7.11 One order — `/sponsor/orders/[id]`
`StadiumSteps` (Placed → Approved → Paid → Delivered). Tiles: Total · Payment · Delivered x/y.
Lines with delivery proof. Cancel stays behind its confirm dialog. Logic unchanged.

## 8. Backend contract

Each new or changed read has a `tenant-scope:` comment on every Prisma call, sponsor scoping
through the existing `whereFor` / `assertAllowed`, an entry in `src/contracts/registry.ts`, a
`*.paged.test.ts` (or `*.test.ts`) including a **cross-tenant** and a **cross-sponsor** case
(§30), and fixture ids prefixed per file (memory `backend-test-ids-unique`). Without `?page`,
every legacy response stays byte-for-byte the same.

### 8.1 NEW `GET /sponsor/overview?range=7d|30d|90d|all[&campaignId=]`
Read-only, for SPONSOR_ADMIN / SPONSOR_ANALYST (and BTG preview), scoped to the actor's sponsor
campaigns (with `campaignId`, one campaign, 404 if out of scope). Response:

```ts
{
  readAt: string,
  range: { key, from: string|null, to: string, days: number|null, bucket: "day" | "week" },
  reach:   { views, engagements, prev: { views, engagements } | null,
             bySource: Partial<Record<MetricSource, number>> },          // MetricDaily
  clicks:  { total, prev: number | null },                                // LinkEvent
  fans:    { scan, landing, claim, redeem, prevRedeem: number | null,
             events: number },                                            // RewardEvent by type
  daily:   { day: string, views, engagements, clicks, redeems }[],        // zero-filled
  today:   { views, redeems },                                            // ticker
  delivery:{ due, delivered, late, nextDueAt: string | null },            // Deliverable
  topAthletes: { athleteId, name, sport, views }[],                       // ≤5, by views
  topCities:   { city, region, redeems }[],                               // ≤5, REDEEM with a city
  money?:  { contractedCents, invoicedCents, paidCents },                 // same permission gate as /campaigns/summary
  costPer1000Cents: number | null,                                        // paid ÷ views × 1000; null when views = 0 or money hidden
  needsYou:{ postsToReview, artworkToApprove, invoicesUnpaid, ordersWaiting },
  campaigns: { running }
}
```

`all` starts at the earliest MetricDaily / RewardEvent / LinkEvent day in scope, and buckets by
week once the span is over 120 days. `prev` covers the equal-length window just before; it is
null for `all`. Joins: MetricDaily → Deliverable → Order → Campaign (and the athlete);
RewardEvent → token → Reward → Campaign; LinkEvent → TrackingLink → its campaign/deliverable.
Use `groupBy` / raw aggregate SQL. Never load rows to sum in JS.

### 8.2 `GET /marketplace-orders` paging + `GET /marketplace-orders/summary`
List: `?page size tab q` → `{ orders, page, tabs: [{ key, label, count }] }`, with tabs `all`,
`waiting` (PENDING_SELLER, PENDING_APPROVAL), `to_pay` (APPROVED, AWAITING_PAYMENT),
`in_progress` (PAID, IN_DELIVERY), `delivered` (FULFILLED, CLOSED), `cancelled` (CANCELLED,
REFUNDED). Newest first; `q` matches the order id or a line title. Summary: `{ byTab: counts,
spentCents }`, where spent = totalCents over paid-or-later states.

### 8.3 `GET /marketplace/search` paging
`?page size` (plus the existing filters) → `{ results, page }` with `total`; the legacy `limit`
path is unchanged.

### 8.4 `GET /catalogue/packages` and `/catalogue/jobs` paging
`?page size q sport budgetMax` → `{ packages|jobs, page, counts: { athletes, packages, sports } }`.

### 8.5 Already sufficient
`/campaigns` + `/campaigns/summary`, `/briefs` (paged, `counts`), `/deliverables?campaignId&page`,
`/campaigns/:id/report`, `/cart`, `/reservations/:id`.

## 9. Verification

- Backend: `npm run lint -w @sponsorx/backend`; `npx vitest run` on the new and changed test
  files (embedded Postgres per memory `test-db-without-docker` if Docker is down).
- Frontend: `npx eslint <changed>`, `npx vitest run` on related tests (`nav-groups`, any test
  pinning old sponsor markup), and update `e2e/marketplace-path.spec.ts` selectors for the shop,
  cart and orders.
- `npm run build` in a detached worktree if the owner's `next dev` is live (memories
  `build-in-detached-worktree`, `never-build-into-live-next-dev`).
- A QA walk as the sponsor QA user (memory `local-qa-walk-setup`) at 1440 and 390: no horizontal
  overflow, reduced motion respected, every tile's number matches its API, and the pager behaves
  per §4.

## 10. Out of scope

Real pages for Analytics, Rewards, Leads, Billing, Messages and Settings; live data for
`/marketplace/[jobId]`; a light-theme variant of the Stadium Board; industry benchmarks;
demographics or sentiment (no source in Phase 1).

## 11. Bookkeeping

Add **P1-ART-23** to `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx` (fractional Order
after P1-ART-22, extend the Dashboard ranges), and log to `Memory/2026-10-11/`.
