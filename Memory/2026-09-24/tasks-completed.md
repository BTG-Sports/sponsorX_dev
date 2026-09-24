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

## `P1-FE-23` — revenue splits, deliberately unlike earnings

*Code review. The acceptance is negative space: "visibly distinct from the
athlete earnings surface." The design answers with structure, not styling.*

`/admin/next/splits`: the four §5.7 payees per edition — SponsorX 4,000 bps ·
school 3,000 · student pool 2,000 · editorial fund 1,000 — with amounts
**derived from committed revenue at render time, never transcribed**. Tests
pin bps summing to exactly 10,000, remainder-free allocation, and the four
kinds appearing exactly once each.

What makes it un-earnings, on purpose: the hero is a single 100% **allocation
bar** (four fixed categorical hues, labeled segments) where earnings has
payout tables and trend lines; shares speak **basis points**, which finance
never does; and a boundary card states the §5.7 rule where the reader is —
an Earning is one athlete's NIL compensation, a split is an edition
allocation, and keeping them apart is what stops a finance reconciliation
returning a minor's scholarship pool. The student-pool card repeats the §5.5
line: never paid to a student directly. Adjust-shares ships disabled naming
`P9-FE-05`.

65 frontend tests green (3 new), build and eslint clean, no page overflow at
390/470/768, screenshots eyeballed (one literal-backtick typo caught and
fixed). Board: `P1-FE-23` → Code review (HeckerCreatives, 2026-09-24).

## `P1-FE-30` — the points balance, and the tab goes live

*Code review. The student portal is now complete: all five tabs real.*

`/next/points`: violet balance hero (trophy, `pts`, CountUp) with the
next-SALES_500 meter; the accrual timeline ("written once, never edited" —
the §5.5 append-only shape rendered as fact); the earn vocabulary as a rules
card from a new `POINT_RULES` fixture (ARTICLE 50 · INTERVIEW 25 ·
APPOINTMENT 25 · SALES_500 100 · VIEWS_BONUS varies, the editor's call); and
a "what points are not" card. **No currency sign appears anywhere on the
page** — the same negative-space acceptance as splits, aimed at a parent.
"Redeem" ships disabled naming the genuinely open §14 question rather than a
wiring row: redemption is a business/legal decision, not a missing endpoint.

A new test pins fixed-value reasons to their rule's value, joining balance =
Σ accruals. The inert nav item and tab-bar slot went live; the dashboard's
points tile now links.

66 frontend tests green, build and eslint clean, no page overflow at
390/470/768, screenshots eyeballed. Board: `P1-FE-30` → Code review
(HeckerCreatives, 2026-09-24).

## `P1-FE-29` — the rights ledger, and the gate it feeds

*Code review. The last NEXT screen with no design dependency.*

`/admin/next/rights`: one table answering the production gate's one question —
*what may we do with this asset?* The hero shows **coverage per use**, because
print and digital are separate permissions (spec §5.3): Fall 2026 stands at
digital 6/9, print 5/9, which is precisely the digital-first-can-clear-while-
print-waits posture the spec designed for. The clearance queue names what is
missing and **who can grant it** (a guardian's print initials, an applicant's
enrolment-pending consent, a fresh acceptance for a use the original never
covered). The ledger renders per-permission marks, grant windows, and evidence
chips — consent acceptance vs negotiated licence, visually distinct.

Invariants added: **exactly one of acceptanceId/licenseRef per right** (the
spec's own rule — a right with both or neither is not evidence); **BTG content
pins `mayReuseCommercially` false** (V3 §6); every queue row names its gap and
its grantor. And the editions page's rights gate now **derives from the
clearanceQueue fixture** instead of a hardcoded "3" — one source, like
everything else on this edition.

69 frontend tests green, build and eslint clean, no page overflow at
390/470/768, screenshots eyeballed. Board: `P1-FE-29` → Code review
(HeckerCreatives, 2026-09-24).

## `P1-FE-27` — the free digital edition, readable

*Code review. Built despite the P1-ART-08 gate, deliberately: this is the one
design-gated screen the spec constrains hard enough that the rebuild risk is
minimal — principle 10 makes it a V1 product, and the acceptance forbids the
one thing a designer would add (a long-form type scale). Re-check against
ART-08 when it lands; noted on the row.*

`(public)/next/northside-high/fall-2026`: cover with a plain-anchor contents
(sections + minutes), then **the flatplan walked in page order** — articles on
the editorial pages, sold slots as sponsor cards, open slots as the house ad
that names the student sales model ("every ad in this magazine was sold by a
student — ask any of them for their code": the funnel, live from day one),
the 1-of-1 back cover pitch, and a masthead footer carrying the consent line.
Bylines carry class years, because a student's public portfolio is this page
existing.

Decisions worth keeping:

- **Reserved slots do not render.** A hold is not public information — the
  reader shows sold and open only.
- **Unknown editions 404.** One fixture edition exists; everything else is
  unreachable, which is the exact unpublished-is-unreachable behavior
  `P9-FE-07` later enforces against `EditionState`. The fixture behavior and
  the wired behavior agree by construction.
- **No new type scale** — prose is the house base/leading inside a measure.
  The named scope error, not committed.
- Two new invariants: every article opens on an *editorial* flatplan page,
  and **no byline belongs to an unapproved applicant** (caught live: the
  season-openers piece was first bylined to Maya Chen's fellow applicant
  Priya Nair, who isn't enrolled yet).

71 frontend tests green, build and eslint clean, no page overflow at 390/470,
screenshots eyeballed. Board: `P1-FE-27` → Code review (HeckerCreatives,
2026-09-24).

**Seven NEXT screens shipped today.** Stage 1's UI scaffold is now built
except the true audience-voice set — P1-FE-24, 25, 26 (public landing, apply
wizard, school adoption) and P1-FE-28 (claim flow) — which genuinely need
P1-ART-08 / the frontEndVersion2 rebuild before they're worth pixels.

## `P3-FE-01` — /join wired to the real API, the first Block B substitution

*Code review. With the NEXT scaffold done, the day pivoted from fixtures to
wiring — and the join wizard's own header had promised this seam from the
start: "P3-FE-01 wires the API and replaces only where answers go."*

The submit now POSTs through a **server action** — `API_URL` stays
server-side, per the api.ts rule that the browser has no business knowing the
address — to `POST /applications/intake`. Success carries the reference id
and continuation token into the localStorage draft and onto the submitted
screen; failure lands the API's field errors on the inputs they mean and
jumps back to the earliest offending step. The draft survives every failure.

**`draftToApplication` is pure and tested** (5 new cases): names join,
`stateCode` uppercases — with a new location-step check so "Maryland" fails
at the step instead of a round-trip — free-text level maps to the contract
enum or omits (guessing is worse), and the wizard's single follower total is
deliberately **not** split into per-account counts, because fabricated
provenance is worse than none (§22).

**A backend defect surfaced and fixed:** a `ZodError` carries no `status`, so
the error middleware answered a typo'd email with **500 internal_error** —
telling the caller we broke when they did. New `lib/error-body.ts` (pure,
"rules import nothing" pattern, 2 tests) maps validation to **400 with named
issues** for every contract route — the portals and §8's service account
alike.

**Verified end to end, not just by tests:** headless Chrome filled the real
wizard as a minor — the §4 guardian branch appeared (ten sections traversed;
an adult path is nine) — and the row landed in Postgres: SUBMITTED,
birthDate 2009-03-14, stateCode MD, school mapped from "team", the Instagram
handle stored SELF_REPORTED. Backend 1017 tests, frontend 76, build and lint
clean.

Board: `P3-FE-01` → Code review (HeckerCreatives, 2026-09-24). Eight rows now
sit at Code review from today. Google Sheet still needs its hand mirror at
end of day.
