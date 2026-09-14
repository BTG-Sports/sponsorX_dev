# Tasks Completed — 2026-09-12

## Stage 1 close-out batch: `P1-QA-01` · `P1-QA-03` · `P1-QA-02` · `P1-PMO-01`

**Trigger:** user asked to run the whole remaining Stage 1 queue in the order
proposed after `P1-FE-04`/`P1-FE-05`, explicitly setting aside the
Blocked-status formality (the P1-FE-04 dependency is complete on
`P1-FE-QA-PMO`, pending rcfworks review). All four audit records live in
`docs/superpowers/audits/`; all four rows are **Code review** in the xlsx.

### `P1-QA-01` — §39 loop walk (commit `b07267d`)
- **11/11 steps representable and rendered**, pass/fail table in the record.
- Three gaps found and fixed, all one class: athlete-side unwired CTAs with no
  explanation (2× Decline, 1× Upload proof) — admin surfaces were already
  meticulously annotated. Observation (not filed): sponsors have no
  brief-status surface — treated as by-design for the §13 managed model.

### `P1-QA-03` — responsive audit (commit `2154c35`)
- Measured via CDP (`scrollWidth` at 360×800 mobile emulation), culprits
  isolated by hide-and-remeasure. **Trap for next time:** Chrome mobile
  emulation *expands* the viewport around overflowing content, so
  `scrollWidth <= innerWidth` hides failures — compare against literal 360.
- **4 fixes, one root cause:** grids whose `grid-cols-[minmax(0,1fr)_rail]`
  only exists at a breakpoint leave the implicit mobile column free to adopt
  min-content; `overflow-x-auto` does NOT stop that propagation during
  intrinsic sizing. Fix = `min-w-0` on the grid's direct children
  (`/athletes/[slug]` 415→360, ROI report 395→360, marketplace 380→360,
  `/admin/campaigns/new` 624→360).
- After: **29/29 routes measure exactly 360**; drawer nav verified on all four
  portals (links visible when opened).

### `P1-QA-02` — accessibility audit (commit `76df208`, 26 files)
- **Token fixes:** dark `--sx-text-faint` #5d6375→#7e88a0 (3.05→5.14 on
  surface); light `--sx-text-faint` #8aa5c4→#52708f (2.54→5.16); light
  `--sx-accent-soft` #f97a1f→#9c4507 (2.68 as text). New themed
  **`--sx-cta-ink`** (dark: near-black ink 6.64 on primary, light: white
  5.67) — ~27 `text-white` CTA sites swept to `text-cta-ink`, plus chart
  funnel bars, Monogram gradients, fan-page step dot.
- After: **10 pages × 2 themes, 0 AA failures** (~850 text nodes/theme);
  gradient contexts verified by composite math (bands ≥12:1, gradient
  headlines large-text 6.19/8.18).
- **Two measurement traps documented:** (1) setting `data-theme` mid-page in
  an evaluation yields phantom 1.01 ratios — apply the theme pre-load via
  localStorage like the app does; (2) naive dollar-greps and naive contrast
  walks both trip over gradients — composite or exclude, never guess.
- Keyboard: real Tab → `:focus-visible` UA ring + Button ring classes; 0
  positive tabindex; Escape closes drawer/menu. No-JS `/r/[token]`: full copy,
  steps and token render with scripting disabled.

### `P1-PMO-01` — §38 design record (commit `f174249`)
- `documentation/SponsorX-Design-Record.md` + `documentation/design-record/`
  (12 PNGs at 1440px, dark theme): every §9 core screen as built, with route,
  refs, data provenance, states, deliberate blocks, and the supplementary
  surfaces table. Regeneration instructions included.
- **Wireframes added on user request** (commit `53c2c53`):
  `design-record/SponsorX-Wireframes.html` — self-contained, printable
  schematics of all 12 screens; solid buttons = live affordances, dashed =
  deliberately unwired. Linked from the design record.

### Formal QA report (user request, post-batch)
- `documentation/SponsorX-Stage1-QA-Report.md` — Senior-QA-style verification
  report for P1-QA-01/02/03: 23 automated test cases re-executed as one
  consolidated run against the final build (**23/23 PASS**), defect log
  D-01..D-11 (all fixed on-branch), traceability matrix, sign-off block for
  rcfworks, and §6 harness-anomaly table (5 false failures diagnosed during
  the run — marker casing, viewport-expanding emulation, drawer exit-animation
  race, mid-page theme flips, RSC `$40` tokens). Regression instructions
  included; the three tracker rows reference the report.
- **Word checklist added on user request** (commit `b4be1a3`):
  `documentation/SponsorX-Stage1-QA-Checklist.docx` — landscape checklist with
  ☑ per executed case (23), steps/expected/status/evidence columns, defect
  log, harness-anomaly table, and a signature sign-off row for rcfworks.
  Generated with python-docx in the scratchpad venv (now holds openpyxl +
  python-docx).

### Tracker / handoff
- xlsx: `P1-FE-04`, `P1-FE-05`, `P1-QA-01/02/03`, `P1-PMO-01` all **Code
  review**, Owner HeckerCreatives. **Stage 1 is fully built and audited** —
  rcfworks review is the only gate left; then flip to Done and mirror the
  Google Sheet (human step).
- An untracked `SponsorX-Full-Programme-Task-Board.xlsx` copy appeared at the
  **repo root** (not created by this session) — flagged to the user; local
  copies stay out of git per the tracker rules.
- Next code work when review lands: Stage 2 stays blocked on `P0-OPS-01`
  (Railway) + `P0-PMO-07` (RBAC matrix); Ready fillers: `P0-PMO-11` (pin
  deps), RBAC matrix drafting.

## `P1-FE-06` — chart entrance + idle motion, all dashboards (newly raised)

**Trigger:** user asked for wow-factor / awwwards-style animation on every
graph, for first showing and for idle. New row `P1-FE-06` (Order 33.5, Code
review, Owner HeckerCreatives) inserted in the tracker; Dashboard formulas,
autofilter, conditional formatting, status validation and the "186 tasks"
banner all extended to row 190.

- **Design:** charts stay server components. One new ~0.5 kB client component
  `src/components/reveal.tsx` (IntersectionObserver, same idiom as
  count-up.tsx — writes `el.dataset` directly, never setState-in-effect) flips
  `data-reveal` `out → in` on first viewport entry. All motion is CSS in
  globals.css (`sx-viz-*` block): the SVG/HTML attributes still describe the
  *finished* chart, animations are overlays that settle onto it, so
  reduced-motion (`animation: none`) and no-JS renders are automatically
  correct. A `@media (scripting: enabled)` gate pauses the choreography at
  frame 0 from first paint until reveal — no flash, and below-fold charts
  save their entrance until seen. Per-element stagger rides on a `--sx-d`
  custom property so one class serves every row/segment.
- **Entrances:** lines draw on via `pathLength={1}` + dashoffset (Sparkline,
  AreaChart main + dual series); area fill wipes left→right behind the
  drawing line (`clip-path: inset`); gauges sweep from empty
  (`--sx-sweep` = hidden dashoffset, RadialGauge + ProgressRing); donut
  segments sweep open in sequence (`--sx-seg`/`--sx-c` dasharray keyframe);
  funnel/HBar/TrustMeter bars wipe or scaleX with stagger; grid, ticks,
  labels, legends fade/rise; endpoint dots pop with overshoot bezier.
- **Idle loops (recessive by design — never move data marks):** radar pulse
  on the latest data point (AreaChart halo), glint sweep across bar tracks
  every ~6 s (HBarList, funnel bars, TrustMeter), slow breathe on gauge
  rings. Projection stays a fade (draw-on would fight its own dasharray).
- **Verified** against the running dev server (port 3000 was already serving
  the working tree): SSR markup on all 8 chart-bearing pages carries
  `data-reveal="out"` + sx-viz classes + inline vars; compiled CSS ships all
  11 keyframes + the pause gate; `npm run build` and lint clean. Grep
  counts double-count class names (DOM + RSC flight payload) —
  `data-reveal="out"`/`pathLength="1"` are DOM-only, divide the rest by 2.
- **Findings:** the **property dashboard has zero charts** (imports only the
  `compact` formatter) — nothing to animate there; flag if a property graph
  is ever specced. CLAUDE.md still says "greenfield — no application code
  yet" — stale. The live tracker is `Claude outputs/…Task-Board.xlsx`
  (has the Code-review statuses); the repo-root copy is a stale snapshot
  (still shows Blocked) — CLAUDE.md's `documentation/` path doesn't exist.

### Iteration 2 — sparkline regression + funnel readability (user screenshots)

User (senior statistician/designer hat) flagged both bento graphs as hard to
understand. One was a real regression, one a design failure:

- **Sparkline bug (regression from iteration 1):** `vector-effect:
  non-scaling-stroke` makes Chromium compute `stroke-dasharray` in **screen
  pixels and ignore `pathLength` normalization**, so the draw-on trick
  (`dasharray: 1` + `pathLength={1}`) leaves the line permanently rendered as
  scattered dashes. **Rule: never combine the dash-draw entrance with
  non-scaling-stroke** — use a clip-path wipe there instead. AreaChart's
  polylines were safe (no vector-effect). Sparkline also gained anchors so it
  reads as a trend, not a floating stroke: gradient tint down to the
  baseline + endpoint dot (dot drawn as a zero-length round-capped polyline
  because preserveAspectRatio="none" would stretch a `<circle>`).
- **Funnel redesign (both modes):** compact glyph was center-aligned with an
  arbitrary 2+2 blue/orange split — read as four unrelated bars. Now
  left-aligned from a common origin (decay is the visible shape), single
  sequential primary ramp (opacity 1 → .5) with **only the final conversion
  stage in accent**. Full mode: same semantic — solid primary pipeline,
  accent final bar, dropped the old `opacity-80` middle tweak (opacity on
  labeled bars would erode the P1-QA-02 cta-ink AA contrast).
- Verified: build + SSR markup on all chart pages (no dasharray on sparkline,
  area fill + dot present, rects `x="0"` with ramp, full funnels 2×primary +
  1×accent per 3-stage funnel). Tracker P1-FE-06 Notes updated (still Code
  review).
