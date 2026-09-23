# Edition page map — the flatplan

**Date:** 2026-09-24 · **Route:** `/admin/next/editions` · **Task:** `P1-FE-21`
· **Status:** approved (concept picked in the visual companion: A · flatplan;
composition/interaction design approved in terminal)

## Decision

BTG's edition-planning screen renders the Fall 2026 issue as a **live
flatplan** — pages drawn as facing spreads with ad slots at their true
positions — because the task's whole point is scarcity *against a position*:
"which pages are sold" is a different question from "how many halves are left,"
and only the first one needed a new screen.

## Where it sits

Inside the **admin portal** (steel chrome, existing `(app)/admin` layout and
`requirePortalAccess("admin")`). **Violet marks NEXT inventory** — the portal
owns the chrome, the programme owns the data color, same rule as the student
portal. New admin nav item `NEXT editions` (book glyph).

## Composition

1. **Header** — title, publication, edition switcher (Fall 2026 · SELLING
   active; Winter 2026 · PLANNING inert with a reason tooltip).
2. **Gates band** (HeroBand, violet border) — the §5.2 production conditions
   as explicit pass/fail chips: `contentReady`, `rightsCleared`, `revenueMet`;
   the violet threshold meter ($ committed of $6,500 minimum-viable, with the
   shortfall spelled out); the **close-date countdown chip always visible**
   (warn tone at ≤7 days) and the publish target beside it.
3. **The flatplan** — cover, then facing pairs (2–3 … 19–20), each page a 3:4
   card: full-page slot = one block, half = a band, quarters = paired; the
   unfilled remainder of a page renders as muted **editorial** filler, because
   that is literally what it is. State encoding is shape + color, never color
   alone: **sold = solid violet fill + sponsor monogram · reserved = dashed
   violet outline · open = quiet surface with the rack price**. Editorial
   pages carry a pen glyph. A persistent legend sits above the plan.
4. **The back cover renders apart** — larger, framed, glowing: "1 of 1 ·
   $1,000 · unsellable after Oct 9". The singleton is furniture, not a row.
5. **Rail** — committed-$ tile (violet meter), slot counts (11 sold / 4
   reserved / 9 open), days-to-close, sell-through by kind as quiet bars.
6. **Drawer** (client island, house drawer motion) — tap a page: its slots
   with code, kind, rack price, state, sponsor and sale value where sold.
   Reserve/release/price actions ship **disabled** titled "Wired by P9-FE-03
   against the AdSlot ledger (Stage 9)".

## Fixtures — one source, pinned by tests

New `editionPages` (20 pages, 24 slots including `BACK-01`) in
`lib/fixtures.ts`. `studentEdition.committedCents` becomes the derived sum of
the map's sold values ($5,300). Cross-fixture invariants a test enforces:

- Σ(sold slot values) = `studentEdition.committedCents`
- counts = 11 sold / 4 reserved / 9 open = `studentEdition` slot counts
- exactly one `BACK_COVER`
- Jordan's three ledger rows (`P04-QTR` $450 Rosa's Bakery, `P07-HALF` $500
  Kim's Auto Care, `P11-HALF` $500 Summit Physical Therapy) appear on the map
  as SOLD with matching sponsor and value — the admin map and the student
  ledger cannot tell different stories
- the pipeline cross-links: Iron Path Gym (acceptance check) and Delgado's
  Pizzeria (meeting) appear as RESERVED holds

## Responsive

Desktop: spreads flow in a wrapping grid beside the rail. Phone: one spread
per row (a magazine is spreads — pages stay paired), back cover full-width,
rail stacks below. Verified by headless-Chrome measurement at 390/768/1280:
`scrollWidth === clientWidth`, the P1-FE-19 lesson.

## Out of scope

No backend reads, no reserve/release behavior, no Winter 2026 content, no
inventory table (that is `P1-FE-22`), no rights queue (`P1-FE-29`).

## Verification

Build, lint, tests (new invariants suite) green; overflow measurement at three
widths; drawer honors reduced motion; every disabled control names P9-FE-03.
