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
