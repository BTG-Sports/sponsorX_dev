# Matching and roster review — `P4-ART-01`

The screen a BTG Athlete Network Manager uses to choose which athletes go on a
sponsor's campaign, and to review that roster before invitations go out —
step 3 of the §13 twelve-step managed campaign workflow. Desktop, 1440 × 980.

## What is here

| File | |
|---|---|
| [BRIEF.md](BRIEF.md) | The direction given to Claude Design — screens required, brand tokens, content rules, acceptance |
| `Matching and Roster Review.dc.html` | The design itself, editable source |
| `support.js` | The runtime the `.dc.html` loads |
| `_ds/nocturne-…/` | The design system the screens are built against |

Unlike `P1-ART-07`, this one came back as **source rather than PNGs**, so it can
be opened, edited and diffed in git. All five screens live in the one file as
state branches rather than separate artboards.

## Provenance

Designed in Claude Design on 2026-09-17 from `BRIEF.md`, exported as
`Workspace tabs and roster screens.zip`.

## What the design commits to

- **Conflicts stay visible.** An athlete with a declared competing deal remains
  in the list, blocked and with the reason readable, rather than being filtered
  away — a manager must be able to see that someone was excluded and why.
- **Margin is a first-class column.** The floor rule is price ≥ 1.4× athlete
  cost, and `P0-PMO-09` found that floor is breached on real combinations at the
  top of the base band with a Premium athlete. The screen surfaces a roster that
  breaks the floor before invitations go out.
- **Athlete cost appears here and nowhere a sponsor can see.** This is staff
  software, so cost and margin are shown; the same figure must never reach a
  sponsor-facing surface (the field-level rule `P1-FE-05` audits).
- **Reach carries its provenance** — verified through the platform where we have
  it, self-reported otherwise, and the two look different at a glance.
- **Guardian-pending is a row state, not a block.** A minor whose guardian has
  not confirmed can be shortlisted but cannot accept.

## Not yet done

The design has been checked for content against the brief, **not reviewed
visually**, and no contrast audit has been run on it. That is what the Code
review state on the task board is for.

## Feeds

`P4-FE-02` (wire the campaign builder and athlete matching UI) and `P4-FE-03`
(wire the invitation send flow) build against this. The data behind it is
`P4-BE-03`, the eligible-athletes query with the conflict and category checks.

All three are Blocked, and the chain runs back through `P4-BE-02` → `P4-BE-01` →
`P2-BE-04` → `P2-BE-02` → Railway. Nothing on the code side of matching can
start until that exists, which is why the design is worth having now.
