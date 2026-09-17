# Design brief — Sponsor ROI report, print layout (`P1-ART-04`)

Paste this whole file into Claude Design.

---

## What to design

The campaign results report a sponsor receives at the end of a campaign, laid
out **for paper**. Screen 12 of the product already exists on screen; this is the
same report at print width, on US Letter, portrait.

**Design it as pages, not as a web page that happens to print.** Letter is
8.5 × 11 in — draw the full page including its margins, and design each page as
a composed page.

## Why paper matters here

The person who signs off the renewal is frequently not the person who logged
into SponsorX. Phase 1 sponsors are local businesses — a restaurant, a gym, a
car dealership — and the report has to be forwardable to a partner, taken into a
renewal conversation, and attached to an invoice. A campaign that worked but
cannot be shown to the person holding the budget is a campaign that does not
renew. A sponsor who leaves keeps the file.

The file is produced by the browser's own Save as PDF against a print
stylesheet — there is no rendering service. So the design must survive that:
real page breaks, no interactive controls, charts legible in flat print.

## Pages required

| # | Page | |
|---|---|---|
| 1 | Cover / summary | Campaign, sponsor, period, and the handful of numbers that answer "did this work?" |
| 2 | Delivery | What was promised against what was delivered, per athlete |
| 3 | Reach and content | By content format, by platform, top content |
| 4 | Reward funnel and markets | Scan → landing → claim → redeem, and where it happened |
| 5 | Provenance and method | Where every number on the preceding pages came from |
| 6 | Cover, the under-delivering case | The same cover when a campaign missed its targets |

Also design, as separate artboards:

- The **running header and footer** — what repeats on every page, including page
  numbers and the period the report covers.
- One **chart** in its print form, showing how a chart from the screen version
  is redrawn for flat print.

## The rules that shape it

**Provenance must survive into print.** Every number carries how it was
obtained: verified through a platform API, verified manually by BTG,
self-reported by the athlete, estimated, or attributed. A printed report that
silently drops the distinction between a verified number and a self-reported one
is worse than no report — that distinction is this project's stated credibility
risk. Design the mark so it survives greyscale, because a local business prints
in black and white.

**Page 5 is not an appendix to be skipped.** It is the page that makes the rest
trustworthy: for each metric, the source, the method, and the date it was last
checked.

**Design the bad news too.** Page 6 is the cover of a campaign that
under-delivered. It should be the same layout, honest about the shortfall,
without apology or spin — a report that only works when results are good is a
sales sheet, not a report.

**No colour-only signals.** A local business prints in black and white; every
state, delta and provenance mark needs a shape or a word as well as a colour.

**Nothing interactive.** No filters, no range pickers, no buttons, no hover
states, no "click to expand". If something needs explaining, it is printed.

**No invented figures.** Use labelled placeholders — `[VIEWS]`, `[ATHLETE]`,
`[SPONSOR]` — wherever a real number would go. Do not invent benchmarks or
industry averages; if a comparison appears at all it is marked as an estimate,
not presented as measured.

## Print specifics

- **US Letter portrait, 8.5 × 11 in.** Margins at least 0.5 in; 0.75 in on the
  bound edge if anything is stapled.
- **Body text no smaller than 10pt**; table and footnote text no smaller than
  9pt. Nothing at 7pt to make a table fit — drop a column instead.
- Design in **black on white**. This is the one SponsorX surface that is not
  dark-themed: dark backgrounds waste ink and grey out on a cheap printer.
- Brand colour is permitted as an accent — `#2E9BF5` blue and `#F97A1F` orange —
  but every page must still read correctly with all colour removed.
- Show where the page breaks fall. A table split across a break repeats its
  header; a chart is never split.

## Brand

Typeface **Poppins** (400 / 500 / 600 / 700), as the rest of the product. On
white, brand fills darken so text on them still clears 4.5:1 — use `#1E7CC8` for
blue and `#C25A0F` for orange where either carries small text. Ink is `#0A0C10`;
secondary text no lighter than `#555C6B` on white.

The SponsorX mark appears once on the cover and in the running header at small
size. Logo files are in `documentation/Design/marketing-visuals/exports/logos/`
(use the `-light` variants, which are drawn for white grounds).

## Constraints

- Real `<table>`, `<th>` and `<caption>` for tabular data — a printed report is
  read by people and by screen readers before it is printed.
- Text contrast 4.5:1 against its own background, and legible after greyscale
  conversion.
- No emoji. Icons as inline stroke SVG, and only where they carry meaning.
- No demographics, no sentiment, nothing real-time — Phase 1 has no source for
  them, so they cannot appear even as garnish.

## Done when

A print-width layout exists for screen 12 that survives PDF rendering.
