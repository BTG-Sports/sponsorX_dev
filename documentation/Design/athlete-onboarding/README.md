# Athlete onboarding flow — `P1-ART-07`

The §11 ten-section athlete application, designed as a progressive flow for
phone (390 × 844), including the guardian branch for minors (§4).

## What is here

| File | |
|---|---|
| [BRIEF.md](BRIEF.md) | The direction given to Claude Design — screens required, brand tokens, content rules, acceptance |
| `screens/00-flow-map.png` | All ten sections at a glance, with the branch marked |
| `screens/01-identity.png` … `screens/10-agreement.png` | One per §11 section, in order |
| `screens/11-after-submit.png` | Submitted → under review → decision, with the guardian-pending state |

## Provenance

Designed in Claude Design on 2026-09-17 from `BRIEF.md`, in the project
`claude.ai/design/p/c0570fc3-5743-486f-b69a-b82c1ac07e3c`
(`SponsorX Athlete Onboarding.dc.html`), and exported as PNGs.

**The editable `.dc.html` source is not in this folder** — the export contained
the rendered screens only. To bring the source across, a one-time
`/design-login` from an interactive Claude Code session on this machine lets the
project be read directly rather than downloaded. Until then, changes are made in
the Claude Design project and re-exported, not edited here.

## What the design commits to

- **One branch, not two flows.** A date of birth under 18 on section 1 inserts
  section 8 and changes nothing else about the sequence.
- **Section 7 is the enforced one.** Restrictions and conflicts are marked as
  binding on every campaign, and visibly distinguished from section 6, which is
  a preference used for fit scoring only.
- **Section 9 states what is never asked for** — no bank account or routing
  number, no card, no Social Security or tax ID — because money moves outside
  SponsorX in Phase 1 (§26, Addendum A6).
- **Section 10 is click-wrap** against draft wording, recording the version
  shown. G-05 stopped being a gate on 2026-09-15, so acceptance is not blocked
  on counsel.
- **Submission is not approval.** Screen 11 separates BTG's manual review from
  the guardian confirmation, which blocks accepting a campaign rather than
  approval itself.

## Feeds

`P3-FE-01` builds `/join` against this. The route already exists on fixtures
(`applicationSections` in `src/lib/fixtures.ts`), so the design is a visual
target for a page that is structurally built, not a specification for new
routes.
