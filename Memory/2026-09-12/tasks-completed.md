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
