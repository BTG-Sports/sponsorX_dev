# `/join` athlete onboarding wizard — design spec (P1-ART-07 in-app)

**Date:** 2026-09-21 · **Task:** implement the P1-ART-07 athlete-onboarding
design as the real `/join` experience · **Scope decision:** interactive flow,
fixtures-only (no API/DB — that is `P3-FE-01`), drafts persist to
localStorage.

## What this replaces

`src/app/(public)/join/page.tsx` today is a static, no-JS, single-scroll
stack of all ten §11 sections with a disabled submit. The accepted P1-ART-07
design (`documentation/Design/athlete-onboarding/`) is a **phone-first
progressive wizard** — one section per screen, saved-as-you-go, one branch
for minors, click-wrap agreement, and a distinct after-submit state. This
spec brings that design into the app at awwwards-level polish.

## Architecture

One client island, step-state routed, with a pure flow module.

| Unit | Purpose |
|---|---|
| `src/app/(public)/join/page.tsx` | Thin server frame: resolves `from`, reads `?demo=`, renders the island. |
| `src/lib/join-flow.ts` | **Pure, unit-tested.** Section definitions (heading, subtext, fields, types), `isMinor(dob)`, `visibleSections(isMinor)`, per-section validation, draft (de)serialization, restriction categories, agreement v0.4 body, timeline copy. Absorbs and supersedes `applicationSections` in `fixtures.ts`. |
| `src/components/join-wizard.tsx` | `"use client"` island. Owns phase (`intro → steps → submitted`), current step, answers, minor branch, localStorage draft, progress header, directional step transitions, focus management. Renders generic field steps from data. |
| `src/components/join-restrictions-step.tsx` | The ENFORCED step: existing-deal cards (add/remove), six category toggle chips, enforcement copy. |
| `src/components/join-agreement-step.tsx` | DRAFT click-wrap: scrollable v0.4 terms, accept checkbox recording version + timestamp, gates Submit. |
| `src/components/join-submitted.tsx` | After-submit: Submitted → Under review → Decision timeline, guardian-pending card (minors only), "while you wait" links. |

## Flow logic (all in `join-flow.ts`, all pure)

- `isMinor(dob)`: date of birth < 18 years at entry. Invalid/partial DOB →
  not minor (the notice appears only on a parseable under-18 date).
- `visibleSections(isMinor)`: the ten §11 sections; guardian (`§4`) present
  only when minor. "Section N of M" and the progress segments derive from
  this list — never hardcoded.
- Validation per section: required fields non-empty; identity additionally
  needs a parseable DOB and an email containing `@`. "Save and continue"
  validates; errors render inline per-field (danger text + border), focus
  moves to the first invalid field.
- Draft: one localStorage key `sx-join-draft-v1` holding
  `{ answers, deals, excludedCategories, accepted?, phase, step }`.
  Serialize on every step commit ("saved after every section" — true).
  Hydrate on mount, SSR-guarded. `Save and finish later` commits the current
  (even invalid) field values and returns to the intro with a "resume"
  affordance. Submitted state clears the draft.
- Agreement: click-wrap against **v0.4 draft** wording, labelled DRAFT, with
  the note that acceptance records date/time and the exact version shown.
  Submit enables only when ticked. **The old "blocked until counsel" gate is
  dropped** — G-05 stopped being a gate on 2026-09-15 (design README);
  `fixtures.ts` copy is updated to match.
- Submit (fixtures-only): transition to `submitted`, no POST. Guardian
  pending card only for minors. `?demo=submitted` and `?demo=minor` let
  reviewers land on those states directly.

## Screens, faithful to the comps

- **Intro (flow map, `00`)**: "ATHLETE APPLICATION / Ten sections / about
  8 minutes, saved after every section". Vertical rail of the ten steps —
  step 7 orange-ringed with "Enforced on every campaign", step 8 a dashed
  conditional node with the branch explanation card, terminal green check
  "Submitted — reviewed by hand". Full-width primary CTA **Start
  application** (resumes if a draft exists, with a "start over" secondary).
- **Step chrome (`01`–`10`)**: back chevron (→ previous step, or intro from
  step 1), centered "Section N of M", green-dot "Progress saved" indicator,
  ten (or nine) segmented progress bars — filled primary, **section 7's
  segment fills accent orange**. Heading + one-line subtext per comp. Sticky
  bottom action bar: primary **Save and continue**, ghost **Save and finish
  later**.
- **Identity (`01`)**: legal first/last (two-up), DOB, email, phone. A
  parseable under-18 DOB expands the orange notice ("You're 17, so one extra
  section is added…") and inserts the guardian segment live.
- **Restrictions (`07`)**: orange ENFORCED chip, "blocked — not
  deprioritised" copy, deal cards (name, category · exclusivity · until,
  derived "…campaigns are blocked while this is active" line, remove ×),
  dashed **+ Add another deal** row opening inline fields, category chips
  (Betting, Alcohol, Energy drinks, Supplements, Crypto, Weight loss) that
  toggle to orange-checked. Footer: "You can update restrictions at any time
  from your profile."
- **Payment (`09`)**: recipient name only, plus the plain statement of what
  is never asked for — no bank account, no card, no SSN or tax ID; money
  moves outside SponsorX in Phase 1 (§26, A6).
- **Agreement (`10`)**: "The agreement" + yellow DRAFT chip, v0.4 wording
  note, scrollable terms card (5 short numbered clauses), accept checkbox
  row, recording note, Submit (disabled until ticked).
- **Submitted (`11`)**: green check, "Application submitted / Submitting
  isn't approval — a person at BTG reads every application, usually within
  3 business days", three-node timeline (Submitted · timestamped → Under
  review · yellow → Decision), guardian-pending card (yellow, Resend email /
  Change guardian buttons — visual only), "While you wait" rows (Review your
  answers → read-only walkthrough; Update restrictions → jumps to step 7).

## The wow layer — awwwards-level craft

Extends the existing motion system (`sx-*` keyframes, `cubic-bezier(0.22, 1,
0.36, 1)` spring ease, `data-reveal` convention). Every effect is one-shot,
CSS-driven where possible, and fully disabled under
`prefers-reduced-motion` (the existing global guard pattern).

1. **Stage presence.** The wizard column (max-w-[420px], centered) sits on
   the ground with a fixed, very-low-opacity radial glow behind it — primary
   blue at the top drifting to accent orange low-right; the glow hue shifts
   subtly as the athlete passes section 7 (the enforced beat). Pure CSS
   custom-property crossfade, no canvas.
2. **Intro choreography.** The rail draws itself: the connecting line scales
   Y from 0, step rows cascade in ~45ms apart (fade-up), step 7's ENFORCED
   tag and step 8's dashed node land with their own delayed beats, the
   terminal check draws its stroke. CTA has a slow sheen sweep on hover.
3. **Directional step transitions.** Forward: outgoing section slides
   12px left + fades, incoming slides in from right with its fields
   cascading 35ms apart. Back reverses direction. 380ms, spring ease,
   transform/opacity only.
4. **Progress bar life.** Completed segments fill with a left-to-right wipe;
   the active segment breathes (slow opacity pulse); when the minor branch
   inserts a segment, the bar visibly re-layouts (animated flex-grow) and
   the "Section N of M" counter ticks over — the "one branch" rule made
   visible.
5. **Save confirmation.** On each commit the header dot pops (sx-pop) and
   the label microswaps "Saving…" → "Progress saved" with a 300ms fade —
   honest theatre for the localStorage write.
6. **Minor-branch moment.** The orange notice expands with a height+fade
   spring; the guardian row in any visible rail gains its dashed ring with
   a pulse. This is the flow's signature moment and gets the most care.
7. **Chip & card physics.** Category chips scale-pop on toggle with the
   check drawing in; deal cards animate out on remove (height collapse +
   fade); the add-deal row's dashed border animates to solid on open.
8. **Agreement arming.** The checkbox tick draws (SVG stroke-dashoffset);
   when ticked, Submit transitions from 40% ghost to full primary with a
   single sheen sweep — the button visibly "arms".
9. **Submit → submitted.** The success circle+check draws its stroke
   (existing `sx-viz-draw` pattern), then timeline nodes cascade, then the
   guardian card slides up. A single 900ms choreographed sequence.
10. **Focus & touch.** Focus rings transition smoothly; all targets ≥44px;
    focus moves to the step heading on every transition
    (`tabIndex={-1}` + programmatic focus) so screen readers track the step
    change; `aria-live="polite"` on the "Section N of M" label.

**Not doing:** parallax, cursor followers, looping ambient animation,
scroll-jacking, third-party motion libraries. The design language is
restraint — one signature moment per screen.

## Accessibility & conventions

Real `<label>`/`<input>`/`<button>` throughout; text contrast ≥4.5:1 against
its own background (existing token system already satisfies this); no emoji,
icons as inline stroke SVG; light theme inherits automatically from the
`--sx-*` variables. Followers/handles marked self-reported (§22). No
invented statistics.

## Fixtures & docs touched

- `join-flow.ts` owns flow data; `fixtures.ts` `applicationSections` shrinks
  to a re-export or is removed (single consumer today is the old page) — its
  "blocked until counsel" copy is corrected either way.
- Task board: add/complete the FE row for this build (new row, fractional
  Order), per the daily rule.
- `memory/2026-09-21/` log entry.

## Testing

- **Unit (vitest):** `join-flow` — `isMinor` boundary (18th birthday today →
  not minor), guardian insertion/renumbering, per-section validation
  including identity's DOB/email rules, draft round-trip, draft-clear on
  submit.
- **Driven check:** dev server — intro renders the ten-step rail; stepping
  through as an adult shows 9 sections, as a minor 10; refresh mid-flow
  restores the draft; agreement gates submit; `?demo=submitted` and
  `?demo=minor` land correctly; `tsc`, eslint, `next build` clean.
- **Human pass:** motion feel on a real phone viewport, reduced-motion
  verification.
