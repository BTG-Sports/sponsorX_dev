# Tasks Completed — 2026-09-11

## Task 1 — Sponsor portal redesign (design → spec → plan → shipped)

**Trigger:** user asked to redesign all sponsor-portal pages before starting A2 —
"too stale, data too small, especially the ROI report"; wanted client-demo wow,
award-calibre, professional, with the data structure per page redesigned.

### Design process (superpowers brainstorming + visual companion)
- Ran the browser-based visual companion (mockups preserved in
  `.superpowers/brainstorm/158-1789053733/content/`; `.superpowers/` gitignored).
- **User decisions:** audience = client demo (fixtures tuned for impact);
  tech = rich SVG + CSS motion, **zero new deps** (stay server-rendered, B0
  boundary intact); scope = all 4 sponsor pages; direction = hybrid —
  **A "Command Deck" hero band + B "Executive Bento" density**, with
  **C's radial gauge** as the ROI report centerpiece.
- **Standing rule captured (also in Claude persistent memory
  `stats-must-be-retrievable`):** every displayed number must be retrievable
  from Postgres, a Zoho API, or a real social-platform API; curated constants
  (benchmarks, market CPM) only with `EST · curated` labels; no demographics /
  sentiment / real-time anywhere in Phase 1.
- **Platform-split sourcing plan (approved):** grouping is structural
  (MetricDaily → Deliverable → platform); numbers start VERIFIED_MANUAL
  (public post counts logged at content-approval time) → `sync-social-metrics`
  worker polls YouTube Data API v3 (public, no OAuth) → IG Graph +
  TikTok Display via athlete OAuth in onboarding (TikTok needs app review —
  lead-time item) → our own `t/[code]` LinkEvents are platform data we fully
  own today. Engagement definitions normalized in the worker.
- **Spec:** `docs/superpowers/specs/2026-09-11-sponsor-portal-redesign-design.md`
  (committed). **Plan:** `docs/superpowers/plans/2026-09-11-sponsor-portal-redesign.md`.

### Shipped (9 plan tasks, committed per task on main)
- **globals.css:** `--sx-success #22c98d` token; `.sx-gradient-text`,
  `.sx-animate`/`.sx-delay-*` fade-up motion (respects
  `prefers-reduced-motion`), `.sx-snap-x` scroll-snap strips.
- **`src/components/hero.tsx`:** `HeroBand` (gradient-glow container),
  `Monogram` + `initials()`, `MiniChip` (compact provenance chips —
  ver/manual/att/est/warn/neutral), `InsightStrip` (CSS snap carousel on
  phones).
- **`src/components/charts.tsx`:** `AreaChart` (gradient fill, dual axis,
  dashed projection tail, break-even event marker, endpoint glow),
  `RadialGauge` (blue→orange ring), `Donut`, `FunnelSteps` (full mode with
  inter-stage conversion %, compact glyph mode), `HBarList`, `Sparkline`,
  `TrustMeter`. All server components, SVG only, `useId` for gradient ids.
  Existing `line-chart.tsx` untouched (admin/property pages still use it).
- **fixtures.ts (append-only):** `sponsorHero` (31-day computed series +
  projection + breakEven), `sponsorInsights`, `metricTrust`, `sponsorBudget`,
  `engagementSpark`, `sponsorCampaignsX` (keyed extension — `sponsorCampaigns`
  untouched for /admin), `topAthletes`, `roiGauge`, `roiTimeline`,
  `formatPerformance`, `platformSplit`, `geoMarkets`, `funnelDetail`,
  `efficiency`, `topContentX`, `roiRecommendation`, `roiDelivery`;
  `athleteInv` rows gained `engagementRate`/`onTimeRate`/`verified`.
- **`/sponsor`:** hero band (gradient 823,400 + pacing meter + projection copy
  + AreaChart w/ break-even flag + insight strip) → bento KPIs (engagements
  sparkline, spend vs Zoho budget, compact funnel w/ 26h median, orange ROI
  tile) → Data-trust provenance bar → campaign portfolio card-rows (monograms,
  PACING BEHIND chips, progress bars) → top-athletes leaderboard + glowing
  renewal card.
- **ROI report:** RadialGauge 2.73× centerpiece + money story (Invested
  `ZOHO BOOKS` / Attributed / `EST · curated CPM` media value) + return-over-time
  with 1.0× break-even · composition bento (format HBars w/ amber
  under-performer, platform Donut, geo bars) · funnel w/ stage conversions,
  efficiency w/ curated-benchmark deltas, delivery w/ chips · top content +
  recommendation card; old warning card became inline footnote (§16 · §22).
- **Marketplace:** segmented tabs (sponsor-orange active), filter chips
  (decorative, §13 tooltip), identity-band cards for all three tabs; athlete
  cards = gradient monogram band + verified tick + tier chip + 3-stat strip
  (followers w/ SELF/VER chip, engagement, on-time) + job/price row + orange
  Add-to-brief; SOLD_OUT dims → Join waitlist.
- **Inventory detail:** HeroBand (EXCLUSIVE chip, est-views EST chip, implied
  CPM §15, orange price) + includes grid + kept artwork placeholder +
  orange "Managed by BTG" rail (Request this inventory / Talk to BTG).

### Verification
- `tsc --noEmit` clean · `next build` green (all 21 routes) · `eslint` clean on
  all touched files (fixed one `react-hooks/immutability` error in Donut by
  precomputing arc offsets).
- Acceptance greps: no athlete-`rates` import and no `AthleteRate` data usage
  in sponsor pages (prose footnotes only); 28 provenance-chip usages across
  the 4 pages.
- Prod smoke test (`next start -p 3311`): all 4 pages 200 with expected
  content markers (gradient hero, Data trust, break-even, gauge, Add to brief,
  Managed by BTG).

### Notes for the team
- Sponsor pages now read fixtures whose every stat has a named retrieval path —
  keep that rule for any new stat (see spec §3 table).
- A2 (loading/empty/error states, light theme) still pending and now also
  covers the new components; `LineChart` → `AreaChart` migration for
  admin/property pages is optional later work.
- Git note: pre-existing uncommitted A0/A1 working-tree changes in
  `globals.css` and `fixtures.ts` were committed together with this feature's
  edits to those files (same feature area); remaining A0/A1 files (admin/
  athlete/property/public pages etc.) are still uncommitted — commit when
  ready.
