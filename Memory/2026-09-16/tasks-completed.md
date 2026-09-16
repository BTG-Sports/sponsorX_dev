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

---

## `P0-ART-01` and `P0-ART-02` — the two §38 diagram deliverables

Both built and moved to **Code review**, owner `rcfworks`, Date Started
2026-09-16. Board: **31 Done · 18 Ready · 1 In progress · 5 Code review ·
290 Blocked** = 345. 77 formulas verified identical.

### Format, and why

User asked whether Claude Design was needed. It is not, for these two: they are
technical drawings that `P2-BE-02` builds the Prisma schema and enums from, so
they must diff in git and regenerate when the schema moves. **Mermaid source
committed in `documentation/diagrams/`, PDF rendered from it for distribution.**
The user asked for PDF explicitly. Claude Design stays for the visual ART tasks.

- **ERD** — one A0 landscape sheet, 29 models with relationships, PK/FK/UK and
  state columns. A0 because the diagram's aspect is 1.37 and at A1 the attribute
  text lands near 6.5pt; at A0 it is ~9.7pt and scales down cleanly to A1/A2.
- **State machines** — 9 pages A3 portrait, cover plus one machine per page,
  each page carrying the §21 line it was drawn from.

### Two findings worth carrying into `P2-BE-02`

**Five §20 tables are not modelled in Implementation Guide V2 at all:**
`sponsor_contacts`, `athlete_content_capabilities`, `athlete_brand_preferences`,
`integration_connections` — and `roles` / `user_roles` are collapsed into a
`Role[]` array on `User`, which contradicts both §20 and `CLAUDE.md`'s
"`tenants`, `roles` and `user_roles` in Postgres authorize", and cannot carry a
grant's scope, grantor or date. The sharp one is `athlete_brand_preferences`:
**§26's conflict check needs the athlete's restricted categories and only the
sponsor's side exists today**, so the check cannot currently be implemented.
`payouts` is deliberately absent per G-01 and is not a gap. Full table-by-table
audit in `documentation/diagrams/README.md`.

**§21 states forward paths only.** Nine arrows across six machines had to be
drawn to avoid dead-end states — a review that requests changes, a payment hold
that is resolved, a pause that is lifted. Each is labelled `(derived)` on the
diagram and called out on the cover page, as proposals for `P2-BE-02` to
confirm rather than established requirements. Campaign Brief and Athlete
Invitation needed none.

### Toolchain notes (cost time once; should not again)

- **Mermaid drops the newline after a bare `%%` line**, which glues the comment
  block onto the diagram declaration and fails the parse. Every comment line in
  these sources carries text, and the diagram declaration is line 1.
- **Chrome's `--print-to-pdf` does not recognise `@page { size: A0 }`** — it
  silently falls back to US Letter. Give explicit millimetres
  (`size: 1189mm 841mm`). A3/A4 names do work.
- A `.page` block taller than the printable area silently doubles the page
  count, footers landing on their own pages. Caught by counting pages, not by
  looking at the first one.
- Mermaid's default layout put the ERD at 7470×3382 (aspect 2.2, unprintable);
  `layout: elk` gives 4900×3588, aspect 1.37, which is what makes an A0 sheet
  work.
- `@mermaid-js/mermaid-cli` was installed in the session scratchpad with
  `PUPPETEER_SKIP_DOWNLOAD=1` and pointed at the installed Chrome — **nothing
  was added to the project**, which keeps the zero-new-dependencies-until-B0
  rule intact. The regeneration recipe is in `documentation/diagrams/README.md`.

---

## `P0-ART-03` — paginated process flowchart (new task, raised today)

User's reaction to the ERD: *"the phase 1 erd is quite large. can you make a set,
a flowchart with start and end. likewise divide the flowchart into pages so it
will be easy to navigate."* Asked whether each page should carry the flowchart
plus its tables, a pure process flowchart, or the ERD split by domain; they chose
**pure process flowchart**. The A0 ERD stays exactly as it is.

**Raised as a new task rather than folded into `P0-ART-01`**, whose acceptance is
the ERD and was already met. `P0-ART-03` was the next free ID; Order `20.5` puts
it directly after `P0-ART-02` without renumbering anyone else's rows.

### What it is

`documentation/diagrams/SponsorX-Phase1-Process-Flow.pdf` — 11 pages A3
portrait. Cover carries a whole-loop map with the page number for each stage,
an actor colour key and an index; then one §39 stage per page, START on page 2
and END on page 11, with black off-page connectors — *from page N* at the top,
*continues on page N* at the bottom — so the loop can be followed in either
direction.

Colour by actor: athlete/guardian, BTG staff, sponsor, fan, system/worker.
Record state changes are dashed boxes, so a reader can see exactly which enum
moves at each step and cross-reference the state-machine PDF.

**Every step is traceable**: §11 onboarding capture, §12 agreements, §13's
twelve-step managed campaign workflow, §16 the QR funnel, §21 the state
machines, §26 conflict checks. The blueprint v2.0 `.docx` in
`documentation/Master/` was read directly for each. Nothing invented.

Each page carries a one-line note in the margin holding the thing that is easy
to get wrong there — the sell-floor collision on stage 3, the missing restricted
categories on stage 5, the void-draft-acceptance consequence on stage 6, "only
REDEEM is a business outcome" on stage 8, "PAID is a bookkeeping mark" on
stage 9.

### The layout lesson

First render was unreadable: commentary written as graph *nodes* made the pages
1:3.3 tall and forced the diagram down to ~6.5pt on A3. **Moving commentary out
of the graph and into the page margin** cut the tallest page from 2536px to
2144px and brought every page to 8–11pt. Prose belongs in the page, not in the
flowchart.

### Tracker

New row at **Phase 1 row 185** — deliberately *appended into free rows inside
the existing ranges* (`I5:I190`, autofilter `A4:R190`) rather than inserted, so
**not one formula, validation or conditional-formatting range needed touching**.
77 formulas verified identical. The two subtitle cells that state totals were
corrected by hand — Dashboard `A2` 336→337 delivery and 345→346 total, Phase 1
`A2` 186→187 tasks and 446→447 person-days — because those are text, not
formulas, and nothing updates them automatically.

**Board: 31 Done · 18 Ready · 1 In progress · 6 Code review · 290 Blocked = 346.**
