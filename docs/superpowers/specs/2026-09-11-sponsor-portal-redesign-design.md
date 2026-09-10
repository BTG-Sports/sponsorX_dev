# Sponsor Portal Redesign — Design Spec

**Date:** 2026-09-11
**Scope:** the four sponsor-portal pages — `/sponsor`, `/sponsor/marketplace`,
`/sponsor/marketplace/[jobId]`, `/sponsor/campaigns/[id]/report`
**Status:** approved in brainstorming (visual companion mockups in
`.superpowers/brainstorm/158-1789053733/content/`); awaiting implementation plan.

## 1 · Goal and constraints

Redesign the sponsor portal for **client-demo wow** — award-calibre, professional,
data-rich — while staying inside Phase 1's architecture.

Hard constraints (all confirmed with the user):

1. **Server-rendered only.** Rich SVG + CSS motion; no Recharts, no
   framer-motion, no new dependencies. Client JS stays limited to the existing
   nav island. Mobile carousels use CSS `scroll-snap`, not JS.
2. **Every displayed number must be retrievable** from our Postgres, a Zoho
   API, or a real social-platform API (standing rule, saved to memory:
   `stats-must-be-retrievable`). Editorial constants (curated benchmarks,
   market CPM) are allowed only with an `ESTIMATED · curated` label.
3. **§22 provenance everywhere:** every soft number carries a source chip
   (VERIFIED / MANUAL / ATTRIB / EST). The provenance system is a feature,
   not a disclaimer.
4. **§17 managed marketplace:** "Request" / "Add to brief", never checkout.
5. **Field-level authz:** `AthleteRate.amount` never renders on sponsor pages —
   sponsor prices only (guide §04).
6. **Fixtures stay shaped to the V2 Prisma models** — Block B remains a
   substitution. Extensions are append-only; existing keys keep their shape
   because admin pages reuse them (`sponsorCampaigns` is used by `/admin`).
7. **Mobile-first responsive** using the codebase's existing Tailwind
   convention: base = phone, `sm:` = tablet, `xl:` = desktop.

Demo posture: fixtures are tuned for demo impact (full charts, plausible
impressive numbers), but nothing un-sourceable.

## 2 · Visual direction

Hybrid chosen from three mocked directions:

- **Dashboard:** direction A's *hero band* (gradient-glow block, oversized
  gradient-text headline number, cinematic area chart) + direction B's *bento
  density* (grid cells, each with a micro-visualization).
- **ROI report:** direction B's bento grid with direction C's **radial gauge**
  (blue→orange gradient ring) as the centerpiece.
- **Marketplace/detail:** same language, lighter: gradient identity bands,
  stat strips, provenance chips.

Palette stays the A0 brand tokens (`--sx-primary #2E9BF5`, `--sx-accent
#F97A1F`, near-black ground). New visual devices: gradient text on hero
numbers, glow borders (`rgba(46,155,245,.28)`), monogram tiles, dashed
projection strokes, break-even flag markers, provenance chips.

## 3 · Locked statistic inventory (stat → source → label)

| Statistic | Source | Label |
|---|---|---|
| Views / engagements series (daily) | `MetricDaily` (manual now; YouTube Data API public; IG Graph / TikTok Display after OAuth) | VERIFIED_MANUAL → VERIFIED_API |
| Engagement rate, CPV, CPE, cost/redemption, cost/lead | computed from above + spend | inherits worst input |
| Spend / invoiced / paid | Zoho Books API (§18 inbound sync) | VERIFIED_MANUAL |
| Funnel counts + stage conversions | `RewardEvent` (SCAN/LANDING/CLAIM/REDEEM) | VERIFIED_API |
| Median time-to-redeem | `RewardEvent` scan→redeem latency per token | VERIFIED_API |
| Weekend/weekday + spike insights | `RewardEvent` + `MetricDaily` timestamps | VERIFIED_API |
| Geo top markets | `RewardEvent` × `resolve-geo` (GeoLite2, city-level) | VERIFIED_API |
| Per-athlete contribution | `MetricDaily` grouped by deliverable→athlete | as series |
| Per-format performance | `MetricDaily` grouped by deliverable→`NilJob` (SX-01…07) | as series |
| Platform split | `MetricDaily` grouped by deliverable→platform | as series |
| Data trust meter | `MetricDaily.source` distribution (metadata) | n/a |
| Revenue attributed | reward redemptions × offer value, merchant-validated; Zoho Deals | ATTRIBUTED |
| Break-even date | cumulative attributed vs cumulative spend | ATTRIBUTED |
| Projection ("on pace for…") | linear extrapolation of `MetricDaily` | ESTIMATED |
| Leads + consent rate | consent-gated fan PII → `zoho.pushLead` | VERIFIED_API |
| Followers | YouTube public API; IG/TikTok need OAuth; else athlete-entered | SELF_REPORTED until connected |
| Media value | views × market-CPM curated constant | ESTIMATED · curated |
| Category benchmarks | BTG-curated medians table (no external API exists) | ESTIMATED · curated |
| On-time % | `Deliverable` due vs published timestamps | VERIFIED |

**Excluded (no retrieval path in Phase 1):** demographics, sentiment,
real-time counters, view-through / payment-network attribution (§16).

### Platform-split sourcing plan (approved)

- **Layer 0:** the split itself is structural — `MetricDaily → Deliverable →
  platform`; no API needed for grouping.
- **Layer 1 (now):** BTG staff log public post counts at content-approval
  time → VERIFIED_MANUAL. Fixtures model this.
- **Layer 2 (first automation):** `sync-social-metrics` worker job polling the
  YouTube Data API v3 (`videos.list?part=statistics`, public, batch 50 IDs,
  free quota) → VERIFIED_API for YouTube rows.
- **Layer 3 (B-phase):** athlete OAuth in onboarding ("Social accounts" §11
  section): IG Graph API (`instagram_manage_insights`, professional accounts),
  TikTok Display API (`video.list`; requires developer app review — lead-time
  item). Same `MetricDaily` shape; only `source` upgrades.
- **Layer 4 (already ours):** `t/[code]` `LinkEvent` clicks and reward events
  per platform — VERIFIED_API with zero third-party involvement.
- Engagement normalization note: per-platform engagement definitions differ;
  the worker normalizes into one `engagements` metric; report footnotes it.

## 4 · Page designs

### 4.1 `/sponsor` — dashboard

Desktop layout, top to bottom:

1. **Header row** — title + tenant line; period picker + "Export report"
   (decorative, `title` tooltips as today).
2. **Hero band** (gradient glow, blue border): left column = "Views delivered"
   label, 42px gradient-text total, green delta, season-target pacing meter,
   "On pace for … `EST`" projection line of copy. Right = full-width dual-series
   area chart (views gradient-filled; engagements ×10 orange line) with
   **dashed projection segment** after "today", **break-even flag** (green
   dashed vertical + "⚑ broke even · May 14"), endpoint glow dot, 3–4 x labels.
   Bottom of band: **auto-insights strip** — three computed callout chips
   (spike attribution, weekend vs weekday, median time-to-redeem).
3. **Bento KPI row** (4 cells): Engagements + sparkline; Spend + budget meter
   ("64% of $47.5K · Zoho Books"); Reward funnel mini (stepped bars, "23% ·
   median 26h"); Return tile (orange glow, 2.73×, links to report).
4. **Data trust meter** — slim full-width cell: stacked provenance bar +
   legend (58% verified API / 24% manual / 11% attributed / 7% estimated).
5. **Campaign portfolio (2fr) + right rail (1fr):** portfolio = card-rows with
   monogram tile, name + status chip (ACTIVE / **PACING BEHIND** amber /
   REPORTING / COMPLETED / STAFFING), meta line, views + spend right-aligned,
   full-width delivery progress bar with n/m label. Right rail = **Top
   athletes leaderboard** (rank, monogram, views, optional flag) + **Renewal
   card** (blue glow gradient, headline, two CTAs).

Replaces: flat 4-stat row, separate chart card, plain campaigns table,
old funnel list, old renewal card.

**Mobile (base, 390px):** one column, same order — hero (number above chart,
36px; chart keeps projection + break-even, drops gridlines, 3 x-labels) →
insights as **scroll-snap swipe strip** with dot indicators → bento 2×2
(cells lose tertiary caption) → trust meter (legend wraps 2×2) → campaign
cards (numbers wrap below name, full-width bar, whole card ≥44px tap target)
→ leaderboard → renewal. No horizontal page scroll; only the insights strip
scrolls intentionally; `tabular-nums` everywhere.

### 4.2 `/sponsor/campaigns/[id]/report` — ROI report

1. **Header** — title, campaign/sponsor/period line; period picker +
   "⬇ Download PDF" (queues `render-report` on the worker — B7; decorative
   now with tooltip).
2. **Zone 1 · Return hero** (radial-glow band, 3-col grid): **radial gauge**
   130px, blue→orange gradient ring at ~68% sweep, "2.73×" center + RETURN
   caption + "attributed ÷ investment `ATTRIB`" footnote │ **money story**
   stack: Invested $19,200 `ZOHO BOOKS` → Revenue attributed $52,500 `ATTRIB`
   ("merchant-validated coupon redemptions") → Est. media value $32,936
   `EST · curated CPM` │ **return-over-time** area (orange) with green dashed
   **1.0× break-even** horizontal line, crossing dot labeled "May 14".
3. **Zone 2 · Composition bento** (3 cells): **By content format** — labeled
   h-bars per SX job (Reels 412K … Appearances 60K flagged amber ▼), insight
   line "Reels deliver 3.1× the views-per-dollar of stories" · `METRICDAILY`
   chip; **By platform** — donut (IG 52% / TikTok / YouTube) + legend +
   insight "TikTok engagement rate 2.4× Instagram's"; **Top markets** —
   labeled geo bars (DC 24% …) + "54% of redemptions within 25mi of DC —
   city-level only, no IP stored" · `REWARDEVENT · GEO` chip.
4. **Zone 3** (1.2fr/1fr/1fr): **Reward funnel** — true stepped bars with
   inter-stage conversion % (78% / 67% / 43%), overall 23%, median 26h,
   "4,300 consented leads pushed to Zoho CRM"; **Efficiency** — CPV $0.023
   (−39% vs bench), CPE, cost/redemption, cost/lead `ATTRIB`, footnote
   "Benchmarks are BTG-curated category medians `EST`"; **Delivery** — views,
   engagements, deliverables n/m + on-time %, leads, each with chips.
5. **Zone 4** (1.6fr/1fr): **Top content leaderboard** (rank, athlete
   monogram, title, format · platform, views + eng%); **Recommendation card**
   (blue glow) citing the data above ("shift appearance budget into 2 more
   reels … projected +22% return `EST`") + "Plan the renewal →" CTA; inline
   honesty footnote (replaces the old yellow warning card): "Media value is
   estimated · revenue is attributed via merchant-validated coupons, not
   payment-network data (§16 · §22)".
6. Keep: back-link, cross-links to ops view / analytics, fixture footer.

**Mobile:** gauge → money story → return-over-time → composition cells
stacked → funnel → efficiency → delivery → top content → recommendation.

PDF note: this bento layout is what B7's Playwright job renders; cells stack
into print pages cleanly.

### 4.3 `/sponsor/marketplace`

Keeps: three tabs (Packages / Athletes / Media) via `?tab=`, managed-market
copy, §04 field rule footnotes.

- **Header** adds a curation line ("47 athletes · 6 packages · curated by
  BTG"). Tab strip restyled as segmented control (active tab gets portal
  accent tint).
- **Filters → chips** with one demo active-state chip ("Basketball ✕") +
  dropdown chips (Sport / Geography / Tier / Budget) — still decorative with
  the §13 tooltip, as today.
- **Athlete cards** (the flagship upgrade): gradient identity band (40px
  gradient monogram avatar, name + verified tick, sport · position · geo,
  tier chip) → **3-stat strip** in a bordered row: followers (+ `SELF`/`VER`
  chip), engagement rate, on-time % (`VER`) → featured job row (SX chip, job
  name, sponsor price 14px bold) → two CTAs: Profile (secondary) / **Add to
  brief** (accent). SOLD_OUT: card dims to 75%, CTA becomes "Join waitlist".
- **Package + media cards** adopt the same frame (identity band + stat strip);
  packages visually match the public `/packages` cards.

**Fixture note:** `athleteInv` gains `engagementRate`, `onTimeRate`,
`verified` (append-only).

### 4.4 `/sponsor/marketplace/[jobId]` — inventory detail

- **Hero band** (blue glow): "EXCLUSIVE · 26 WEEKS" chip, 18px title,
  property · formats line; right-aligned stat trio — Est. views 1.2M `EST`,
  Implied CPM $16 (§15), Price $19,200 (orange).
- **Includes grid** (2-col ✔ list) + usage-rights / approval footnote.
- **"Managed by BTG" rail** (orange glow card): explainer + "Request this
  inventory" (primary) + "Talk to BTG" (secondary). No checkout affordance.
- Keeps back-link resolution and not-found handling.

**Mobile:** hero stats wrap under the title; grids go 1-col.

## 5 · New/updated components (`src/components/`)

All server components, SVG + Tailwind/CSS only:

| Component | Purpose | Key props |
|---|---|---|
| `AreaChart` (new; `line-chart.tsx` stays for admin pages until migrated) | gradient-filled area + optional second series (normalized to its own scale, dual-axis like the existing `LineChart`; legend names it), optional dashed projection segment, optional vertical event marker, endpoint glow dot | `points`, `projection?`, `marker?: {index, label}`, `bSeries?`, `height`, `xTicks`, formatters |
| `RadialGauge` | gradient-ring gauge | `value`, `display`, `caption`, `size` |
| `Donut` | segmented ring + center stat | `segments: {label, value, color}[]`, `centerLabel` |
| `FunnelSteps` | stepped funnel bars + inter-stage % | `stages: {label, value}[]` |
| `HBarList` | labeled horizontal bars (format, geo) | `rows: {label, sub?, value, display, tone?}[]` |
| `Sparkline` | tiny single-path line | `points`, `stroke` |
| `TrustMeter` | stacked provenance bar + legend | `mix: {verifiedApi, verifiedManual, attributed, estimated}` |
| `InsightStrip` | callout chips; CSS scroll-snap carousel on mobile | `items: {icon, text}[]` |
| `MiniChip` | compact provenance/source chip (smaller than `SourceLabel`; adds ZOHO / table-name variants) | `kind`, `label?` |
| `HeroBand` | shared gradient-glow container | `children`, `tone?` |
| `Monogram` | gradient initials tile/avatar | `text`, `shape`, `tone` |

`ui.tsx` primitives (Card, Badge, StatTile, Meter, SectionHeading,
SourceLabel) are unchanged; new components live in a new
`src/components/charts.tsx` (+ `hero.tsx` if cleaner). Existing `LineChart`
remains untouched for admin/property pages — out of scope here.

CSS additions in `globals.css`: entrance animation utilities
(`@keyframes` fade-up, staggered via `animation-delay`), glow-border helper,
gradient-text helper, scroll-snap utilities. Respect
`prefers-reduced-motion`.

## 6 · Fixture extensions (`src/lib/fixtures.ts`, append-only)

New keys (shapes mirror V2 models / derivable queries):

- `sponsorHero`: `{ views, deltaPct, target, pacingPct, projectedTotal,
  series: {label, views, engagements}[] (31 daily pts, May 1–31), projection:
  {label, views}[] (~5 pts), breakEvenIndex, breakEvenLabel }`
- `sponsorInsights`: `{ icon, text }[]` (3)
- `metricTrust`: `{ verifiedApi: 58, verifiedManual: 24, attributed: 11,
  estimated: 7 }`
- `sponsorBudget`: `{ contracted, spent }` (cents)
- `sponsorCampaignsX`: per-campaign extension keyed by id `{ views, monogram,
  endsIn, pacing: "ON_TRACK" | "BEHIND" }` (keeps `sponsorCampaigns` intact
  for `/admin`)
- `topAthletes`: `{ rank, name, initials, views, flag? }[]`
- `roiGauge`: `{ value: 2.73, sweepPct, invested, attributed, mediaValue }`
- `roiTimeline`: `{ label, x }[]` + `breakEvenIndex`
- `formatPerformance`: `{ jobId, label, views, note?, tone? }[]`
- `platformSplit`: `{ platform, views, pct, color }[]` + insight string
- `geoMarkets`: reuse/extend `topLocations` shape + insight string
- `funnelDetail`: stages + `conversions: number[]` + `medianRedeemHours: 26`
  + `leadsPushed`
- `efficiency`: `{ label, value, benchDeltaPct?, kind }[]`
- `topContent`: extend existing with `format`, `platform`, `engagementRate`
- `roiRecommendation`: `{ body, projectedLiftPct }`
- `athleteInv` rows gain `engagementRate`, `onTimeRate`, `verified`
- `inventoryItem` gains `exclusivityLabel` (display form)

All amounts stay in cents; all rates as numbers, formatted at render.

## 7 · Out of scope / explicitly not doing

- No changes to admin, athlete, property, or public pages (except none of the
  shared fixtures they consume change shape).
- No new dependencies; no client components beyond existing nav.
- No demographics / sentiment / real-time anywhere.
- Loading/empty/error states and light theme remain **A2** work (this
  redesign must not regress the current behavior, but sparse-data states are
  designed later; demo fixtures are always full).
- No wiring — everything stays fixtures; `title` tooltips keep marking
  unwired actions.
- `LineChart` migration for non-sponsor pages: later.

## 8 · Verification

- `npx tsc --noEmit` clean · `next build` green · `eslint` clean on touched
  files.
- Visual pass on all four pages at 390px / 768px / 1440px (dev server).
- Greps as acceptance checks: no `AthleteRate` / athlete `rates` import in
  sponsor pages; every new stat cell renders a `MiniChip`/`SourceLabel` or
  cites its source in a caption.
- Redeem page and other portals untouched (`git diff` scope check).
- Log to `Memory/2026-09-11/` after completion.

## 9 · Open questions (none blocking)

- None. Benchmarks/media-value constants are fixture-side until BTG curates
  real ones; the `sync-social-metrics` job is recorded as a B-phase roadmap
  item, not built now.
