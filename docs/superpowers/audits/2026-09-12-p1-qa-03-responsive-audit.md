# P1-QA-03 — Responsive audit: 360px, no horizontal scroll, phone nav

**Date:** 2026-09-12 · **Branch:** `P1-FE-QA-PMO` · **Acceptance:** no
horizontal scroll at 360px; portal navigation usable on phone (§9).

## Method

Headless Chrome via the DevTools protocol with mobile emulation at 360×800:
`max(documentElement.scrollWidth, body.scrollWidth)` measured on **29 routes**
(every page, including marketplace tab variants, `?demo=minor`, and both
campaign details). Culprits were isolated by recursive hide-and-remeasure —
hiding elements one at a time until the width snapped back — and by measuring
per-element `min-content`. Screenshots alone were not trusted: right-edge
clipping in a screenshot cannot distinguish sanctioned inner-scroll regions
from true page overflow, and a naive `scrollWidth <= innerWidth` check is
self-defeating because Chrome's mobile emulation *expands* the layout viewport
to fit overflowing content (three failures initially reported innerWidth
380/395/415 — i.e. hidden fails).

## Failures found → fixed (4)

All four were the same root cause: **a grid whose mobile single column is
implicit** (`grid-cols-…` set only at `md:`/`lg:`/`xl:`) does not shrink below
its items' min-content, so `truncate`/`min-w-0` inside cards never engages and
the whole page widens. `overflow-x-auto` does not protect against this — a
scroll container still contributes its content's min-content during intrinsic
track sizing. Fix in each case: `min-w-0` on the grid's direct children.

| Route | Was | Culprit |
|---|---|---|
| `/athletes/[slug]` | 415px | inventory rows' fixed chips + price column propagating through `lg:grid-cols-[minmax(0,1fr)_18rem]` |
| `/sponsor/campaigns/[id]/report` | 395px | top-content rows through `xl:grid-cols-[1.6fr_1fr]` |
| `/sponsor/marketplace` (all 3 tabs) | 380px | package/athlete/media card min-content through the card grids |
| `/admin/campaigns/new` | 624px | eligible-athletes table (`min-w-[34rem]`) through `xl:grid-cols-[minmax(0,1fr)_20rem]` |

## Verified after fixes

- **Width: 29 / 29 routes measure exactly 360px** — no page-level horizontal
  scroll anywhere. Wide tables/charts scroll inside their own
  `overflow-x-auto` containers, which is the sanctioned pattern.
- **Phone nav:** the `Open navigation` drawer button is visible at 360px on
  all four portals and opening it shows the full link set (athlete 6,
  sponsor 5, property 3, admin 10). Public site header is sticky and fits.
- `tsc` / `eslint` clean.

## Note for future layouts

When a two-column `*:grid-cols-[minmax(0,1fr)_<rail>]` layout collapses to one
implicit column on phones, the `minmax(0,…)` protection disappears with the
breakpoint. Give the content column `min-w-0` unconditionally.
