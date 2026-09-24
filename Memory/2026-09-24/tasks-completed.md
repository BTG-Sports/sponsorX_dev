# 2026-09-24 — tasks completed

## `P1-FE-21` — the edition page map, as a live flatplan

*Code review. The design went through the visual companion (three concepts;
flatplan chosen), then an approved terminal design, then the spec:
`docs/superpowers/specs/2026-09-24-edition-page-map-design.md`.*

`/admin/next/editions` renders the Fall 2026 issue as facing spreads with ad
slots at their true positions — the editor's flatplan wall, live. Sold = solid
violet + sponsor monogram, reserved = dashed hold **naming who it is held
for**, open = quiet surface showing the rack price, editorial = stripes. The
back cover renders apart as a framed 1-of-1 with its price and the "unsellable
after close" warning. The §5.2 production gates (contentReady, rightsCleared,
revenueMet) are explicit pass/fail chips above a violet minimum-viable meter
that spells out the shortfall — $5,300 of $6,500, $1,200 to go, 16 days.

### Decisions worth recording

**The flatplan fixture is the single source, and tests make it so.**
`editionPages` (20 pages, 24 slots incl. `BACK-01`) now *derives*
`studentEdition.committedCents` — the student portal's edition card and the
admin map render projections of the same array. `tests/edition-fixtures.test.ts`
pins: Σ(sold values) = committed; counts = 11/4/9; back cover singleton; slot
codes unique; **Jordan's three attribution rows appear on the map with matching
sponsor and value**; and the two in-flight prospects (Iron Path Gym, Delgado's
Pizzeria) hold reserved slots by name. Two surfaces, one story.

**A hold names its holder.** RESERVED without `holdFor` fails the test —
a hold nobody can account for is an open slot someone is afraid to sell.

**Sale value ≠ rack price, visibly.** Rosa's quarter closed at $450 against a
$250 rack (coupon add-on); the drawer says "differs from rack — value frozen
at close." That is the `SalesAttribution` frozen-value rule surfacing in UI.

**Magazine geometry is respected.** The cover renders recto (right of the
spine), a trailing lone page verso — caught in the render-and-look pass, where
page 20 was stretching across the whole spread before the spacer fix.

**Portal chrome vs. programme color.** The screen lives in the admin portal
(steel chrome) but every NEXT inventory mark is violet — same split as the
student portal. State encoding is shape + color (fill / dashed / empty /
stripes), never color alone.

### Verification

62 frontend tests green (8 new invariants), backend untouched, build and
eslint clean. Overflow measured with headless Chrome at 390/470/768:
`scrollWidth === clientWidth` at every width (the P1-FE-19 lesson, now a
standing check — the rail here shipped with `min-w-0` from the start).
Screenshots eyeballed at 390 and 1280; the drawer, holds, monograms and gates
all render as specced. Admin nav gained "NEXT editions" (book glyph); the dev
route map lists the screen.

Board: `P1-FE-21` → Code review (HeckerCreatives, 2026-09-24), snapshot row
appended (Done 91 · 428 days — unchanged; Code review is not Done). Google
Sheet still needs its hand mirror at end of day.

## Merged and pushed — both developers' day, one branch

The second binary-board merge in two days, resolved the same way: took the
other side's xlsx, re-applied our three FE rows by hand, re-extended the
validation and conditional-formatting ranges (**third time the 237 trap has
fired** — his side had re-extended only the Dashboard, to a safe $400), and
appended the day's snapshot computed from the *merged* sheet: **Done 121 ·
354 days**, which is the first snapshot to count his Stage 5–7 closures.
The 2026-09-23 memory log conflicted add/add both times; both sides kept in
day order, nothing dropped.

Two merged-tree findings worth keeping:

- **His new `qrcode` dependency needs `npm install` after pulling** — the
  build fails with a missing-declaration error that looks like a types
  problem and is actually a stale node_modules.
- **`payment-policy-compliance.test.ts` broke on Windows paths with spaces:**
  `new URL(..).pathname` yields `/D:/iCARRe%20Solutions/…`, which spawnSync
  rejects with ENOENT before grep runs. Fixed with `fileURLToPath` — the
  cross-platform way to turn `import.meta.url` into a cwd. His test logic
  untouched; 1015 backend tests green on this machine after the fix.

Pushed `main_development` at `360743a` — flatplan, student portal, login
redesign and the board fixes all published.

## `P1-FE-22` — the ad slot inventory ledger

*Code review. The list behind the page map, per its own definition.*

`/admin/next/inventory`: every sellable position in one filterable table —
state as the flatplan's shape+color mark plus a badge, buyer or **named hold**
per row, rack price and frozen sale value side by side (Rosa's $450 against a
$250 rack renders the SalesAttribution frozen-value rule as a visible fact).
Totals strip: committed $5,300 (violet), $4,800 still on the rack, 46%
sell-through, $11,900 full rack value.

- **filter-kit reused, not rebuilt** — the acceptance's second clause.
  SearchInput + two Dropdowns + dismissible FilterChips, admin tone for desk
  chrome, violet only on data marks; filters instant, URL-synced via
  `replaceState`.
- **The two NEXT admin screens now cross-navigate:** every ledger row's
  "Map →" deep-links to its page's drawer on the flatplan (`?open=N`, back
  cover = 0) — `EditionFlatplan` gained `initialOpenPage` for it.
- **Contained scroll, not page scroll:** the table scrolls inside its own
  `overflow-x-auto` container; page-level `scrollWidth === clientWidth`
  verified at 390/470/768. The measurement script flags the table cells —
  correctly, they are wider than the viewport — but the page never moves.
- No new fixtures and no new invariants needed: the ledger is a projection of
  `editionPages`, so the existing suite already guarantees it cannot disagree
  with the map or the student portal.

62 frontend tests green, build and eslint clean, screenshots eyeballed at 390
and 1280. Board: `P1-FE-22` → Code review (HeckerCreatives, 2026-09-24).
Google Sheet still needs its hand mirror at end of day.

## `P1-FE-20` — the advisor desk

*Code review. The third NEXT surface of the day, and the cheapest by design:
its acceptance is mostly reuse.*

`/advisor` (applications) and `/advisor/review` (content) for one school.
The `Portal` union gained its **sixth member** — `advisor` shares the NEXT
violet with its own label ("NEXT Advisor"), because it is the same programme;
`PORTAL_ROLES` admits the Stage 9 `ADVISOR` string (matches nobody yet) plus
the two BTG admin roles for preview, exactly the `/next` precedent.

- **ApprovalsDesk reused unchanged** — the acceptance's second clause, and
  the P1-FE-20 definition's whole thesis: `DeliverableState` *is* an
  editorial workflow. The school's queue feeds it `ReviewContentItem` rows
  where campaign = section, athlete = student, sponsor = "Editorial" unless a
  paid feature previews placement. Jordan's rows mirror `studentAssignments`
  states one for one, so the student portal and the advisor desk tell one
  story about the same drafts.
- **Applications render note-first** — the advisor's real review is knowing
  the kid; the note is the biggest thing on the card. `StudentApplicationState`
  is the SUBMITTED/UNDER_REVIEW/APPROVED slice of spec §5.1's `StudentState`
  (which mirrors `AthleteState` deliberately). Approve / Request changes ship
  disabled naming `P9-FE-02`.
- **The boundary is stated on the desk itself:** the hero copy says publishing
  economics and rights stay with SponsorX — V3 §3's rule, put where the person
  it governs will read it.

62 frontend tests green, build and eslint clean, page-level no-horizontal-
scroll verified at 390/470/768, screenshots eyeballed. Board: `P1-FE-20` →
Code review (HeckerCreatives, 2026-09-24).

Three NEXT screens shipped today (flatplan, inventory ledger, advisor desk);
Stage 1's remaining queue is P1-FE-23 (splits), P1-FE-30 (points), P1-FE-29
(rights), then the design-gated public four and P1-FE-28. Google Sheet still
needs its hand mirror at end of day.
