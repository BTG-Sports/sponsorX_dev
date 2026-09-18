# Does the PDF Worker Have a Real Requirement?

**Task `P0-PMO-06` · Version 0.1 · 2026-09-15 · Status: recommendation, for business confirmation**
**Depends on `P0-PMO-05` (G-07) — read that first.**

---

## Why this is being asked at all

A PDF-rendering worker shaped the hosting architecture. It is the reason the
deployment is two services rather than one, and it carried weight in the hosting
choice.

**It appears nowhere in the Master Development Blueprint's 39 sections.** Not in
§38's deliverables, not in the analytics sections, not in the sponsor report
sections. A component that influenced an infrastructure decision, while being
required by no written requirement, is worth stopping over once.

## Finding

**No stated Phase 1 requirement exists for server-side PDF rendering.**

The genuine need behind it — that a sponsor must be able to keep and forward
their campaign report — is real and is confirmed in G-07. But that need is met by
a print stylesheet on the existing report screen. It does not require a worker.

The distinction is narrow and worth stating precisely:

- **A sponsor needs a file.** True, and evidenced: the renewal decision is often
  made by someone who never logs in.
- **The system needs to produce that file unattended.** Not true today. Nothing
  in Phase 1 emails a report on a schedule or attaches one to an invoice
  automatically. Every Phase 1 report is produced because a person asked for it,
  and that person has a browser.

## Recommendation

**Drop the PDF worker from Phase 1.** Keep the worker service itself — it is
required regardless for the job queue, Zoho sync, metric rollups, geo resolution
and image derivatives. Only the PDF-rendering job is dropped.

Concretely this removes a Playwright install, a headless browser on the worker,
a rendering job with its own failure and retry behaviour, and storage for
generated files.

## What would bring it back

Adopt it when one of these becomes a real requirement, not before:

- A report must be **emailed on a schedule**, without a person present.
- A report must be **attached automatically** to a Zoho invoice.
- A report must be **archived as an immutable artefact** — a rendered file kept
  as the record of what the sponsor was told at a point in time.

The third is the most likely to arrive, and it is the one worth watching: the
moment a sponsor disputes what a report said, a stored render stops being a
convenience.

## The correction worth recording

The architecture was shaped by a component nobody had asked for. The lesson is
not about PDFs — it is that **an infrastructure decision should name the written
requirement it serves.** Had that been asked at the time, the second service
would have been justified by the job queue alone, which is a sound reason and
happens to reach the same architecture.

## Confirmation

| | |
|---|---|
| **PDF worker in Phase 1** | Drop / Keep |
| **If keeping, the requirement it serves** | |
| **Confirmed by** | |
| **Date** | |

*References: Addendum A10; Blueprint §38 (absence is the finding);
`.claude/stack-decision.md`. Implements `P0-PMO-06`.*
