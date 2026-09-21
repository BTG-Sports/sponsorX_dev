# 2026-09-21 — tasks completed

## Branch sync — main_development ⇄ development/Jan/frontend-page-reworks

Merged `main_development` (63 commits: Prisma/AWS/Clerk/pg backend stack,
contracts, worker, migrations, docs) into the frontend branch, resolved 14
conflicts, then fast-forwarded `main_development` to the result and pushed.

- **package.json** — union: main_development's baseline + `next 16.3.5` /
  `react 19.3.0`, plus the report libs (`exceljs`, `jspdf`, `jspdf-autotable`).
  Lockfile regenerated with `npm install`.
- **Memory logs 09-16 / 09-17** — both sides' entries unioned.
- **graphify-out/* + tracker xlsx** — kept ours; graphify needs re-ingestion.
- Verified `prisma generate` + `tsc --noEmit` before committing the merge
  (`9e02892`); `origin/main_development` now at that commit.
- **Board repair from the xlsx conflict:** taking "ours" reverted rcfworks'
  ART closures locally — `P1-ART-07` was back to `Ready`. Reset to `Done` /
  2026-09-18 / rcfworks (their `1a794c8` is the authority).

## Task — `P1-FE-16` · Build the /join athlete onboarding wizard (P1-ART-07 in-app)

**Trigger:** user asked to put the accepted P1-ART-07 design (athlete
onboarding, §11 ten sections) inside the web app, with awwwards-level polish.

**Spec:** [docs/superpowers/specs/2026-09-21-join-wizard-design.md](../../docs/superpowers/specs/2026-09-21-join-wizard-design.md)
**Plan:** [docs/superpowers/plans/2026-09-21-join-wizard.md](../../docs/superpowers/plans/2026-09-21-join-wizard.md)

### What was built

The static, no-JS `/join` stack (all ten sections on one page, submit
disabled) is replaced by the design's **phone-first progressive wizard**:
intro flow-map → one section per screen → after-submit state.

- [join-flow.ts](../../src/lib/join-flow.ts) — pure, unit-tested flow module:
  the ten §11 sections (headings/subs verbatim from the comps), `isMinor`
  (UTC birthday math, invalid dates are not minors), `visibleSections`
  (guardian §4 inserted only for minors — numbering and progress segments
  derive from the list), per-section validation (identity DOB/email rules,
  social needs ≥1 handle), draft (de)serialize for localStorage
  (`sx-join-draft-v1`), restriction categories, the v0.4 agreement clauses.
- [join-wizard.tsx](../../src/components/join-wizard.tsx) — the island.
  Hydration via `useSyncExternalStore` (journey-strip precedent) so a stored
  draft swaps in post-hydration with **no setState-in-effect and no SSR
  mismatch**; private-mode `localStorage` throws are swallowed. Directional
  step transitions (CSS var), focus moves to the heading each step,
  `aria-live` on "Section N of M". Read-only "Review your answers" +
  "Update restrictions" from the submitted state.
- [join-restrictions-step.tsx](../../src/components/join-restrictions-step.tsx)
  — ENFORCED step: deal cards with the derived "blocked while active" line,
  expanding add-deal form, six orange toggle chips.
- [join-agreement-step.tsx](../../src/components/join-agreement-step.tsx) —
  click-wrap: scrollable v0.4 terms, drawn tick, recording note. **Submit is
  gated on the tick — the old "blocked until counsel" gate is gone** (G-05
  closed 2026-09-15 per the design README); the stale copy was removed from
  `fixtures.ts` along with `applicationSections` (join-flow owns the data;
  the old page was its only consumer).
- [join-submitted.tsx](../../src/components/join-submitted.tsx) — drawn
  success check, Submitted → Under review → Decision timeline,
  guardian-pending card (minors; "does **not** hold up your review").
- Wow layer in [globals.css](../../src/app/globals.css) (`sx-join-*`,
  extends the chart-motion system): stage glow that warms toward accent
  after the enforced section (`@property`-registered var, written onto the
  stage by the island — reveal.tsx precedent), intro rail draw + cascade,
  directional step entrances with field stagger, progress-segment wipes +
  breathing active segment (restrictions segment fills orange), grid-rows
  height-expand for the minor notice, stroke-drawn ticks, CTA sheen that
  fires once when the agreement arms Submit. All killed by
  `prefers-reduced-motion`.

### Verification

`vitest` 10/10 (new `vitest.config.ts` + `test` script — first unit tests in
the repo); `tsc`, eslint (join files clean; 2 pre-existing errors in
`documentation/Design/matching-roster-review/support.js` are rcfworks'
deliverable, untouched), `next build` clean, `/join` dynamic. Dev server
driven: intro rail, `?demo=minor` (section 1 + branch notice),
`?demo=submitted` (timeline + guardian card) all SSR correctly.
**Not yet eyeballed in a real browser:** motion feel on a phone viewport,
draft resume after refresh, the branch inserting a progress segment live —
worth a human pass.

### Follow-ups (same day)

- **Login → /join.** The login page's sign-up link pointed at `/packages`
  (stale). Now `/join`, relabelled "Apply as an athlete" — the application
  is not account creation. `/join` was already linked from the marketing
  home CTAs and the footer.
- **Desktop split-stage.** The phone-first column read as "mobile site on
  desktop" at 1920px (the brief never asked for a desktop comp). At `lg+`
  the page is now a split stage: sticky brand panel (headline + §26 trust
  notes, single-sourced from `join-flow.NEVER_ASKED`) beside the wizard as
  an elevated 430px card (`lg:` border/shadow, action bar `lg:rounded-b-2xl`).
  The form column never widens; below `lg` nothing changed.

## Late-day follow-ups on both wizards (all verified in a real browser)

- **Login gets both front doors.** The single sign-up line became a
  "New to SponsorX?" block: "Apply as an athlete" (blue, `/join`) ·
  "Request a sponsor brief" (orange, `/brief`). Deliberately not "Sign up
  as a sponsor" — sponsors get no self-service account in Phase 1 (§17).
- **Package select redesigned.** The native `<select>` popup is OS-rendered
  and unstylable; replaced by a custom listbox — pop-in panel, drawn accent
  check, price meta right-aligned, ↑/↓ roving, Escape/outside-click
  (export-report dropdown discipline).
- **Stacking bug (user-found, browser).** The listbox panel painted *under*
  the later-DOM timing field and the backdrop-blur action bar. Root cause
  worth remembering: **`sx-join-rise`/`sx-join-step` fill-mode animations
  keep every animated sibling a permanent stacking context**, so a panel's
  own z-index can never beat a later sibling from inside. Fix: open state
  lifted to the wizard (`openSelect`); while open, the select wrapper takes
  `z-30`, the step body `z-20`, the action bar an explicit `z-10`.
- **Audience → designed dropdown** (values grounded in §4/§16 reach:
  HS/college followings, event crowds); the package listbox generalized to
  `WizardSelect` and reused. **Market → free text by user decision** (it
  was briefly a MARKETS dropdown from athleteInv geos, then reverted):
  an out-of-network market is a lead BTG wants to see, not an input error.
  Step copy sets coverage expectations instead ("strongest in the DMV,
  hub in Kigali").

Board: **P1-FE-16 and P1-FE-17 both closed Done, 2026-09-21**, acceptance
notes updated. Google Sheet mirror remains the human end-of-day step.

## Task — `P1-FE-17` · Build the /brief sponsor brief-request wizard (B3 public intake)

**Trigger:** user asked for the sponsor counterpart of /join.

**Spec:** [docs/superpowers/specs/2026-09-21-brief-wizard-design.md](../../docs/superpowers/specs/2026-09-21-brief-wizard-design.md)

Sponsors don't self-signup in Phase 1 (managed marketplace, §17) — their
front door is "brief BTG, get a matched shortlist back". That journey
dead-ended at `/packages`' inert "Request a brief" buttons (`not wired (B3)`).
Now they link `/brief?package=<id>`:

- [brief-flow.ts](../../src/lib/brief-flow.ts) — pure module: four steps
  (goal chips → budget bands + package select → market → contact), §7-bracketed
  budget bands, `packageOption` (unknown/missing ids → "Not sure yet", so a
  bad URL can't break the intake), validation, `sx-brief-draft-v1` draft.
- [brief-wizard.tsx](../../src/components/brief-wizard.tsx) — island in
  **sponsor orange** (`--sx-accent`), reusing the whole `sx-join-*` motion
  system (zero new CSS) and the `useSyncExternalStore` hydration discipline.
  No intro (the /packages catalog is the intro), no agreement step (nothing
  is signed — it's a request). Received-state timeline: Received → Matching
  (§13/§26) → Proposal, "no card, no checkout, no commitment" said twice.
- [brief/page.tsx](../../src/app/(public)/brief/page.tsx) — split-stage frame
  like /join; **`pkg` passed only when `?package=` present** so a bare visit
  resumes the stored draft instead of resetting it.
- No design deliverable existed (2S0-ART-01 is Phase 2 self-service), so the
  design follows the P1-ART-07 wizard language.

**Verified:** vitest 18/18 (brief-flow: step validation, email rule, package
fallback, draft round-trip), tsc/lint/build clean, `/brief` + `?demo=submitted`
+ all six `/packages` links driven via dev server. Human pass: chips motion,
select styling on a real phone.

### Task board

Added **P1-FE-17** (row 56, Order 33.998, `Code review`, started 2026-09-21,
depends on P1-FE-16); extended autofilter, Status validation, CF ranges and
the 15 Dashboard formulas from row 200 → 201.

Added **P1-FE-16** (row 55, Order 33.997, `Code review`, started 2026-09-21);
extended autofilter, Status validation, 3 CF ranges and all 15 Dashboard
formulas from row 199 → 200. Also reset `P1-ART-07` to `Done` (see branch-sync
note). Backup in the session scratchpad. Google Sheet mirror is the human's
end-of-day step.

## Task — `P4-FE-06` · Build the matching & roster-review workspace in-app (P4-ART-01 in-app)

**Trigger:** user asked to put the P4-ART-01 matching / roster-review design
inside the web app with awwwards-level polish, designed for desktop, tablet
**and** mobile (rcfworks' brief was deliberately 1440-only — the user
overrode that).

**Spec:** [docs/superpowers/specs/2026-09-21-matching-studio-design.md](../../docs/superpowers/specs/2026-09-21-matching-studio-design.md)
**Design source:** `documentation/Design/matching-roster-review/` (BRIEF.md is
the real contract; the `.dc.html` is reference, not pixel law)

### What was built

The **Matching Studio** at `/admin/campaigns/match` — §13 step 3 for a new
STAFFING campaign (*Southwest Hydration Push — Rally Sports Drink*,
`CMP-2026-0418`) whose card now leads the `/admin/campaigns` list. All five
design states live in one island:

- [matching.ts](../../src/lib/matching.ts) — pure, 27 vitest tests: the
  brief (cents, `money()`), the 14-athlete Texas roster (each composite =
  round(mean(six factors)) — asserted, so "explainable score" stays true),
  `MARGIN_FLOOR = 1.4` band math, filter/sort with **conflicts never
  hidden** (blocked athletes bypass every filter except search), computed
  relax suggestions (each count is a genuine re-run), slot assignment with
  visible overflow, send summary/steps, conflict-detail records for Lena +
  Sasha.
- [matching-studio.tsx](../../src/components/matching-studio.tsx) —
  orchestrator: URL-synced filters + `?view=`, ordered shortlist, brief HUD
  with live slot meter, roster table/cards, dock, bottom bar, sheets,
  drawer plumbing (roster-ops discipline). Plus
  [matching-bits](../../src/components/matching-bits.tsx) (tier mark,
  provenance mark, margin value, score cell, tween number — one source so
  views can't drift), [matching-compare](../../src/components/matching-compare.tsx)
  (compares the *actual* shortlist, sticky label column, snap strip on
  phones), [matching-review](../../src/components/matching-review.tsx)
  (send gated on a recorded-exception checkbox; demo send with Undo),
  [matching-conflict](../../src/components/matching-conflict.tsx) (drawer:
  declaration facts, why-it-blocks, three actions).
- Motion rides the existing `sx-join-*`/`sx-viz-*` systems; the only new CSS
  is the bottom sheet (`sx-match-sheet`, globals.css), reduced-motion 1ms so
  the animationend unmount still fires.

### Lessons that cost a cycle (browser-verified via Playwright)

- **The mock's 1440 doesn't survive the portal sidebar.** Filter rail +
  table + dock at `xl` left ~570px for a 9-column grid — rows overflowed
  *under* the dock (found because a Playwright click on "Why" was
  intercepted). Zones now earn their place a breakpoint late: cards < `lg`
  (2-up from `sm`), 8-col table `lg+`, dock rail `xl+`, filter rail `2xl+`,
  and **cost is never a column** — it's the permanent subline under Sell.
- **A mount-flag focus guard refires under StrictMode's double effect** and
  yanked the page down on load. Guard on the previous *value* instead.

**Verified:** vitest 46/46 (27 new), tsc, eslint, `next build` clean;
Playwright drove all five states at 1440/1920/834/390 — send-gate →
send → undo, conflict drawer from a real click, dock CTAs, computed
empty-state suggestions ("Drop minimum score to 85 · 1 match").
Screenshots in the session scratchpad (`mx-*.png`).

### Task board

Added **P4-FE-06** (row 117, Order 93.5, `Code review`, started 2026-09-21,
depends on P4-ART-01); extended autofilter, Status validation, 3 CF ranges
and all 15 Dashboard formulas from row 201 → 202. Also restored
**P4-ART-01 → Done / 2026-09-17 / rcfworks** — the 09-21 merge had reverted
it to `Ready`, same failure as P1-ART-07. Backup in the session scratchpad.
Google Sheet mirror remains the human end-of-day step.
