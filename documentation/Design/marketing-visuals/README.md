# Marketing site visual assets — `P1-ART-06`

Imagery and visual treatments for the public marketing site: the hero, the slots
where proof and case studies will sit, how the six sponsorship packages are
presented, and a flat redraw of the logo for screen use.

## What is here

| File | |
|---|---|
| [BRIEF.md](BRIEF.md) | The direction given to Claude Design |
| `exports/01-hero-desktop-1440.png`, `02-hero-phone-390.png` | The hero, both widths |
| `exports/03-proof-slot.png`, `03b-proof-slot-phone.png` | The repeatable proof card |
| `exports/04-case-study-section-1440.png` | Three slots as the homepage shows them |
| `exports/05-packages-1440.png`, `05b-packages-phone-390.png` | The six packages |
| `exports/06-package-detail-1440.png`, `06b-package-detail-phone-390.png` | One package in detail |
| `exports/07-logo-assets.png` | The logo sheet — every lockup, dark and light |
| `exports/logos/` | The logo files themselves: SVG, favicon and app icon, with their own README |

Designed in Claude Design on 2026-09-17 from `BRIEF.md`. The package screens are
a second pass; the first invented a different six-package model and priced it in
pounds, because the brief had not said what the six packages are.

## What the design commits to

**Nothing is invented.** The hero carries `[NUMBER]` placeholders rather than
statistics, a `[SPONSORX LOGO]` slot in the first pass and the real redrawn mark
now, and a photo slot with a written direction for the shot — "a single school
or college athlete, shot on a dark ground, training or competing, mid-effort,
not posed. Real athlete on the platform, with release. No stock." The
case-study slots are structure with `[SPONSOR NAME]` and `[RESULT]`
placeholders, because BTG has no case studies yet.

**The packages are the §7 six**, by name, in US dollars, at their real athlete
counts. Each card says *"Deliverables not yet defined — no NIL job codes
assigned to this package"* rather than listing features that do not exist, and
Local Blitz and 10-Athlete Blitz both carry an `OVERLAP` chip. A closing panel
names what is unsettled: the two packages are indistinguishable at $2,500 with
ten athletes, and "iMC/BTG feature" appears in three descriptions without being
a NIL job or carrying a cost line.

**The action is *Request a brief***, never a purchase — correct for a managed
Phase 1 marketplace.

## Two things to resolve before any of this ships publicly

**The honesty markers are internal language on a customer-facing page.** A
sponsor reading "no NIL job codes assigned to this package" learns that BTG has
not decided what it is selling. The design is right to refuse to fabricate the
content, but the fix is the pricing decision `P0-PMO-10` asks for — assign each
package its job codes and counts — not styling the markers away.

**The logo SVGs reference their typeface by name.** They are set in Barlow
Condensed 800 italic as a stand-in for the original heavy condensed italic, so a
machine without that font renders a fallback. Before they go into `public/`, the
real brand typeface should be substituted if one exists, the type converted to
outlines, and each viewBox refitted. This is recorded in
`exports/logos/README.md` by the designer, not discovered later.

## Status

At **Code review**. All seven assets delivered and checked against the brief;
not yet reviewed by a second person, and no contrast audit run beyond the
per-file colour notes the logo README carries.
