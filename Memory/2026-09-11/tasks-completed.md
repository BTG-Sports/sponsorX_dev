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

## Task 2 — Sticky portal navigation

**Trigger:** user reported the portal navigation scrolls out of view.

- `src/components/portal-shell.tsx`: sidebar is now `sticky top-0 h-screen
  overflow-y-auto`; top bar is now `sticky top-0 z-20` with `bg-surface/85
  backdrop-blur` (matches the public `site-chrome.tsx` header treatment).
- Public site header was already sticky — no change there.

## Task 3 — Top-bar user dropdown with logout

**Trigger:** user asked for a dropdown (with a logout button) when clicking the
name/avatar in the portal top bar.

- New `src/components/user-menu.tsx` (client): name + role + avatar + chevron
  becomes a menu button; dropdown closes on outside click / Escape; on `sm↓`
  the name/role (hidden in the bar) shows as a dropdown header instead.
- Logout routes to `/login` — mock auth has no session to clear; swap for
  Clerk `signOut()` in guide §04.
- `portal-shell.tsx` now renders `<UserMenu>` in place of the static
  name/avatar block; applies to all four portals.
- `tsc --noEmit` and `eslint` clean on touched files.
- Follow-up: added `.sx-pop` utility in globals.css (160ms fade + slight
  scale/drop, `transform-origin: top right`, reduced-motion opt-out) and
  applied it to the dropdown panel — reuse for future popovers.

## Task 4 — Mobile portal navigation (drawer)

**Trigger:** user noticed portals have no navigation below `md` (sidebar is
`hidden md:flex`).

- New `src/components/mobile-nav.tsx` (client): hamburger in the top bar
  (`md:hidden`). First shipped as a left drawer, then redesigned on user
  request into a **full-screen takeover menu**:
  - clip-path circle reveal from the hamburger corner (`.sx-menu-in`, 550ms
    ease-out-quint) with a matching `.sx-menu-out` exit — a `closing` phase
    unmounts on `animationend`; reduced-motion shortens these to **1ms rather
    than `none`** so the unmount event still fires (gotcha worth remembering);
  - oversized staggered links (2xl type, mono `01…` indices, inline
    `animationDelay` stagger), accent underline scale-in on hover, active item
    in portal accent + dot, `pending` items inert with a SOON chip;
  - atmosphere: portal-name watermark (30vw, text/4%), accent + primary glow
    blobs, portal label rule line; footer = route map + wordmark.
  - Tailwind gotcha hit: never build class names at runtime
    (`"group-hover:" + accentText` doesn't compile) — accent classes must
    arrive as complete static strings via props.
- Closes on Escape, ✕, or tapping any nav link (click handler on the panel —
  lint forbids `setState` in a pathname effect). Locks body scroll while open.
- `portal-shell.tsx`: header renders `<MobileNav>` before the welcome block;
  header padding tightened to `px-4 sm:px-6`.
- Overlay is **portaled to `document.body`** — the sticky header's
  `backdrop-filter` makes it the containing block for `fixed` descendants,
  which trapped the first version inside the header box (gotcha).
- Menu never scrolls: `overflow-hidden` + `vh`-based `clamp()` on link font
  size (`clamp(1.05rem,3.6vh,1.5rem)`), link padding, and header/label/nav/
  footer paddings, so all nine items scale to fit any viewport height.
- `tsc --noEmit` and `eslint` clean.

## Task 5 — Insight strip: autoplay infinite carousel on phones

**Trigger:** user asked for the hero insight strip to autoplay and wrap
infinitely (next/prev at either end) on mobile only.

- New `src/components/insight-carousel.tsx` (client): native scroll-snap does
  the swiping; JS adds 4s autoplay and the infinite wrap. Track renders
  `[last, ...items, first]` clones — when a scroll settles on a clone
  (120ms debounce), it teleports instantly to the real slide. Dots (active =
  primary pill) + prev/next chevrons; autoplay pauses while a pointer is down,
  when `document.hidden`, and entirely under `prefers-reduced-motion`;
  single-item lists render a static card.
- `hero.tsx` `InsightStrip` now splits: ≥`sm` keeps the server-rendered wrap
  layout (`hidden sm:flex`), phones render the carousel island (`sm:hidden`).
  Server → client `ReactNode` props are fine here.
- `tsc --noEmit` and `eslint` clean.

## Task 6 — Portal chrome redesign (sidebar + top bar wow factor)

**Trigger:** user asked for an award-calibre visual redesign of the side
navigation and top bar, extending the sponsor-redesign language (spec
2026-09-11) to the shared portal chrome — applies to all four portals.

- `portal-shell.tsx` sidebar: widened `w-52 → w-56`; vertical surface→bg
  gradient ground; accent glow bloom top-left; accent gradient hairline down
  the right edge; vertical `[writing-mode:vertical-rl]` portal watermark
  (text/4%); portal label got `animate-ping` accent dot (with
  `motion-reduce:animate-none`), `tracking-[0.2em]`, and a fading rule line;
  logo/label/nav get `sx-animate` staggered entrance; footer route-map link
  gained hover arrow slide + SponsorX micro-mark. Sidebar is now
  `overflow-hidden` with scrolling moved to an inner `min-h-0 flex-1
  overflow-y-auto` wrapper so the atmosphere layers stay fixed.
- `portal-shell.tsx` top bar: flat `border-b` replaced by an accent→line→
  transparent gradient hairline; `backdrop-blur-xl` on `bg-surface/70`;
  "Welcome back" is now an uppercase tracked eyebrow and the org name ends in
  an accent dot (editorial period); bell/help icons became bordered circular
  buttons with hover lift + shadow; divider is a gradient rule.
- `ACCENT` record gained `wash` (`from-{portal}/15`, active-item gradient) and
  `edge` (`from-{portal}/50..60`, hairlines) — complete static class strings
  per the Tailwind no-runtime-classnames gotcha (Task 4).
- `portal-nav.tsx`: items are `rounded-xl` with icon tiles (`size-7` rounded
  box; accent bg when active); active item = left accent rail that scales in
  (`scale-y-0 → 100` transition, works because the rail element persists
  across pathname re-renders), gradient wash bg, trailing accent dot; hover =
  label nudge + icon tile fill; `pending` items show a SOON chip (matches
  mobile nav); staggered `sx-animate` entrance (runs once per portal entry —
  the layout persists across in-portal navigations, so it doesn't replay).
  New required props `accentDot` / `accentWash` (portal-shell is the only
  consumer).
- `user-menu.tsx`: trigger is now a pill (`rounded-full`, border appears on
  hover); avatar got `ring-white/15` inset ring + shadow; dropdown upgraded to
  `rounded-xl bg-surface/95 backdrop-blur-xl shadow-xl`.
- `tsc --noEmit` and `eslint` clean on all touched files. Visual check on the
  running dev server is on the user; no fixtures or data paths touched, so the
  stats-provenance rule is unaffected.
