# 2026-09-17 — tasks completed

---

# rcfworks — tracker

## All seven Code review rows closed to Done

User: *"set all code review to done please"* — read as literal and total,
including the three PMO documents that were deliberately held back on
2026-09-16 because their outstanding approval was commercial rather than
technical. That hold is now lifted by the user's decision.

### Closed Code review → Done (7), Date Done 2026-09-17, owner `rcfworks`

| Task | What it is |
|---|---|
| `P0-PMO-01` | Phase 1 payment policy (G-01) |
| `P0-PMO-09` | SX-01…SX-07 job catalogue economics |
| `P0-PMO-10` | The six sponsor packages and their inventory |
| `P0-ART-01` | Phase 1 ERD, A0 sheet |
| `P0-ART-02` | The eight §21 state machines, 9-page A3 set |
| `P0-ART-03` | Paginated §39 process flowchart, 11 pages |
| `P1-ART-05` | Fan reward landing design, seven states |

### The commercial question these close over

`P0-PMO-09` and `P0-PMO-10` were held on 2026-09-16 because the documents
report **athlete cost exceeding the sell floor on all seven jobs** at the top of
the base band with a Premium athlete, and recommend a floor rule of
`price >= athlete cost x 1.4`; and because **packages cannot be seeded until
each names its job codes**. Closing the rows records that the documents are
accepted — it does not answer the pricing question, which still has to be
answered before `P3-BE-11` seeds the catalogue. Flagged to the user at the time
of closing rather than left in a Done row unremarked.

### Cascade — two tasks flipped Blocked → Ready

Each had exactly one dependency and it just closed. The board does not do this
itself.

| Task | Sole dependency | Now |
|---|---|---|
| `P3-BE-11` seed the sponsor package catalogue | `P0-PMO-10` | Ready |
| `P7-BE-01` earnings model and state machine | `P0-PMO-01` | Ready |

Both are Block B work and stay untouched until Block A finishes.

### Board after

**40 Done · 14 Ready · 1 In progress · 286 Blocked = 341** delivery tasks
(+ 9 on the Legal sheet = 350). Nothing at Code review for the first time since
2026-09-14.

### Verified

All **77 formulas byte-identical** before and after — only existing cells were
written, **no rows inserted**, so the Dashboard's hardcoded ranges, the
conditional-formatting ranges, the autofilters and the Status data-validation
lists are untouched. The two subtitle cells that state totals need no change,
because no task was raised or removed. Workbook backed up to the session
scratchpad before editing; `openpyxl` installed in a throwaway venv there, not
globally and not into the project.

### Still to do

End-of-day mirror of the Google Sheet by hand, as the daily rule requires —
seven rows to Done, two rows Blocked → Ready.

---

## Where the work stands after this

Block A of [the build roadmap](../../documentation/SponsorX-Phase1-Build-Roadmap.md)
is three design tasks from complete. Every front-end task in Stage 1 is Done and
no `ScreenStub` remains anywhere in `src/app`. What is left in the block:

- `P1-ART-07` athlete onboarding visuals (§11 ten sections + guardian branch) —
  the §39 front door, no dependencies
- `P1-ART-04` sponsor ROI report layout at print width — feeds `P7-BE-05`
- `P1-ART-06` marketing site visual assets — outside the protected loop, so last

`P0-OPS-01` (Railway) carries 115 unblocks but is Block B; the roadmap's block
order governs, not the Unblocks column.
