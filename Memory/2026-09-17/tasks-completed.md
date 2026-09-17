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

---

## `P1-ART-07` — athlete onboarding visuals, designed and imported

Twelve screens: the flow map, the ten §11 sections in order, and the
post-submit state. Saved to `documentation/Design/athlete-onboarding/screens/`
with a README recording provenance, alongside the brief they were made from.
Row moved to **Code review**.

### The workflow, corrected mid-task

I began by writing the artboards myself in a Claude Design canvas. The user
stopped me — *"we need claude design to do the whole design, you provide
direction"* — after saying the same thing twice in different words. **On an ART
task the deliverable is the brief; Claude Design produces the screens.** The
brief is kept beside the design at `documentation/Design/<name>/BRIEF.md` so the
next person can see what was asked for rather than inferring it from the result.

Two canvases I filled by hand are still on the account and are not the
deliverable: `AdEcdsgFPuzyUHx7Pbb2uB` (onboarding, 12 artboards) and
`HhAh1BKRVJu3aLiHNZ2Z3b` (matching, 2 of 5). They are kept only until the user
says to delete them.

### A second failure worth not repeating

I created the second canvas and then spent several minutes writing artboards
before publishing any, so the user opened a live but empty page: *"I am getting
blank artifacts."* A canvas must be filled and published before anyone is given
its link.

### What came back, and what did not

The export from the Claude Design project
(`claude.ai/design/p/c0570fc3-5743-486f-b69a-b82c1ac07e3c`) is **PNG only** —
the editable `.dc.html` stayed in the project. Importing it directly needs the
`claude_design` MCP, which is not configured in this session, or `DesignSync`,
which refused: *"needs design-system authorization, and /design-login cannot run
in this non-interactive session."* **A one-time `/design-login` from an
interactive Claude Code session on this machine would remove the download step
for the remaining ART tasks.**

### Checks

The screens follow the brief on the two rules that carry consequence. Section 9
lists what SponsorX never asks for — bank account or routing numbers, card
details, Social Security or tax ID — matching §26 and Addendum A6. The flow map
marks section 8 as the single branch, taken only when the date of birth on
section 1 is under 18, and marks section 7 as enforced on every campaign.

### Still open

`P4-ART-01` and `P1-ART-06` have briefs written
(`documentation/Design/matching-roster-review/BRIEF.md`,
`documentation/Design/marketing-visuals/BRIEF.md`) and are In progress, awaiting
the same Claude Design pass.

---

## `P4-ART-01` — matching and roster review, designed and imported

Five screens — matching workspace, roster comparison, conflict detail, review &
send, and the nothing-matches state — designed in Claude Design from
`documentation/Design/matching-roster-review/BRIEF.md`. Row moved to
**Code review**.

### This export came back as source, not pictures

`P1-ART-07` exported as twelve PNGs; this one exported as
`Matching and Roster Review.dc.html` plus `support.js` and the `_ds/nocturne-…`
design system — **editable source that diffs in git**, with all five screens as
state branches inside the one file rather than separate artboards. The export
format appears to depend on what is chosen in Claude Design, so it is worth
asking for source rather than images on the remaining ART tasks.

### What was checked, and what was not

Content was verified against the brief by inspecting the source: conflict
handling, margin and the 1.4× floor, verified-versus-self-reported reach,
guardian state, shortlist, comparison and invitations are all present, as are
the three athlete tiers. **It has not been looked at, and no contrast audit was
run** — that is what Code review is for, and the folder README says so rather
than implying the design is fully reviewed.

### Board after

**40 Done · 11 Ready · 2 In progress · 2 Code review · 286 Blocked = 341.**
77 formulas verified identical.

### Remaining

`P1-ART-06` (marketing site visual assets) is the last of the three, still In
progress with its brief written and ready to paste.

---

## `P1-ART-06` — marketing visuals and a flat logo redraw

Seven assets: hero at desktop and phone, the proof slot, the case-study section,
the package presentation, one package in detail, and a logo sheet with the files
behind it. Saved to `documentation/Design/marketing-visuals/`. Row moved to
**Code review**. Board: **40 Done · 11 Ready · 1 In progress · 3 Code review ·
286 Blocked = 341**, 77 formulas identical.

### The first pass failed, and the brief was the cause

The package screens came back as "Package 1" through "Package 6" at 1, 2, 3, 5,
8 and 10+ athletes, with an invented "everything in Package N" ladder, an
exclusivity progression from shared to region-exclusive, and prices in **pounds**.
None of it is SponsorX.

**My brief had asked for "the six packages as a comparable set" without ever
saying what the six packages are.** Claude Design cannot know what it is not
told, and a brief that names a set without listing it invites a plausible
invention. The corrected brief carries the §7 table by name, price in USD and
athlete count, states the currency explicitly, and bans both a feature matrix
and a tiered ladder — because no package has NIL job codes yet, so there is
nothing real to tick.

The second pass is correct: real names, real prices, real counts, each card
reading *"Deliverables not yet defined — no NIL job codes assigned"*, `OVERLAP`
chips on Local Blitz and 10-Athlete Blitz, and a closing panel naming what is
unsettled.

### The honesty markers are the pricing decision surfacing on a public page

A sponsor reading "no NIL job codes assigned to this package" learns BTG has not
decided what it is selling. The design is right to refuse to fabricate the
content; **the fix is `P0-PMO-10`'s pricing decision, not styling the markers
away.** Worth remembering when someone asks for a "cleaner" package page.

### The logo was redrawn, not reused

The existing mark is a raster esports lockup with bevels, chrome gradients,
outer glow and a drop shadow on a dark plate — it cannot be recoloured, does not
hold at 32px and cannot sit on the light theme. The brief described what
identifies the mark (the two-part X with orange bolt and blade, BTG above
SPONSOR, the blue-then-orange tagline split, the circular badge) and what to
drop, so the redraw reproduces rather than reinvents.

Delivered as SVG in `exports/logos/`: horizontal, stacked, wordmark, tagline, X
alone and badge, each dark and light, plus favicon 32 and app icon 180. The
favicon drops the X entirely because it does not read at that size.

**These SVGs reference Barlow Condensed 800 italic by font name**, a stand-in
for the original letterforms, so a machine without it renders a fallback. Before
they go into `public/`: substitute the real brand typeface if one exists,
convert type to outlines, refit each viewBox. The designer recorded this in
`exports/logos/README.md` rather than leaving it to be discovered.

### All three ART tasks are now at Code review

`P1-ART-07`, `P4-ART-01`, `P1-ART-06` — none reviewed by a second person.
`P5-ART-01` and `P1-ART-04` are the next ART tasks, both Ready with no
dependencies.

---

## `P1-ART-06` closed, `P5-ART-01` started

`P1-ART-06` moved **Code review → Done**, Date Done 2026-09-17, at the user's
instruction. Seven assets accepted.

`P5-ART-01` — design the deliverable and approval states — moved to **In
progress**, brief written to `documentation/Design/deliverable-states/BRIEF.md`.

### What the brief asks for

Nine screens: a state map, three athlete screens at 390 (the deliverable across
states, changes-requested, upload), two BTG screens at 1440 (the review queue,
reviewing one), two sponsor screens at 1440 (awaiting sign-off, reviewing one),
and one screen showing the same deliverable in `SPONSOR_REVIEW` as all three
audiences see it.

The seven §21 states are given verbatim from
`documentation/diagrams/state-machines/05-deliverable.mmd` — NOT_STARTED,
DRAFT_SUBMITTED, BTG_REVIEW, SPONSOR_REVIEW, APPROVED, PUBLISHED, VERIFIED —
with both derived return paths (`BTG_REVIEW → DRAFT_SUBMITTED` and
`SPONSOR_REVIEW → DRAFT_SUBMITTED`) called out, because a rejected draft with
nowhere to go is exactly the gap that machine was drawn to close.

**Naming the states in the brief is the lesson from `P1-ART-06`** — a brief that
refers to a fixed set without listing it invites a plausible invention. Here the
list, the return paths and the per-audience accents are all stated.

### Board after

**41 Done · 10 Ready · 2 In progress · 2 Code review · 286 Blocked = 341.**
77 formulas verified identical.

---

## `P5-ART-01` — deliverable and approval states, delivered

Nine screens saved to `documentation/Design/deliverable-states/screens/`. Row at
**Code review**. Board: **41 Done · 10 Ready · 1 In progress · 3 Code review ·
286 Blocked = 341**, 77 formulas identical.

All seven §21 states are designed, with both derived return paths — and the
second one carries a decision worth keeping: `SPONSOR_REVIEW → DRAFT_SUBMITTED`
routes the sponsor's reason **through BTG to the athlete** rather than
delivering a rejection raw.

### Screen 09 is a field-level visibility matrix, not just a comparison

It states, for one deliverable in `SPONSOR_REVIEW`, what each audience sees:

- **Shared by all three** — deliverable name, state word, who holds the ball and
  since when.
- **Hidden from the sponsor** — athlete fee, campaign margin, BTG's internal
  checks and notes, anything on another campaign.
- **Hidden from the athlete** — margin, the sponsor's SLA clock, BTG's checklist
  state, every other athlete's deliverable.

That is a direct input to `P4-SEC-02` and to the `P1-FE-05` audit, and should be
treated as a proposal to enforce rather than as design garnish.

### Known issue

The per-screen title band renders near-white on white in the export. Export
furniture, not part of any screen, but it needs fixing before these go outside
the team.
