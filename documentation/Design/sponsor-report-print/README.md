# Sponsor ROI report, print layout — `P1-ART-04`

Screen 12 — the campaign results report — laid out for paper. US Letter
portrait, black on white, six pages plus the running header/footer and one chart
in its print form.

## What is here

| File | |
|---|---|
| [BRIEF.md](BRIEF.md) | The direction given to Claude Design |
| `pages/01-cover.png` | Cover and summary |
| `pages/02-delivery.png` | Promised against delivered, per athlete |
| `pages/03-reach-and-content.png` | By content format, by platform, top content |
| `pages/04-funnel-and-markets.png` | Scan → landing → claim → redeem, and where |
| `pages/05-provenance-and-method.png` | Source, method and last-checked date for every figure |
| `pages/06-cover-under-delivering.png` | The same cover for a campaign that missed its targets |
| `pages/A1-header-and-footer.png` | What repeats on every page |
| `pages/A2-chart-in-print-form.png` | A screen chart redrawn for flat print |

Designed in Claude Design on 2026-09-17 from `BRIEF.md`. PNG export only.

## Why it is black on white

G-07 (`P0-PMO-05`) decided the Phase 1 method: a **print stylesheet and the
browser's own Save as PDF**, not a rendering service. The report has to be
forwardable to whoever signs off the renewal, who is frequently not the person
who logged in. It will be printed by a local business on a cheap printer, so a
dark ground would waste ink and grey out. This is the one SponsorX surface that
is not dark-themed.

## The provenance system it establishes

Every figure carries a boxed letter that survives greyscale, with a legend on
the cover:

| Mark | |
|---|---|
| **V** Verified | Read from the platform's own API, or measured by SponsorX |
| **M** Manually verified | Checked by a BTG staff member against a screenshot or receipt |
| **S** Self-reported | Supplied by the athlete, not independently confirmed |
| **E** Estimated | Modelled, not measured — never presented as a measured figure |
| **A** Attributed | Derived from two verified figures; carries the weaker of the two |
| — | No mark means no figure was available. **Left blank, not zero.** |

Direction is carried by an arrow and words — ▲ over target, ▬ at target or no
target set, ▼ under target — never by colour alone, because the page is printed
in black and white.

"Attributed carries the weaker of the two" and "blank, not zero" are decisions
made by this design, not inherited from an earlier document. Both should be
enforced when `P7-BE-05` builds the report.

## Page 6 is the point

The under-delivering cover uses the **same layout, in the same order**, with
nothing softened or moved below the fold. It states the shortfall in the summary
band, adds "no figure below has been restated to compensate", and carries a
*What was agreed about the shortfall* panel naming the remedy, who agreed it and
when. Its closing line is the standard the whole report is held to: *a missed
number is reported with the same provenance as a met one.*

A report that only works when results are good is a sales sheet.

## Status

At **Code review**. Eight artboards delivered and checked against the brief; not
reviewed by a second person, and not yet tested through an actual browser
Save-as-PDF, which is the check that matters for `P7-BE-05`.
