# Deliverable and approval states — `P5-ART-01`

One record — a deliverable on a campaign — designed for the three audiences who
each need something different from it: the athlete who makes it, the BTG staffer
who reviews it, and the sponsor who signs it off.

## What is here

| File | |
|---|---|
| [BRIEF.md](BRIEF.md) | The direction given to Claude Design |
| `screens/01-state-map.png` | Seven states, both return paths, who acts at each |
| `screens/02-athlete-deliverable.png` | The deliverable on a phone, across states |
| `screens/03-athlete-changes-requested.png` | The return path, from the athlete's side |
| `screens/04-athlete-upload.png` | Submitting a draft |
| `screens/05-btg-review-queue.png` | BTG's queue |
| `screens/06-btg-reviewing-one.png` | BTG reviewing a single deliverable |
| `screens/07-sponsor-awaiting-signoff.png` | The sponsor's queue |
| `screens/08-sponsor-reviewing-one.png` | The sponsor reviewing one |
| `screens/09-all-three-side-by-side.png` | The same deliverable in `SPONSOR_REVIEW`, all three views |

Designed in Claude Design on 2026-09-17 from `BRIEF.md`. PNG export only; the
editable source stays in the Claude Design project.

## The states it was built on

Taken verbatim from `documentation/diagrams/state-machines/05-deliverable.mmd`:

```
NOT_STARTED → DRAFT_SUBMITTED → BTG_REVIEW → SPONSOR_REVIEW
            → APPROVED → PUBLISHED → VERIFIED
```

Both derived return paths are designed, not just drawn: `BTG_REVIEW →
DRAFT_SUBMITTED` (BTG acts, athlete re-uploads) and `SPONSOR_REVIEW →
DRAFT_SUBMITTED` (sponsor acts, the reason passes through BTG to the athlete).
The second is the more interesting one — the sponsor's rejection is not
delivered raw to the athlete.

## The part worth keeping beyond the visuals

Screen 09 is effectively a **field-level visibility matrix** for a deliverable,
written as three columns:

- **Shared by all three** — the deliverable name, the state word, who holds the
  ball and since when. Same record, same moment, same vocabulary.
- **Hidden from the sponsor** — athlete fee, campaign margin, BTG's internal
  checks and notes, anything on another campaign.
- **Hidden from the athlete** — margin, the sponsor's SLA clock, BTG's checklist
  state, every other athlete's deliverable.

That is a direct input to `P4-SEC-02` (field-level authz on sponsor surfaces)
and to the audit `P1-FE-05` already ran on fixtures. It should be read as a
proposal to enforce, not as decoration.

The design also makes **waiting legible**: each view leads with whose court the
ball is in and for how long, and BTG's view carries both clocks — the sponsor's
SLA and the athlete's deadline — with the option to chase the sponsor or pull
the deliverable back to BTG review.

## Known issue

The per-screen title band at the top of each export renders near-white on white
and is barely legible. It is export furniture rather than part of any screen, but
it should be fixed before these are shown to anyone outside the team.

## Status

At **Code review**. Nine screens delivered and checked against the brief; not
reviewed by a second person, no contrast audit run.
