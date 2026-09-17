# Design brief — Deliverable and approval states (`P5-ART-01`)

Paste this whole file into Claude Design.

---

## What to design

One record — a deliverable on a campaign — seen by three different people who
each need something different from it. The athlete who has to make it, the BTG
staffer who reviews it, and the sponsor who signs it off.

Design **every state of that record, for each of the three audiences**. The same
deliverable at the same moment should be recognisably the same thing across all
three, while showing each person only what they can act on.

**Athlete: phone, 390 × 844. BTG and sponsor: desktop, 1440 × 900.** Athletes
film, upload and check status on a phone. BTG review is a queue worked at a
desk. Sponsors approve at a desk.

## The states — these are fixed, do not invent or rename any

From §21, the deliverable state machine:

```
NOT_STARTED → DRAFT_SUBMITTED → BTG_REVIEW → SPONSOR_REVIEW
            → APPROVED → PUBLISHED → VERIFIED
```

| State | What has happened |
|---|---|
| `NOT_STARTED` | Created with the campaign order; the athlete has not uploaded anything |
| `DRAFT_SUBMITTED` | The athlete has uploaded a draft |
| `BTG_REVIEW` | Sitting in BTG's content approval queue |
| `SPONSOR_REVIEW` | BTG passed it to the sponsor |
| `APPROVED` | The sponsor signed off; not yet posted |
| `PUBLISHED` | The athlete posted it and the live URL was captured |
| `VERIFIED` | BTG confirmed the live post |

Two states also go **backwards**: `BTG_REVIEW → DRAFT_SUBMITTED` and
`SPONSOR_REVIEW → DRAFT_SUBMITTED`, both when changes are requested. Design
that return path — a rejected draft with nowhere to go is the failure this
covers.

`VERIFIED` is a measured fact, not a claim. Any metric shown against a verified
deliverable carries its own provenance mark.

## Screens required

| # | Screen | |
|---|---|---|
| 1 | State map | All seven states and both return paths, with who acts at each |
| 2 | Athlete — the deliverable | One deliverable, phone, showing how it changes across states |
| 3 | Athlete — changes requested | The return path: what they are told and what they do next |
| 4 | Athlete — upload | Submitting a draft |
| 5 | BTG — review queue | Many deliverables awaiting review, desktop |
| 6 | BTG — reviewing one | Approve, request changes, and what BTG sees that others do not |
| 7 | Sponsor — awaiting sign-off | The sponsor's queue |
| 8 | Sponsor — reviewing one | Approve or request changes, with the campaign's terms to hand |
| 9 | All three, side by side | The same deliverable in `SPONSOR_REVIEW`, as each audience sees it |

## The rules that shape it

**Same record, three truths.** Show each audience what they can act on and hide
what they cannot. A sponsor never sees what the athlete is paid. BTG sees
everything. The athlete sees their own deadline and their own state, never
another athlete's.

**Waiting is a state too.** Most of a deliverable's life is spent waiting on
somebody else. Each audience should be able to tell at a glance whether the ball
is in their court, and if it is not, whose it is and since when.

**Changes requested is not a failure screen.** It is the normal middle of the
process. Design it as a next step with the reason attached, not as an error.

**A deadline exists throughout.** The athlete agreed a turnaround when they
accepted the order. Show time remaining, and show it differently once it has
passed — an overdue deliverable is what under-delivery is made of.

**No invented metrics.** Views, engagement and similar appear only on
`PUBLISHED` and `VERIFIED`, and only with a provenance mark — verified through
the platform, verified manually by BTG, or self-reported. Nothing real-time, no
demographics, no sentiment: Phase 1 has no source for them.

## Brand

Dark theme, primary.

| Token | Value | Use |
|---|---|---|
| Ground | `#0A0C10` | page background |
| Surface | `#12151D` | cards, rows |
| Surface 2 | `#1A1F2B` | raised panels |
| Line | `#242A38` | borders |
| Text | `#F4F5F7` | body |
| Muted text | `#8A90A2` | labels, secondary |
| Athlete accent | `#2E9BF5` | blue — the athlete's screens |
| Sponsor accent | `#F97A1F` | orange — the sponsor's screens |
| Admin accent | `#CBD5E1` | steel — BTG's screens |
| Warn | `#FACC15` | waiting, changes requested, approaching deadline |
| Success | `#22C98D` | approved, published, verified |
| Danger | `#FF4D4F` | overdue |

Each audience's screens carry their own accent, so a screenshot is identifiable
without a caption. Typeface **Poppins** (400 / 500 / 600 / 700). Label ink on a
blue or orange fill is `#0A0C10`, not white.

## Constraints

- Real `<button>`, `<a href>`, `<input>` + `<label>`. Touch targets at least
  44px on the athlete's screens.
- Text contrast 4.5:1 against its own background, not against the page ground.
- A state's colour is never its only signal — pair it with a word.
- No emoji. Icons as inline stroke SVG.
- No invented statistics, sponsor names or athlete results beyond the fixtures
  named above; where a real figure is missing, use a labelled placeholder.

## Done when

Every deliverable state has a designed presentation for the athlete view, the
BTG view and the sponsor view.
