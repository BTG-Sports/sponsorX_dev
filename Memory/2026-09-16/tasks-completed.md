# 2026-09-16 — tasks completed

## Tracker update — eleven documents approved and closed

User: *"update the task sheet. most documents are approved, for those needing
technical approvals."* Read as: the sign-offs that are **technical** are given;
anything awaiting a signature or a commercial decision stays open.

### Closed Code review → Done (11), Date Done 2026-09-16, owner `rcfworks`

`P0-DATA-02` reward event taxonomy · `P0-DATA-03` Content Value Score v1 ·
`P0-PMO-03` email provider (Resend) · `P0-PMO-04` SMS out (G-06) ·
`P0-PMO-05` sponsor report format (G-07) · `P0-PMO-06` PDF worker dropped ·
`P0-PMO-12` baseline memory reconciliation · `P2-BE-01` dependency install ·
`P2-BE-07` contracts registry + OpenAPI · `P2-BE-09` repo layout ·
`P2-OPS-06` bare-`findMany()` lint rule.

### Held at Code review (3) — the outstanding approval is not technical

- **`P0-PMO-01`** payment policy — needs a signature from whoever runs athlete
  payouts. Everything technical in it is agreed.
- **`P0-PMO-09`** job catalogue economics — needs a **pricing** decision. The
  document reports athlete cost exceeding the sell floor on all seven jobs at
  the top of the base band with a Premium athlete, and recommends a floor rule
  of `price >= athlete cost x 1.4`.
- **`P0-PMO-10`** sponsor packages — needs a **pricing / inventory** decision.
  Packages cannot be seeded until each names its job codes.

Closing these two as technically approved would have buried a live commercial
problem in a Done row, which is why they were separated rather than swept in.

### Cascade — three tasks flipped Blocked → Ready

The board does not do this itself; each had exactly one dependency and it just
closed.

| Task | Sole dependency | Now |
|---|---|---|
| `P1-ART-04` sponsor ROI report layout for print | `P0-PMO-05` | Ready |
| `P3-INT-01` transactional email send interface | `P0-PMO-03` | Ready |
| `P8-PMO-01` OpenAPI specification (§38) | `P2-BE-07` | Ready |

### Diagram format recorded on the two ART rows

User asked whether Claude Design was needed for the art. It is not, for these
two: **`P0-ART-01` (ERD) and `P0-ART-02` (eight §21 state machines) are drawn as
Mermaid committed in `documentation/`**, because `P2-BE-02` builds the Prisma
schema and the enums directly from them — they have to diff in git and
regenerate when the schema moves. SVG/PNG exported from the Mermaid satisfies
the "readable at print size" criterion. Claude Design stays for the visual ART
tasks (`P1-ART-05/06/07`, `P4-ART-01`, `P5-ART-01`). Both rows carry this in
Notes so nobody re-opens the question.

### Board after

**31 Done · 20 Ready · 1 In progress · 3 Code review · 290 Blocked** = 345.

### Verified

All **77 formulas byte-identical** before and after — only existing cells were
written, **no rows inserted**, so the Dashboard's hardcoded ranges, the three
conditional-formatting ranges per sheet, the autofilter (`A4:R190` etc.) and the
Status data-validation lists are untouched. Workbook backed up to the session
scratchpad before editing; `openpyxl` installed in a throwaway venv there, not
globally and not into the project.

### Still to do

End-of-day mirror of the Google Sheet by hand, as the daily rule requires —
eleven rows to Done, three rows Blocked → Ready.
