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

## Task 7 — A2: state & polish pass + portal-wide stats wow (roadmap A2, extended)

**Trigger:** roadmap item A2 (`docs/superpowers/plans/2026-09-11-a2-state-polish-portal-wow.md`),
executed as 15 subagent-driven tasks (1–15b) with two-stage reviews per task,
this session's job being Task 16 — the closing verification matrix + memory log.

### Scope
A2 covers state handling (loading/empty/error), a full light theme, and
responsive polish, extended to bring the sponsor-portal's stats-wow visual
language to admin, athlete, property and the public marketing site. Spec:
`docs/superpowers/specs/2026-09-11-a2-state-polish-portal-wow-design.md`.
Plan: `docs/superpowers/plans/2026-09-11-a2-state-polish-portal-wow.md`.

### Key decisions
- **Frost light theme**: `[data-theme=light]` selector, toggle added to portal
  chrome; theme applied pre-paint via an inline script (per the vendored Next
  guide on preventing flash-before-hydration) with a React Strict-Mode
  `useLayoutEffect` reapply, plus `suppressHydrationWarning` on `<html>`
  (`src/app/layout.tsx`) since the pre-paint script sets `data-theme` outside
  React's JSX declaration.
- **Contrast pass**: all light-theme brand/portal tokens were darkened to
  clear WCAG AA 4.5:1 *both* bare-on-white *and* composited on their own
  `/12`–`/15` chip backgrounds — measured and documented directly in
  `globals.css`, because tinting a chip toward its own text hue reduces
  contrast rather than helping it (a lesson re-applied across every chip
  token).
- **`--sx-on-media`**: new theme-invariant token for fixed-dark artwork panels
  (e.g. the `/r/[token]` fan page) that must stay legible regardless of the
  active theme.
- **Branded state system** (`states.tsx`): cascade-safe `ErrorPanel`
  (`role="alert"`), soft-prop skeleton loaders, and `EmptyState` (action
  object + `next/link`), wired to a `?demo=loading|empty|error` query-param
  switcher on 12+ pages (13 counted this run — see verification). Added
  `loading.tsx` / `error.tsx` per route group, plus a branded 404. `error.tsx`
  files use the Next 16.3 stable `retry` prop (not `reset`) per the vendored
  local docs.
- **Differentiated heroes**: admin gets an ops-board hero with `QueueTickers`
  and Network GMV `$1,284,500`; athlete gets a milestone hero at
  `$46,250` career earnings with a `ProgressRing` at an **honest 23%** (the
  plan's originally-specced 68% didn't match the underlying math and was
  corrected); property gets a showcase hero at `2.5M` estimated views aligned
  to the canonical fixture value.
- **Public landing**: the old `HERO_STATS` hard-coded constant was replaced by
  a retrievable `networkStats` fixture plus a `CountUp` client island — closes
  out the `stats-must-be-retrievable` rule for the marketing page.
- **Charts consolidation**: `ChartLegend` and the compact chart variant moved
  into `charts.tsx`; `line-chart.tsx` was deleted (its last admin/property
  consumers migrated to the sponsor-redesign chart set from Task 1); dual
  `aria-label`s restored on the merged components.
- **`HeroBand`** gained a `border` prop after a same-property Tailwind
  class-collision bug (see gotchas).

### Gotchas worth remembering
- Tailwind emits opacity-modifier utilities (`bg-x/10`, `bg-x/20`, …) in
  ascending order regardless of source order, so concatenating two
  same-property class strings (e.g. a base border color + a conditional
  border color) is a cascade lottery, not a merge — hit this 3× across the
  A2 pass: `ErrorPanel` border, skeleton alpha levels, and `HeroBand` border
  (fixed by giving `HeroBand` an explicit `border` prop instead of string
  concatenation).
- CSS animations override static `opacity-*` utilities while the animation is
  active (matters for anything that both animates and sets a resting
  opacity).
- Next dev Strict Mode wipes attributes set on `<html>` before paint, so the
  pre-paint theme script needs the vendored guide's `useLayoutEffect` reapply
  pattern to survive the double-invoke.
- `error.tsx` in this Next version takes `retry`, not `reset` — confirmed
  against the locally vendored docs, not training-data assumptions.
- Code review caught a real crash in `src/lib/back.ts`: the `TARGETS` map was
  missing an entry for athlete-invitations (left uncommitted from earlier
  work), which would have thrown on that page's back-navigation.

### Fixture landmines flagged for A3
- Legacy small-scale rows coexist with the canonical, larger A2 fixtures:
  `earnings` (~$150-class rows) and `invitations` ($495 offers) vs.
  `athleteCareer` ($46,250 total). Pages frame the legacy rows as
  "sample / this cycle" data to avoid contradicting the career number.
- `athleteCareer.openInvites` / `openInviteValueCents` / `nextExpiry` fields
  exist but are deliberately **not** surfaced anywhere yet, because they
  contradict the live `invitations` fixtures — a trap for anyone wiring them
  up in A3 without reconciling the two data sets first.

### Verification (this session, Task 16)

**Build gates — all pass:**
- `npx tsc --noEmit` → clean, no errors.
- `npx eslint src` → 0 errors, 1 pre-existing warning
  (`src/app/t/[code]/route.ts:21` — `'code' is assigned a value but never
  used`, `@typescript-eslint/no-unused-vars`); not introduced by A2, left as-is.
- `npx next build` → compiled successfully, all 21 app routes listed green
  (mix of `○` static / `ƒ` dynamic), no failed routes.

**Acceptance greps — all pass:**
- `(ring|bg|border|from|via|to)-white/` in `src/` → **none found.** (Note:
  Task 6's memory log recorded a `ring-white/15` on the user-menu avatar;
  that has since been resolved to a themeable token — confirmed no raw
  `-white/` opacity utilities remain anywhere in `src/`.)
- `HERO_STATS` in `src/` → **none found** (fully replaced by `networkStats`
  + `CountUp`, per plan).
- `ScreenStub` usage in `src/app` → **none found.** The component file
  `src/components/screen-stub.tsx` still exists on disk but is imported by no
  page — matches the acceptance criterion exactly.
- `demoState` across `src/app/**/page.tsx` → **13 files** (≥ 12 required):
  admin (`page`, `analytics`, `applications`, `approvals`,
  `campaigns/[id]`, `finance`), athlete (`page`, `earnings`, `invitations`),
  `property/page`, sponsor (`page`, `marketplace`,
  `campaigns/[id]/report`).
- `AthleteRate` in `src/app/(public)` and `src/app/(app)/sponsor` → 3 matches,
  **all prose/comments** documenting the rule (`athletes/[slug]/page.tsx:24`,
  `sponsor/marketplace/page.tsx:27` and `:354`) — no data usage. Pass.

**Prod smoke test — `npx next start -p 3311`, all pass:**
- `/` → HTTP 200, contains "Live network counts".
- `/admin` → HTTP 200, contains "Operations board" and "Network GMV".
- `/athlete` → HTTP 200, contains "earned".
- `/property` → HTTP 200, contains "implied media value".
- `/sponsor` → HTTP 200, contains "Data trust".
- `/r/demo-token` → HTTP 200, contains "SCAN" and "REDEEM". Verified the
  page's own source (`src/app/r/[token]/page.tsx`) has zero imports and no
  `"use client"` — confirmed hand-rolled, JS-optional markup as documented.
  The rendered HTML does include one route-specific `<script src>` beyond the
  shared framework/webpack chunks (diffed against `/` and `/login`'s script
  sets to isolate it); its contents were fetched and inspected directly and
  are Next's own bundled `next/link` module, pulled in by the framework's
  implicit not-found/error boundary wiring (every route in this build gets
  its own small per-route chunk this way — `/` and `/login` each have one
  too, with different hashes). This is Next/Turbopack per-route chunking
  overhead, not an authored client component on this page. Reported honestly
  per the instruction rather than waived silently.
- `/admin?demo=empty` → HTTP 200, contains "No campaigns yet".
- `/nonexistent-xyz` → HTTP 404, contains "This page doesn't exist".
- Light theme: `npx next build`'s CSS output
  (`.next/static/chunks/3trwdzm3l-xk6.css`) contains `[data-theme=light]`
  rules (confirmed non-empty, with real property values) — this is as far as
  a curl-only smoke test can verify; actual visual light-theme QA in a
  browser (toggle behavior, contrast in practice) remains a human step.
- One incidental fix during setup: `next start` printed a warning that it
  "does not work with output: standalone" and recommends
  `node .next/standalone/server.js`; it served all routes correctly anyway
  for this smoke test, but worth switching the verification command to the
  standalone server in a future pass for full production fidelity.

### Note
Remaining A0/A1 working-tree leftovers flagged in Task 1's memory entry were
committed during the A2 slice commits (same repo precedent as Task 1). The
tree should now be clean of feature work aside from this memory-log commit.

## Task 8 — Memory synchronization (restored Claude persistent memory + drift audit)

**Trigger:** user asked to "synchronize with backed up memories".

- **Finding: Claude's persistent memory store for this project was empty.** The
  per-project memory directory
  (`~/.claude/projects/-Users-bob-Documents-work-iCarr-sponsorX-sponsorX-dev/memory/`)
  contained no files, so every persistent memory referenced in earlier logs
  (`memory-backup-workflow`, `stats-must-be-retrievable`, the graphify rule, the
  project/stack/working-mode notes and the `MEMORY.md` index) had been lost —
  most likely because the machine changed (earlier logs record Windows 11 +
  PowerShell; this session is macOS + zsh, under a different user email).
  The in-repo `Memory/` folder was the only surviving copy, which is exactly
  what the backup rule was created to protect against.
- **Restored four persistent memories** from the repo backup, the first three
  pinned so they load in every future session:
  `memory-backup-workflow` (read `Memory/` at session start, log each task to
  `Memory/YYYY-MM-DD/`), `always-use-graphify` (treat codebase questions as
  graphify queries first), `stats-must-be-retrievable` (every displayed number
  needs a real retrieval path; curated constants labelled `EST · curated`; no
  demographics / sentiment / real-time in Phase 1), and
  `sponsorx-build-sequence-and-ui-constraints` (UI scaffold before backend, zero
  new deps until B0, server components by default, mockups are reference only,
  logo-derived portal accents).

### Drift found between the backup and the live repo (reported, not silently fixed)

| Where | Says | Reality |
|---|---|---|
| `CLAUDE.md` "Status" line | "greenfield — no application code yet. No build/test commands exist." | 25 routes build green; A0, A1 and A2 have shipped |
| `Initial Memory/02-confirmed-tech-stack.md` | Express / Prisma / Redis / MinIO | `CLAUDE.md` + `.claude/stack-decision.md` moved to Next.js route handlers / Railway / R2 / Postgres queue / Clerk — already flagged in `04`, still awaiting team reconciliation, so left untouched |
| `Initial Memory/03-rules-and-workflow.md` "Global user context" | Windows 11 + PowerShell; email `creativebrainstudiosinc@gmail.com`; "no coding yet, documentation phase" | macOS + zsh; different account; the project has been shipping code since 2026-09-10 |
| `Initial Memory/00-README.md` + `01-project-overview.md` | baseline describes a pre-code planning phase | superseded by Tasks 9–11 (2026-09-10) and Tasks 1–7 (2026-09-11) |

- Also noted: work is on branch **`A0-A2-Roadmap`** (not `main`), working tree
  clean at `a6c7b61`.
- No source files were changed by this task.


## Task 9 — Phase 1 development plan, task board, and drift fix

**Trigger:** user asked for a development flow with categorised, distributable tasks
built on `.claude/stack-decision.md` and Blueprint v2.0; then for it as a spreadsheet
in Google Drive; then for execution ordering, statuses and plain-English detail.

### What was produced
- **184 tasks** across **9 phases** (0 Foundation & Decisions → 8 Integration,
  Hardening & Launch), in **dependency order**, across **10 categories**: BE 47 ·
  FE 31 · PMO 20 · OPS 17 · QA 14 · INT 14 · SEC 13 · ART 12 · DATA 10 · LEG 6.
  Unassigned by design — the user assigns.
- Each task carries: Order, DETAILS (plain English, no codes to look up), Status,
  Weight (S=1/M=3/L=5 person-days), Unblocks, Depends On, acceptance criteria, refs.
- **Status seeded from the dependency graph:** 28 Ready · 150 Blocked · 6 Done.
- **Seven decision gates** (`G-01`…`G-07`) extracted and folded into the DETAILS of
  the tasks that own them, plus the §37 blueprint gates.

### Key findings surfaced
- **`P0-PMO-02` (data residency) unblocks 118 of 184 tasks** — a one-page decision is
  the highest-leverage item in the project. Then `P0-OPS-01` (115), `P2-OPS-01` (114),
  `P0-PMO-07` RBAC matrix (106), `P2-BE-02` Prisma schema (104).
- **Longest dependency chain is 18 tasks / 60 days**, running data residency → Railway
  → schema → Clerk → scope.ts → sponsor/brief/matching/invite → Campaign Order →
  deliverables → metrics → ROI report → final E2E. That chain is the schedule.
- **442 person-days total ≈ 44 weeks at 2 people.** Blueprint §31 budgets 14–18 weeks
  at 4.5–7.5 FTE. Scope, not stack, is the binding constraint — recorded in the plan.
- **LEG is only 6 tasks but is on the critical path for Phase 5**: counsel has the
  longest external lead time and `G-05` hard-blocks `P5-BE-01` (Campaign Order
  acceptance). Building acceptance on unapproved text = an audit trail for an
  unenforceable agreement. Commission templates on day one.

### Defects caught during the build
- Phase 6's entry gate cited `G-04` (email provider) when it meant the fan-funnel
  privacy review (`P0-LEG-04`). Fixed.
- Three Phase 8 tasks (`P8-QA-01`, `P8-SEC-01`, `P8-PMO-05`) list "all phases" as
  their dependency — unparseable as task IDs, so they were seeded **Ready** when they
  are obviously blocked. Now treated as blocking. Ready count 31 → 28.

### Drift fix (this is the important part)
Three copies of the same 184 tasks had accumulated (Markdown plan, two `.xlsx`,
a Google Sheet). Resolved to **two artefacts with distinct jobs**:

| Artefact | Owns |
|---|---|
| `documentation/SponsorX-Phase1-Development-Plan.md` | The **plan** — task definitions, details, acceptance criteria, dependencies, gates, risks. Changed by pull request. |
| Google Sheet *SponsorX — Phase 1 Task Board* (Drive) | The **status** — Status, Owner, Weight, Date Started/Done, Notes. Edited in the browser from any workstation. |

- Rewrote the Markdown as the single in-repo source: 184 task blocks with Order,
  DETAILS, status badges, Start Here list, critical path, gates, risks (98KB).
- **Deleted both `.xlsx` from the repo**; added `documentation/*.xlsx` to
  `.gitignore` so one cannot be re-committed.
- Deleted the superseded `SponsorX-Phase1-Development-Plan.docx`.
- Trashed two earlier Google Sheets; the live board is
  *SponsorX — Phase 1 Task Board*.

### Standing rule added (Memory `03` + `CLAUDE.md`)
> After completing any task or fix, update the task board spreadsheet in Google Drive
> before closing your branch — set `Status`, `Date Done`, `Owner`. Marking a task Done
> is what flips its dependents from Blocked to Ready. Put the task ID in the branch
> name and commit message.

### Open / not done
- Nothing committed to git — all changes are working-tree only on branch
  `A0-A2-Roadmap`.
- Auto-sync from code activity (a merged PR marking a task Done via GitHub Action)
  was discussed and **deferred** — judged not worth the setup for a two-person team.
  Revisit when the team grows. Repo has a GitHub remote but no `.github/workflows`.
- A formula column that recomputes Ready/Blocked inside the Sheet was offered and
  not yet added.


## Task 10 — Full programme task board: all four blueprint phases

**Trigger:** user pointed out the board covered only blueprint Phase 1 and asked for every
phase, each on its own sheet.

### Root cause of the confusion (mine)
Two different meanings of "phase" were colliding. The blueprint has **product phases 1–4**
(managed marketplace → transactional marketplace → intelligence → INFINEX). I had also
numbered the *delivery stages inside Phase 1* as "phases 0–8". Renamed the column to
**Stage** throughout.

### Read and broken down
`documentation/Master/BTG_SponsorX_Phases_2_4_Detailed_Developer_Specifications.docx` —
a genuine handoff spec, not a summary: feature modules, screens, API domains, database
tables, integrations, sprint plans, acceptance criteria and staffing per phase.

| Phase | Tasks | Person-days | Timeline | Budget |
|---|---|---|---|---|
| 1 · Managed marketplace | 184 | 442 | 14–18 wks | $75–105K |
| 2 · Marketplace & commerce | 64 | 260 | 16–20 wks | $80–120K |
| 3 · Intelligence & attribution | 44 | 184 | 18–22 wks | $105–160K |
| 4 · INFINEX integration | 51 | 207 | 18–22 wks | $90–150K |
| **Total** | **343** | **1,093** | **66–82 wks** | **$350–535K** |

ID scheme: Phase 1 keeps `P{stage}-{CAT}-{nn}`; Phases 2–4 use `{phase}S{sprint}-{CAT}-{nn}`
(e.g. `2S5-BE-04` = Phase 2, Sprint 5, Backend, task 04), following the blueprint's own sprint plans.

### Key findings carried into the tasks
- **Phase 2's real risk is the ledger, not the marketplace.** `2S0-PMO-02` designs it before
  any code: order revenue becomes ledger entries at contract time and is never recalculated
  at payout. Get it wrong and editing a rate card silently changes historical payouts.
- **Three shortcuts the spec explicitly forbids** (now on the Roadmap sheet): no ML pricing
  before clean history exists; no marketplace payouts before refunds/disputes/audit are
  tested; no virtual impressions reported to sponsors before viewability and de-duplication
  are validated against pilot telemetry.
- **Phase 3 is a language problem first.** `3S0-PMO-01` fixes what "attribution" may claim —
  verified redemption, verified transaction, modelled attribution and estimated media value
  are four different things and must never blend in a sponsor report.

### Deliverables
- **`documentation/SponsorX-Full-Programme-Task-Board.xlsx`** — 7 sheets: Roadmap, Dashboard
  (live COUNTIF across all phases), Phase 1–4, Legend. Verified: zip integrity OK, 0 formula
  errors, 343 unique IDs, dashboard reconciles.
- **Four Markdown plan files replacing the single combined document** (deleted
  `SponsorX-Phase1-Development-Plan.md`): `SponsorX-Phase{1..4}-*.md`.

### Workflow changed — three artefacts, not two
| Artefact | Owns | Cadence |
|---|---|---|
| The four `.md` files | The plan | Changed by pull request only |
| The consolidated `.xlsx` | Working tracker | Continuously, during the day |
| Google Sheet | Published status | Once a day, end of day |

Standing rule updated in `CLAUDE.md` and `Memory/Initial Memory/03`: tag **In progress** in
the xlsx during the day; **at end of day update the Google Sheet to match**, whatever the state.

### Incident — corrupted upload
The Drive connector accepts file content only as inline text, so a binary `.xlsx` has to be
hand-transcribed as base64. The provisioning workbook (≈15,000 base64 characters) arrived
corrupted and would not open. **Do not upload binaries that way.** Deliver `.xlsx` as bytes
via `device_commit_files` / file delivery and have the user drag it into Drive, or use CSV
when a single flat sheet is acceptable. Replaced with *SponsorX Provisioning Sequence v2*
(CSV → native Sheet, opens reliably); the corrupt copy was trashed.

### Also this session
- **Data residency closed: US East.** `us-east4-eqdc4a` (Virginia) + R2 hint `ENAM`, decided
  from the prelaunch materials' DMV / Baltimore focus, not the org's PST timezone setting
  (which is itself wrong and should be corrected in Zoho — it skews every CRM timestamp by
  three hours). Recorded in `.claude/stack-decision.md`; `P0-PMO-02` marked Done.
- **Zoho org inspected:** iCARRe Foundation, Zoho One Enterprise, 7 licences, **paid_expiry
  2026-09-18**. Completely stock — zero custom modules. Five of §18's six objects already
  exist (Accounts, Contacts, Leads, Deals, Tasks) plus a native Campaigns module; only an
  **Athlete / Content Partner custom module** is missing. Admin is rcarr@icarrefound.org.
- **Vendor costs verified against live pricing:** $0 through Phase 1 → ~$5/mo from Phase 2 →
  ~$25–45/mo at production. Clerk gates **MFA behind Pro ($20/mo)** and §26 makes MFA a hard
  production requirement — budget it as part of going live, not as an optional upgrade.

---

## Task 3 — `P0-PMO-08` · Zoho module + field mapping document (§38 deliverable)

**Trigger:** user asked to do `P0-PMO-08`, referring to the Phase 1 task file.
Mid-task the user interrupted with **"give me the plan first before doing
anything"** — plan was presented and approved before the document was written.
(Also recorded in Claude persistent memory as `plan-before-executing`.)

**Shipped:** `documentation/SponsorX-Zoho-Field-Mapping.md` (v0.1, 13 sections,
~718 lines). All nine §18 objects mapped field-by-field with direction and
system-of-record per field, plus the custom-module build spec `P0-OPS-05` needs.

### Sources
- §18 and §38 extracted from the local blueprint
  (`documentation/Master/Updated_BTG_SponsorX_Master_Development_Blueprint_Integrated_Athlete_Network.docx`)
  — the Drive connector was not needed, the file is in the repo.
- V2 Prisma models from `documentation/SponsorX-Implementation-Guide-V2.md` (§03, §07).
- **The live Zoho org** (`iCARRe Foundation`, zgid 749122837) read via the CRM
  metadata API for `Accounts`, `Contacts`, `Leads`, `Deals`, `Tasks`, `Campaigns`.

### User decisions this task
- **O-1 (invoice/payment reference: Zoho Books vs CRM `Invoices` module) — left
  OPEN** at the user's instruction. `P7-BE-04` must not start until it closes.
- **O-3 athlete data — conservative set**, expandable later. Eleven fields, no
  `legalName`, no `birthDate`, no `city`/`school`/`gradYear`, no guardian data,
  no socials/rates/scores. Document states the asymmetry: adding a Zoho field
  later is a click, un-syncing PII already in the CRM is not.
- Document name confirmed as `SponsorX-Zoho-Field-Mapping.md`.

### Key findings / decisions recorded in the document
- **No external-ID field exists on any Zoho module** — §18's "use external IDs
  to prevent duplicates" is currently unimplementable. Raised as gap **G-1**:
  `SponsorX_ID` (unique + external) must be added to Accounts, Contacts, Leads,
  Deals, Tasks. **No task owns this work** — fold into `P0-OPS-05` or raise `P0-OPS-06`.
- **Campaign maps to `Deals`, not the CRM `Campaigns` module (O-2).** The stock
  module is an email-marketing object (Type = Conference/Webinar/Email…, Status =
  Planning/Active/Inactive/Complete) carrying nine Zoho Campaigns + Zoho Survey
  extension fields. Brief and campaign are two stages of **one** Deal; renewal is
  a second Deal. Keys: `brief:<id>` / `campaign:<id>` / `renewal:<id>`.
- **Two deliberate split SoRs:** `Deals.Amount` is Zoho's while negotiating and
  SponsorX's from `CAMPAIGN_CREATED`; `Deals.Stage` is Zoho's except SponsorX
  asserts `Closed Won` (campaign contracted) and `Closed Lost` (cancelled).
- **Nine schema gaps (S-1…S-9) — the handoff to `P3-BE-01`:** `SponsorContact`
  and `Inquiry` and `SyncTask` models are missing entirely; `CampaignBrief.zohoDealId`,
  `User.zohoUserId`, `updatedAt` on every Zoho-touched model (needed for conflict
  detection — `Athlete` has only `createdAt`, `Sponsor` has neither), sync markers
  on `Campaign`/`CampaignBrief`, and `Property.zohoId` is orphaned (§18 maps no
  Property object).
- **Only 3 of 8 `AthleteState` values ever reach Zoho** (Approved/Active/Suspended) —
  an application under review is not a business relationship and must not put an
  unvetted minor into the CRM.
- Environment: org timezone is **PST** (contradicts DMV market — already flagged in
  stack-decision); **production org, no sandbox** (`P0-OPS-04`); licence `paid_expiry`
  reads 2026-09-18.
- Conflicts are logged to `AuditLog` as `sync.conflict`, never resolved silently.

### Verification
- Script-checked **103 Zoho field API names and 26 picklist values** in the document
  against the live org metadata read: **0 missing**. No field name came from
  documentation or memory.
- All nine §18 objects present in the register; eight fully mapped, object 8
  provisional pending O-1 and flagged as such.
- **No writes to Zoho** — read-only metadata calls. Creating the custom module stays
  `P0-OPS-05`; the external-ID fields are G-1.

### Follow-on in the same session (user asked for a PDF + tracker update)

**PDF.** `documentation/SponsorX-Zoho-Field-Mapping.pdf` — 21 pages, 1.0 MB.
Pipeline (all in the scratchpad venv, nothing installed into the project):
`markdown` → styled print-first HTML matching the house style of
`SponsorX-Plain-English-Explainer.html` → headless Chrome `--print-to-pdf` →
`pypdf`/`reportlab` overlay for the footer rule and `Page n of N`, then
`compress_content_streams` + `compress_identical_objects` (3.7 MB → 1.0 MB) and
PDF metadata (title, subject, author, keywords).
Masthead + metadata card + two-column clickable contents; repeating table
headers (`thead{display:table-header-group}`), `tr{break-inside:avoid}`, blue
pull-quotes for quoted rules and orange callouts for schema gaps / OPEN items.
**Chrome's CSS `position:fixed` footer printed on top of table content on
continuation pages** — fixed by removing it and stamping the footer with
reportlab instead, where placement is exact. Also had to set
`word-break:keep-all` on table code spans (`Last_Synced` was breaking as
`Last_Syn`/`ced`). Verified by rendering pages 1, 7, 12 to PNG via `qlmanage`
and looking at them.

**Task board.** `openpyxl` in the venv, so the xlsx *was* updated (this
supersedes the earlier hand-back note). Backed up first; verified no charts or
images existed, because openpyxl silently drops those on save. Confirmed the
status vocabulary from the sheet's own data validation
(`Ready, In progress, Code review, Blocked, Done`).
- `P0-PMO-08` → **Code review**, Owner `rcfworks`, Date Started 2026-09-11, Notes.
- **Notes only, no status change** (dependency logic belongs to the plan, not to
  a side edit) on `P0-OPS-05` (build spec location + the G-1 scope question),
  `P3-BE-01` (the nine schema items), `P7-BE-04` (blocked on O-1),
  `P0-OPS-04` (production org, no sandbox, licence expiry).
- Post-save diff against the backup: **exactly 8 changed cells**, and all 75
  Dashboard COUNTIF formulas, conditional formatting, freeze panes, autofilters
  and the status dropdown intact. Dashboard counts recalculate when the file is
  next opened.
- **G-1 was deliberately not added as a new task row** — a missing task is a
  change to the *plan*, which `CLAUDE.md` says goes in the Markdown by pull
  request, never invented in the tracker.

### Still outstanding
- **Google Sheet not updated** — the published copy is a Google Sheet and there
  is no Sheets write tool available; the Drive connector cannot edit cells. Must
  be mirrored by hand at end of day per the daily rule.
- **Nothing committed.** `documentation/SponsorX-Zoho-Field-Mapping.{md,pdf}` are
  untracked and *not* gitignored (only `*.xlsx` is). Commit is the user's call.
- `graphify-out/` holds only `cache/` and intermediate JSON — no built graph — so
  discovery used direct file tools. Worth re-running ingestion.

---

## Task 4 — `P0-OPS-06` · The `SponsorX_ID` external-ID field on five stock modules

**Trigger:** user opened the session with "ok, lets do this... `P0-OPS-05`". Gap
**G-1** of the mapping document said that task's sibling work — the external-ID
fields — was unowned, and asked whether to fold it in or raise a new task.

### User decisions this task
- **G-1 scope:** raise **`P0-OPS-06`** rather than fold into `P0-OPS-05`. The
  reasoning offered and accepted: the external IDs block every `P8-INT` sync
  task, whereas the custom module blocks only the athlete push. Folding them
  would have made the sponsor-sync tasks look dependent on athlete-module work.
- **Environment:** user asked "can't you build sandbox first? if not ok build
  in production." It cannot be done — Zoho CRM sandbox creation is UI-only
  (Setup → Developer Space → Sandbox, and it is `P0-OPS-04`'s scope), and more
  decisively the connector's OAuth token is scoped to the production org, so a
  sandbox would be unreachable by API and every field would become manual
  click-work plus a deployment step. Since Zoho clones sandboxes *from*
  production, building in production means a later sandbox inherits the work.
  Proceeded in production on the user's stated fallback.

### What the connector can and cannot do
The claude.ai Zoho CRM connector has **no create-module endpoint** — it exposes
metadata reads, `createFields`, and record operations only. The one
`create_custom_module` tool belongs to Zoho **Books**, a different product, and
must not be used for a CRM module. Consequence: `P0-OPS-05` is genuinely split
— the module shell is human click-work in the CRM admin UI, the ten remaining
fields are API work.

### Live-org state confirmed before writing (read-only)
- 55 modules; **no custom module exists** — the only non-default entries are the
  `DealHistory` field-tracker and four subforms. §2.1 of the mapping doc holds.
- **No `SponsorX_ID` and no external-type field** on `Accounts` (40 fields),
  `Contacts` (54), `Leads` (49), `Deals` (28) or `Tasks` (28).

### Three things Zoho rejected, and what they taught
1. `unique: {case_sensitive: true}` → **only `false` is supported.** Uniqueness
   on a Zoho text field is case-insensitive. Harmless for cuids, but it is the
   reason a mapper must never case-normalise an id before sending it.
2. `unique` **together with** `external` → *"unique cannot be set as true for
   external field"*. An external field is inherently unique. §5.1 had listed
   both as separate "Yes" properties; corrected.
3. Separately, `field_label` caps at **25 characters** and the **api_name is
   derived from the label** and cannot be supplied independently. This changes
   two of §6.2's labels (see below) — a label is really an api_name spec.

### Shipped
- `SponsorX ID` created and **verified by metadata read** on all five modules:
  api_name `SponsorX_ID`, text(50), `external: {show: true, type: "org"}`,
  Administrator `read_write` / Standard `read_only`. Field ids recorded in §5.1
  of the mapping document. Zoho additionally makes external fields
  non-editable in the UI for *every* profile, so §5.1's "staff should see it,
  never edit it" is enforced by the platform rather than by permissions.
- Mapping document to **v0.2**: §5.1 rewritten (unique/external conflict,
  case-insensitivity, built-and-verified table), §6.2 gained a label-constraint
  note and two corrected labels (`Guardian Auth Required`, `Property Name`),
  §6.2 field 5 gained the non-US-athlete rule, **G-1 closed**.
- Task board: `P0-OPS-06` added to Stage 0 of the Phase 1 markdown at
  **Order 24.5** — a fractional order so that no existing row in anyone's xlsx
  or the Google Sheet needs renumbering, while the two related tasks stay
  adjacent in the plan.
- Counts updated: Phase 1 `185 → 186` tasks and `445 → 446` person-days (445
  was verified to be the exact sum of the per-task `Nd` estimates), the Phase 1
  row in all four phase files, and `CLAUDE.md` `344 → 345`. **Note a
  pre-existing off-by-one corrected in passing:** `CLAUDE.md` said Phase 1 had
  184 tasks while the phase file itself said 185 (and 185 is what the stage
  counts sum to), so `CLAUDE.md` went `184 → 186`, not `185 → 186`.

### `Home_State` — a finding worth re-reading before the mapper is written
§6.2 specifies a US-states picklist, but the fixture athlete set already
contains one in **Kigali, RW**. The field is optional so no record fails, but a
picklist value Zoho does not hold is rejected *for the whole record*, so the
mapper must **omit** the field rather than send an unmatched value. The
accepted consequence: an empty `Home_State` means either *unknown* or *not in
the US*. If that distinction ever matters, the fix is a `Country` field, not a
wider picklist.

### Still outstanding on `P0-OPS-05`
- User to create the module shell in the UI: Setup → Customization → Modules
  and Fields → + New Module, singular `Content Partner`, plural
  `Content Partners` (the plural is what derives the module api_name), with
  §6.1's description, **and no fields added**.
- Then, by API: the ten remaining §6.2 fields, `Sport` picklist seeded from the
  five distinct fixture values (Basketball, Football, Soccer, Track & Field,
  Volleyball), `Tier` with all four spec'd values including the as-yet-unused
  `Anchor`, `Network_Status` with exactly `Approved` / `Active` / `Suspended`.
  Then verify every generated api_name against §6.2 and record the module's
  real api_name, which is `P0-OPS-05`'s acceptance criterion.
- **Tracker updated** (see Task 5 for the mechanics). The Google Sheet still
  needs mirroring by hand at end of day per the daily rule.

---

## Task 5 — `P0-OPS-05` · The Athlete / Content Partner custom module in Zoho

**Trigger:** the second half of the session's opening request, unblocked once
`P0-OPS-06` closed gap G-1 and the module shell existed.

### Split of the work, and why
The connector has no create-module endpoint, so the **module shell was human
click-work** in the CRM admin UI and the **ten non-display fields were API
work**. Zoho CRM module creation has no public API at all, so this split is
permanent — it is not a connector configuration problem.

### Decisions taken during the build
- **Organization module, not a team module.** A team module scopes records to a
  Team Space's members, which contradicts §18's trigger (*a business
  relationship requiring CRM visibility*) by hiding the records from the sales
  staff who are the reason to push them. Recorded as a row in §6.1.
- **Teamspace permission: added the `Standard` profile** alongside
  `Administrator`. The dialog defaults to Administrator only, which would have
  made the module invisible to everyone in sales.
- **Zoho's default layout had to be stripped.** A new custom module ships with
  `Email`, `Secondary Email`, `Email Opt Out` and a record-image toggle — the
  record image and athlete email are both things §6.4 explicitly excludes. My
  first instruction to the user said "leave every other box at its default",
  which was wrong for exactly this reason and was corrected before saving.

### Shipped
- Module **`Content_Partners`** exists, API name confirmed by read-back — which
  is the task's actual acceptance criterion.
- All eleven §6.2 fields verified by metadata read: **api_name, label and data
  type match the spec on every one.** Field ids recorded in the new §6.2.1 of
  the mapping document, along with the layout id `4857533000012840008`.
- Field permissions: Administrator `read_write`, Standard `read_only` on all
  ten synced fields, so a CRM user can read the mirror without fighting it.
- `Home_State` seeded with the 50 states plus DC, **two-letter code as the
  stored value** and full state name as the display value, because
  `Athlete.state` holds codes.
- `Sport` seeded from the five distinct fixture values; `Tier` with all four
  spec'd values including the as-yet-unused `Anchor`; `Network_Status` with
  exactly `Approved` / `Active` / `Suspended`.

### Three build facts the mapper must account for
1. **Zoho prepends `-None-` to every picklist.** It is the empty option, not a
   seeded value. The mapper should omit a field rather than send `-None-`.
2. **Mandatory is a layout property, not a field property**, and cannot be set
   through the field-creation API. §6.2's `Req` column is therefore not yet
   enforced in Zoho for `SponsorX_ID`, `Sport` and `Network_Status`. Since
   nothing is hand-created in this module, the mapper is the real protection.
3. **Removing a field from the layout does not delete it from the module.**
   `Email` survived into Unused Fields (with `Unsubscribed_Mode` and
   `Unsubscribed_Time`, which Zoho adds itself). It holds nothing and is on no
   layout, but stays API-writable — a standing invitation to do the thing §6.4
   forbids.

### Open follow-ups, none blocking the sync
- Delete the `Email` field from the module (Unused Fields). No delete-field
  endpoint exists in the connector, so this is click-work.
- Tighten the Standard profile's create/edit/delete on the module under
  Setup → Security Control → Profiles — one-way mirror, so a CRM-side edit is
  silently overwritten by the next push.
- Set the §6.1 module description from the module's settings. Documentation
  only; the builder exposed no description box.

### Verification
`getFields` on `Content_Partners` read back 24 fields; the eleven spec fields
were compared programmatically against §6.2 on api_name, label and data type —
all eleven matched, and no unexpected custom field was present.

### Tracker — xlsx updated

`P0-OPS-05` marked ✅ Done in the Phase 1 markdown, and
**`documentation/SponsorX-Full-Programme-Task-Board.xlsx` was updated directly**
(it is gitignored, so it stays a local working copy and is never committed):

- Row 35 `P0-OPS-05` → `Done`, with `Date Started` / `Date Done` `2026-09-11`,
  `Owner` `rcfworks`, and its Notes rewritten — the scope question it carried is
  now answered.
- New row 36 `P0-OPS-06` inserted at **Order 24.5**, `Done`, with the five Zoho
  field ids in Notes. A fractional order avoids renumbering any existing row.
- Phase 1 subtitle `185 tasks · 445 person-days` → `186 · 446`; Roadmap
  `344 tasks` → `345`.
- **The ranges had to be extended by hand**, because inserting a row does not
  move them: the autofilter `A4:R189→A4:R190`, all three conditional-formatting
  ranges, the Status data-validation list, and **15 Dashboard formulas** whose
  `COUNTIF` / `COUNTA` / `SUMIF` ranges were hardcoded to `$189`. Missing those
  would have left the Dashboard silently undercounting by one row forever.

**Tooling note for next time:** `openpyxl` is not installed in the user's
environment. Rather than installing it globally, build a throwaway virtualenv in
the session scratchpad. A backup of the workbook was taken there before writing.
Verified after saving: 186 task rows, no duplicate ids, all seven sheets, freeze
panes, conditional formatting and data validation intact.

The Google Sheet still needs mirroring by hand at end of day — that one is
genuinely a person's step.

---

## Task 6 — `P0-OPS-04` · Zoho API credentials and sandbox (spec complete, provisioning outstanding)

**Trigger:** user asked for `P0-OPS-04` directly after `P0-OPS-05` closed.

### User decision
- **Zoho CRM credentials only.** Books deferred, because §7.7's Invoice /
  Payment Reference mapping is still **OPEN as O-1** — specifying a Books scope
  list now would mean guessing, and an OAuth client provisioned against a guess
  gets reissued. Recorded in §6 of the new document so it reads as a decision
  rather than an oversight.

### Shape of the task
Both provisioning halves are console click-work with **no public API** — the
Zoho API Console and the Sandbox page alike — so they are the user's steps. The
specification is the part worth doing carefully, and it is now written down
instead of being improvised at the console.

### Shipped — `documentation/SponsorX-Zoho-Credentials-and-Sandbox.md`
- **The OAuth scope list, derived from the object register rather than
  defaulted.** The headline decision: **no `DELETE` scope on any module**, and
  therefore never `ZohoCRM.modules.ALL`. §6.3 of the mapping document suspends
  records and never deletes them, so a token that can delete is a token that can
  only ever be used to violate the mapping. Every granted scope is justified in
  a table against the section that requires it; every withheld scope
  (`users.READ`, `settings.ALL`, `notifications.ALL`, all `ZohoBooks.*`) has a
  stated reason.
- `modules.leads.UPDATE` **is** granted despite §7.3 being one-way, because an
  upsert retry after a timeout resolves to an update on the existing record.
- **Environment contract as a table in the committed document**, not a
  `.env.example` — `.gitignore` excludes `.env*` wholesale, so a sample file
  would be invisible to the team.
- **`ZOHO_ACCOUNTS_DOMAIN` / `ZOHO_API_DOMAIN` are part of the residency
  answer**, not boilerplate: Zoho partitions by data centre, this org is on the
  US DC, and a token issued in one DC is invalid in another.
- Token-handling rules: cache the access token and refresh on expiry rather
  than per request, because Zoho caps refresh-token issuance per client and a
  worker that refreshes per job will lock itself out. Record **who authorised**
  the refresh token — it is bound to that user and dies with their account.
- Both console runbooks written as literal numbered steps, including the
  grant-token → refresh-token `curl`, with the explicit instruction that the
  secrets go from the Zoho console to Railway and **never into a chat, a ticket
  or a commit**. A provisioning log table (names and dates, no secrets) is at §7.

### Two questions deliberately handed back rather than assumed
- **Which sandbox types the edition offers.** A configuration-only sandbox
  cannot rehearse `P8-INT-07`'s backfill against realistic volumes, so the
  answer changes that task's plan. Not readable through the connector.
- **How the worker authenticates against the sandbox**, which is a separate org
  on `sandbox.zohoapis.com`. Flagged as a thing to verify when it exists rather
  than guessed at.

### Reaffirmed by this task
The sandbox will **inherit** `Content_Partners` and the five `SponsorX_ID`
fields, because Zoho clones a sandbox *from* production — which confirms that
building `P0-OPS-05` and `P0-OPS-06` in production first was the right
sequencing rather than a compromise forced by tooling.

### Tracker
Row 34 `P0-OPS-04` → **In progress** in the xlsx, `Owner` `rcfworks`,
`Date Started` `2026-09-11`, Refs and Notes updated to point at the new
document and list exactly what remains. The Phase 1 markdown's `Reference` line
for the task now links it too. Google Sheet still to be mirrored at end of day.

### Also outstanding
The licence `paid_expiry` reads **2026-09-18**, seven days out. Confirm the
renewal before issuing long-lived tokens and provisioning a sandbox across that
boundary.

---

## Task 7 — Tracker hygiene: the Google Drive copies and what can actually be automated

**Trigger:** user asked to "update both trackers", then "fix this" once the
second tracker turned out not to be updatable.

### What was found
- The **xlsx was updated and verified** — `P0-OPS-04` In progress, `P0-OPS-05`
  and `P0-OPS-06` Done, all with Owner and dates.
- The **Google Sheet named in `CLAUDE.md`** (`10PGtZb3…`) is **not reachable**
  from the Drive account the connector is attached to
  (`infinex1@icarrefound.org`) — it returns "Requested entity was not found",
  so it is presumably owned by or shared only with another account.
- **Two stray `.xlsx` uploads** sat in Drive, both owned by `infinex1@`, one in
  a `Tasks` folder and one in My Drive root, uploaded at 09:07 and 10:40 —
  neither a native Sheet, both already stale.

### The constraint that settles it
**The Google Sheet cannot be written by any available tool.** The Drive
connector is metadata-only for content: `update_file` changes a file's title
and parent folder, and `create_file` creates a *new* file rather than a new
revision. Access is not the blocker — even with the Sheet shared, there is no
cell-level write. So the end-of-day mirror is genuinely a person's job, and
that is now recorded rather than rediscovered each session.

### Why no replacement Sheet was created
The tempting fix — upload today's xlsx, let Drive convert it to a native Sheet,
repoint the docs — was rejected. That Sheet ID appears in **ten places across
six files**: `CLAUDE.md`, all four phase documents and
`Memory/Initial Memory/03-rules-and-workflow.md`. It is the established
team-wide link, not a stale one, and a second copy would fragment a link people
already hold. Fragmenting the published tracker to work around a tooling
limitation is a worse outcome than mirroring by hand.

### Shipped
- Both stray Drive uploads **renamed** (not deleted — reversible, and deletion
  was not authorised) to `ARCHIVE 2026-09-11 <time> — task board snapshot (NOT
  the tracker)`, so neither can be mistaken for the live board.
- `CLAUDE.md` gained a blockquote under the daily rule recording both facts: the
  Sheet is mirrored by hand and must not be replaced with a rival copy, and
  xlsx files in Drive are snapshots rather than the tracker.

### Left for the user
- Mirror the three status changes into the Sheet by hand at end of day.
- Decide whether the two `ARCHIVE …` files should be trashed outright — not
  done here because deletion is destructive and was not asked for.
- Optionally share the Sheet with `infinex1@icarrefound.org` so at least
  *reading* it for verification becomes possible. It will still not be writable.


## Task — Knowledge graph full rebuild (/graphify)

**Trigger:** `/graphify` invoked on the repo root after `/clear`.

- Installed `graphifyy[office]` so all 16 previously-skipped `.docx` files
  (Master Blueprints, Systems Architecture, prelaunch binder, agreements,
  school plans) now convert and are in the graph.
- Corpus: 123 files / ~644k words (71 code, 34 docs, 3 PDFs, 15 images).
- Extraction: AST (408 nodes / 985 edges) + 18 parallel semantic subagents.
  Two chunks had to be re-run: chunk 01 hit a session limit mid-write
  (edges were `'_'` placeholders) and chunk 02 was stale from another
  machine root — both rebuilt cleanly.
- Final graph: **682 nodes, 1,277 edges, 56 labeled communities**.
  Health check: 43 dangling-endpoint edges (semantic refs to missing IDs),
  13 collapsed duplicate edges — noted, non-fatal.
- Outputs refreshed in `graphify-out/`: `graph.json`, `graph.html`,
  `GRAPH_REPORT.md`, `manifest.json`, `cost.json` (~659k in / 22.5k out
  tokens this run). Benchmark: ~9x token reduction per query.
- Note: the installed graphify skill file is v0.9.39 vs package 0.9.57 —
  `graphify install --platform claude` will refresh it.

## Task — `P1-FE-04` · Edge-state fixtures (Stage 1, Roadmap A3)

**Trigger:** first task picked off the new Phase 1 board after pulling the
lead's four phase/tracker commits. Branch **`P1-FE-QA-PMO`** (from
`A0-A2-Roadmap`). Spec:
`docs/superpowers/specs/2026-09-11-p1-fe-04-edge-state-fixtures-design.md`;
plan: `docs/superpowers/plans/2026-09-11-p1-fe-04-edge-state-fixtures.md`.

### User decisions
- Minor w/ unverified guardian = admin applicant row **plus** a `?demo=minor`
  athlete-portal variant (option B; no second persona).
- Declined order = **both** an order-level roster entry and an athlete-side
  terminal order state (option C).
- Under-delivery = one canonical campaign, **c3 "Community Campaign"**,
  consistent across every surface (option B; no ROI-report re-plumbing).

### Shipped (6 commits on `P1-FE-QA-PMO`, append-only fixtures)
- **Rejected application:** `app_5` Devon Price (REJECTED, category-conflict
  flag, score 38). **Minor applicant:** `app_6` Tyler Nguyen (`isMinor`,
  `guardianVerified: false`) — exercises the §4-disabled Approve button the
  admin page already had.
- **`?demo=minor`:** `DemoState` gained `"minor"` (athlete-portal-only);
  `athleteMinor` overlay fixture (guardian Immaculée Kwizera, unverified).
  Dashboard: guardian `BlockedNotice` strip, gated "Upload proof", guardian
  side-rail card now reachable. Invitations page: guardian notice.
  Orders page: previously-dead guardian rail now lights up.
- **Declined/expired order:** `invitations` rows gained
  `declineReason: string | null` (schema extension — only `inv_5` carries a
  value); `athlete/orders/[id]` renders a terminal "Order status" panel for
  DECLINED / EXPIRED / ACCEPTED (reason shown, no accept card, back-link)
  instead of the always-on accept rail.
- **Held earning:** `earnings` gained a HELD bucket ($120, count 1) = new
  `earningItems` row `ern_7` (Shammah, Skills Lab Series) so athlete earnings
  and admin finance can never disagree; `heldNote` explains why. Campaign is
  deliberately NOT "Spring Open House" — Shammah declined that one (`inv_5`).
- **Under-delivering c3:** new keyed `campaignDetailX` (c1 reuses existing
  exports; c3 gets own campaign object, series, top content, roster, notice);
  `admin/campaigns/[id]` now resolves by id (unknown ids fall back to c1).
  The DECLINED roster entry (Amara, "Replacement needed") lives on c3 —
  part of why it under-delivers. **Arithmetic invariant:** roster
  delivered/planned 8+3+0 / 8+8+6 = 11/22 = `sponsorCampaigns` c3;
  roster views 57,000+39,200 = 96,200 = `sponsorCampaignsX.c3.views`;
  per-athlete top-content sums ≤ roster views.

### Verification
- `tsc --noEmit` clean · `eslint src` 0 errors (1 pre-existing warning) ·
  `next build` green, all routes.
- Prod smoke (`next start -p 3311`): **11-URL marker matrix, all PASS**,
  including two negative checks (default `/athlete` has no guardian notice;
  c1 has no under-delivery notice). Demo URLs: `/admin/applications`,
  `/athlete?demo=minor`, `/athlete/invitations(?demo=minor)`,
  `/athlete/orders/inv_5|inv_6|inv_1?demo=minor`, `/athlete/earnings`,
  `/admin/campaigns/c3`.
- All six acceptance cases representable **and** rendered — the task's Done
  condition.

### Notes for the team
- The dev server on :3000 (user's) was reused for render checks; the plan's
  own :3399 server refused to start beside it — fine, hot reload covered it.
- `athleteCareer.openInvites` / `nextExpiry` remain deliberately unwired
  (the standing A3 landmine).
- Tracker: `P1-FE-04` → **Code review** in the xlsx. Google Sheet mirror at
  end of day is the human step, per the daily rule.
