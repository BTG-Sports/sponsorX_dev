# Baseline Memory Reconciliation

**Task `P0-PMO-12` · Version 0.1 · 2026-09-15 · Status: done**

Unlike the other Stage 0 documents, this task's deliverable is a **set of repo
edits**, not a decision. This page is the record of what was changed and why.

---

## The problem

`Memory/Initial Memory/` is the baseline snapshot every new contributor reads
first. It was written on 2026-09-10 and parts of it had since become wrong —
not vague, but actively misleading. Someone reading it in good faith would have
built the wrong thing.

Three files were stale.

## 1 · `02-confirmed-tech-stack.md` — the stack

**Was:** Node.js + Express as a separate backend service, Redis + BullMQ for the
queue, MinIO for object storage, application-managed auth, hosting unspecified.

**Now:** the current stack — Next.js route handlers under `/api/v1` as one
service, Railway (`web` / `worker` / `postgres`, region `us-east4-eqdc4a`),
Prisma 7, **Postgres as the job queue with no Redis**, Cloudflare R2 (`ENAM`),
Clerk for identity only with authorization in Postgres, Zoho for sales and
invoices, Resend for transactional email, no SMS.

The superseded table is **kept at the bottom of the file**, clearly labelled, with
a note on why each component changed. Deleting it would have destroyed the
reasoning; leaving it unlabelled was the original problem.

The file now states plainly that `.claude/stack-decision.md` is the source of
truth and wins any future disagreement.

## 2 · `04-key-decisions-and-findings.md` — the open discrepancy

This file carried a section headed *"⚠️ Open discrepancy — stack baseline vs.
current CLAUDE.md"*, which correctly identified the problem above and
deliberately did not fix it, pending team agreement.

That section is now replaced with a resolution note recording what was done. The
flag did its job — it is being closed, not deleted.

## 3 · `03-rules-and-workflow.md` — a rule that had been reversed

**Two corrections here, and the first is the one that actually cost time.**

The file stated: *"No spreadsheet is committed. `documentation/*.xlsx` is
gitignored."* **That rule was reversed on 2026-09-14** because it did not work:
the Google Sheet is not reachable from the Drive connector and is only mirrored
by hand at end of day, so there was no shared working status anywhere. Two
developers spent that day updating two different private copies, neither able to
see the other's work.

The rule now reads correctly — the tracker at
`Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx` **is** committed, with
the binary-merge guidance that goes with it.

Also corrected: the task count, from 344 to **345** — 336 delivery tasks across
the four phase sheets plus 9 legal tasks moved to their own `Legal` sheet on
2026-09-15.

## What was deliberately left alone

`01-project-overview.md` and `05-documents-produced.md` describe what the
project *is* and what was produced, and neither has gone stale in a way that
misleads.

`03-rules-and-workflow.md` also records a Windows/PowerShell environment and an
older user email under "Global user context". Those are contributor-specific
facts rather than project rules, and correcting them for one person's machine
would make the file wrong for the next. Flagged here rather than edited.

## The pattern worth noticing

All three staleness cases share a cause: **a decision was made somewhere else —
in `CLAUDE.md`, in `stack-decision.md`, in a day's work — and the baseline was
never told.** The baseline is the one document that claims to be a complete
snapshot, which is exactly why a stale entry in it is more damaging than a stale
entry anywhere else.

The standing rule already in `00-README.md` covers this ("update the baseline
only when foundational facts change"). It was not followed for the stack
decision. Worth saying once: a hosting change is a foundational fact.

*Implements `P0-PMO-12`. Files changed: `Memory/Initial Memory/02`, `03`, `04`.*
