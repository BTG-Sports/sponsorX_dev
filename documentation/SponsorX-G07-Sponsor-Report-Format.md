# Decision G-07 — Sponsor Report Deliverable Format

**Task `P0-PMO-05` · Version 0.1 · 2026-09-15 · Status: recommendation, for business confirmation**

---

## The question

Does a sponsor need a **downloadable PDF** of their campaign report, or is the
on-screen report (screen 12) enough?

This is not a presentation preference. It decides whether a whole PDF-rendering
job gets built, and that job is the single reason the architecture carries a
separate worker service.

## Recommendation

**A file is required. The on-screen report alone is not enough.**

The reason is who reads the report, not what it contains. Phase 1 sponsors are
local businesses — a restaurant, a gym, a car dealership. The person who signs
off the renewal is frequently **not** the person who logged into SponsorX. A
report that exists only behind a login cannot be forwarded to a partner, taken
into a renewal conversation, or attached to an invoice. A campaign that worked
but cannot be shown to the person holding the budget is a campaign that does not
renew.

There is also a retention argument: a sponsor who leaves keeps the file. The
report is the artefact that makes the next sale, and it should outlive the
account.

## But it does not have to be a rendered PDF in Phase 1

The two are separate decisions, and conflating them is what made the PDF worker
look inevitable.

| Option | What it costs | What it gives |
|---|---|---|
| **A — Print stylesheet.** The existing report screen, styled for print; the sponsor uses the browser's Save as PDF. | Hours. No worker, no new dependency. | A file the sponsor can forward. Exact fidelity to what they saw. |
| **B — Server-rendered PDF.** A worker job renders the report headlessly and stores the file. | A worker service, a Playwright install, a job, storage, a failure mode. | The same file, plus the ability to email it unattended and archive it. |

**Recommended: start with A, and adopt B only when something actually needs a
file generated without a person present** — a report emailed on a schedule, or
attached automatically to an invoice. Neither is a Phase 1 requirement today.

Option A satisfies the sponsor need identified above. Option B satisfies an
operational need that has not yet been stated.

## What must be true for Option A to hold

- The report screen must carry a print stylesheet that produces a clean page:
  no navigation, no interactive controls, charts rendered legibly in print, page
  breaks in sensible places.
- Provenance labels must survive into print. A printed report that silently drops
  the distinction between a verified and a self-reported number is worse than no
  report, and that distinction is the project's stated credibility risk.
- The layout work is already scheduled as `P1-ART-04` (sponsor ROI report layout
  for print/PDF), so the design effort is committed either way.

## Consequence for the architecture

If this recommendation is accepted, **the PDF worker has no Phase 1 requirement**
— which is the question `P0-PMO-06` asks directly and can now be answered.

## Confirmation

| | |
|---|---|
| **A file is required** | Yes / No |
| **Phase 1 method** | Print stylesheet (A) / Server-rendered PDF (B) |
| **Confirmed by** | |
| **Date** | |

*References: Addendum A10; Blueprint §38; screen 12. Implements `P0-PMO-05`.
Feeds `P0-PMO-06` and `P1-ART-04`.*
