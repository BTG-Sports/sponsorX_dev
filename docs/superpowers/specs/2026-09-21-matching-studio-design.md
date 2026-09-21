# Matching & roster review in-app — design spec (P4-ART-01 in-app)

**Date:** 2026-09-21 · **Task:** implement the accepted P4-ART-01 design
(`documentation/Design/matching-roster-review/`) as the real admin matching
workspace · **Scope decision:** interactive, fixtures-only (wiring to the real
eligible-athletes query is `P4-FE-02`/`P4-BE-03`, both Blocked). Everything is
local-to-visit; demo actions carry Undo, nothing persists.

**The brief was desktop-only (1440×980). The user overrode that:** this spec
designs desktop, tablet **and** mobile.

## What this adds

The design's five screens become one route —
`/admin/campaigns/match` — a **Matching Studio** for the staffing campaign
*Southwest Hydration Push — Rally Sports Drink* (`CMP-2026-0418`, step 3 of
§13's twelve). The campaigns list gains a STAFFING card that opens it. The
Create-Campaign modal's step 3 stays the light picker; this is the dense,
dedicated screen the task called "the densest screen in the product".

## Architecture

| Unit | Purpose |
|---|---|
| `src/lib/matching.ts` | **Pure, unit-tested.** The brief (budget/window/market/job slots), the 14-athlete eligible roster (Texas market, from the design), margin math (`MARGIN_FLOOR = 1.4`, ratio/band/blended), filtering + sorting, relax-suggestion computation for the empty state, slot assignment, status derivation (eligible / guardian-pending / conflict), conflict detail records, deliverables copy, send-summary derivation. Money in **cents** (`money()` from fixtures formats). |
| `src/app/(app)/admin/campaigns/match/page.tsx` | Thin server frame: portal page header, campaign context strip, reads `?view=`/filter params, renders the island. |
| `src/components/matching-studio.tsx` | `"use client"` orchestrator. Owns filters, shortlist set, view (`workspace → compare → review → sent`), conflict drawer subject, margin-exception ack. URL-syncs `view` + filters via `replaceState`. Renders the brief HUD, filter rail/sheet, the roster (table rows ≥`md`, cards `<md`), the shortlist dock. |
| `src/components/matching-compare.tsx` | Factor-by-factor comparison of the current shortlist (not a hardcoded trio): composite + six §14 factors as bars, reach with provenance, cost/sell/margin, conflicts, guardian rows. Desktop grid ≤4 columns; mobile horizontal snap strip. |
| `src/components/matching-review.tsx` | Review & send: per-line offers table (cards on mobile), per-line margin, "Can accept" state, margin-exception acknowledgement gate, "What sending does" list, send card, sent state with Undo. |
| `src/components/matching-conflict.tsx` | Right slide-over drawer (OrderDrawer idiom, portaled, focus-trapped): the declaration fact grid, why it blocks, the three actions, "blocked, never hidden" footer. |
| `tests/matching.test.ts` | Vitest for every pure rule (see Verification). |

## The rules the screen must keep (from BRIEF.md / README.md)

1. **Conflicts stay visible.** Blocked rows remain listed at reduced emphasis
   with the reason readable and a `Why` action → conflict drawer. The empty
   state keeps a "Blocked, not hidden" section.
2. **Margin is a first-class column.** `ratio = sell / cost`; `< 1.4` orange
   *below floor*, `< 1.7` yellow *thin*, else green *healthy*. Shortlist shows
   blended margin; a breach banner names the offending lines; review gates the
   send CTA on an explicit recorded-exception acknowledgement.
3. **Athlete cost is BTG-internal.** Shown here, never on sponsor surfaces —
   the dock carries the reminder caption verbatim.
4. **Provenance is visual.** Verified reach = green check + "Verified";
   self-reported = yellow triangle + "Self-reported". The filter rail keeps the
   "Where numbers come from" legend. Score is a stored snapshot (`rules-v1`,
   dated), never presented as live.
5. **Guardian-pending is a row state, not a block.** Shortlistable; review
   shows "Not until consent"; send list says the guardian is invited in
   parallel.

## Responsive design

- **Desktop (`xl+`)** — three zones: sticky filter rail (left, 15rem), roster
  table (center, 9-column grid: select · athlete · score · reach · cost · sell
  · margin · status · action), sticky shortlist dock (right, 19rem) with
  committed/blended tiles, slot meter, breach banner, per-pick cards, Compare +
  Review CTAs.
- **Tablet (`md`–`xl`)** — filter rail becomes a filter-kit toolbar
  (SearchInput + Dropdowns + chips) above the table; reach column drops at
  `lg-`, cost at `md-` (both remain in the row's expanded card on tap and in
  compare/review); the shortlist dock becomes a **sticky bottom bar** (slots ·
  committed · blended · Review CTA) expanding to a sheet.
- **Mobile (`<md`)** — roster rows become cards (ScoreRing, tier mark, reach +
  provenance icon, cost→sell→margin line, status pill, Add/Why); filters =
  search + "Filters" button opening a full filter sheet with the same
  controls; compare = `sx-snap-x` strip; review table = stacked line cards;
  conflict drawer full-width.

## Wow layer (`sx-match-*`, globals.css)

Same charter as the join/chart systems: final state lives in the DOM, motion
settles onto it, `prefers-reduced-motion` kills all of it, one signature
moment per view.

- Workspace entrance: brief HUD rises, rows cascade with `--sx-d` stagger,
  score micro-bars wipe in.
- Shortlist dock: slot segments wipe-fill as picks land; blended-margin value
  tweens (AnimatedNumber idiom); dock counter pulses once per add; breach
  banner slides open via grid-rows expand.
- View changes: directional slide (`--sx-from`) workspace ⇄ compare ⇄ review.
- Compare: factor bars draw staggered per row; "strongest" cell gets one soft
  glow (sx-ins-hot idiom).
- Review: send CTA sheen fires once when the exception is acknowledged; sent
  state draws a stroke check and staggers the "what happens next" list.

## Honest numbers

Toolbar meta derives from the fixture list only ("{n} match · of 14 eligible ·
2 blocked by conflict, kept visible"). Relax suggestions are **computed** —
each suggestion re-runs the filter with one constraint dropped and shows the
real resulting count; zero-yield suggestions don't render. Committed/blended
figures are sums over the shortlist. No invented statistics.

## Verification

- vitest: margin bands + floor boundary (1.39/1.4/1.41), blended margin,
  filter/sort combinations, relax suggestions (counts match a re-filter),
  slot assignment incl. over-capacity, status derivation, send summary
  (guardian + exception counts), search normalization.
- `tsc --noEmit` (post-build), eslint, `next build`.
- Dev-server drive: `/admin/campaigns/match`, `?view=compare`, `?view=review`,
  empty state via real filters, conflict drawer, send + undo.
