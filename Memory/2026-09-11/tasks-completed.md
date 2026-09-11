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
