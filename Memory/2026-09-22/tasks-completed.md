# 2026-09-22 — tasks completed

## Board repair — seven closed rows, six stale Blocked rows

Yesterday's four B1 tasks were merged but their rows were still at Code
review, and the dependents of a finished task were still Blocked. Both were
corrected before starting new work.

**Code review → Done** for the seven rows owned by `rcfworks`: `P2-BE-02`,
`P2-OPS-03`, `P2-OPS-09`, `P3-BE-01`, `P3-BE-03`, `P3-BE-06`, `P3-INT-01`.
`Date Done` is the day each landed — 2026-09-18 for the P2 rows, 2026-09-21
for the four B1 rows — not the day the row was closed.

**The nine `HeckerCreatives` rows were left alone**, and so was `P0-OPS-07`.
They were closed once on 2026-09-21 and reverted within minutes: Code review
means a second pair of eyes has looked at the work, and closing a teammate's
row asserts a review that never happened. That reasoning holds whoever is
asking.

**Blocked → Ready** for the six rows whose only dependency was now Done:
`P3-BE-04`, `P3-BE-05`, `P3-BE-07`, `P3-BE-10`, `P3-FE-01` (all behind
`P3-BE-01`) and `P3-SEC-01` (behind `P3-BE-03`). The board does not do this
itself — a completed task leaves its dependents sitting Blocked until someone
looks.

**One row is still stale and was deliberately not touched:** `P4-BE-01`
depends only on `P2-BE-04`, which is Done. It is outside the set that was
asked for.

### A trap worth knowing about, hit twice today

**`openpyxl` cannot mutate `ConditionalFormatting.sqref` in place.** The
object is a dict key, so editing its range leaves the key stale and
`wb.save()` raises `KeyError` *part-way through writing* — which truncated
the 152 KB workbook to 7 KB. The backup taken before editing is what made
that a non-event. Capture the rules, replace
`ws.conditional_formatting` with a fresh `ConditionalFormattingList`, and
re-add each range. **Always copy the workbook into the scratchpad first.**

**Row 205 (`P0-PMO-14`, raised earlier today) was outside four hardcoded
ranges** — the Dashboard's `COUNTIF`/`COUNTA`/`SUMIF`, two conditional
formatting ranges and the Status data-validation list all stopped at 204, so
the Dashboard was silently undercounting Phase 1 by one row. All extended to
205. This is the failure mode `CLAUDE.md` warns about, and it happens on every
insert.

## `P3-BE-07` — application review, audited and notified in one transaction

*Code review. Roadmap Block B1. Unblocks `P3-FE-02`, `P3-INT-02`, `P3-QA-01`.*

Yesterday's `P3-BE-01` built the state machine and `P3-INT-01` built the
queued `send()`. Neither was reachable: `routes/v1/` held only `me` and
`openapi`, so no admin could actually decide an application. This closes the
approve half of B1's exit criterion.

### What was built

`backend/src/domain/application-review.ts` — `reviewApplication()` and three
named wrappers `approveApplication`, `requestChanges`, `rejectApplication`,
plus `beginReview` (SUBMITTED → UNDER_REVIEW). `beginReview` is not one of the
three admin actions, but §21 permits the three destinations only out of
UNDER_REVIEW, so without it none of them is reachable.

`backend/src/routes/v1/applications.ts` — the first feature router. The review
queue (scoped, oldest first, optional `?state=`), one application, and four
decision endpoints. No business rule lives in it: a rule enforced in the
router exists only for HTTP callers, leaving §8's service account outside it.

`backend/src/auth/scope.ts` — an `athleteApplication` filter delegating to the
`athlete` one. The application *is* the Athlete row — §21's lifecycle lives in
`Athlete.state` and there is no separate model — but they stay two resources
in the matrix because they are two different permissions. NETWORK_MGR may
approve an application; SPONSOR_ADMIN may read an assigned athlete and must
never see an application at all.

`backend/src/config/env.ts` — `APP_URL`, so the portal link in a notification
points at the environment that sent it rather than a constant.

### Two decisions worth recording

**`transitionAthleteIn()` now takes the caller's transaction.** The acceptance
is "every transition is audited **and notifies the applicant**" — three writes
that must commit together, and Prisma has no nested interactive transaction.
So the body moved into a `tx`-taking form and `transitionAthlete()` became the
wrapper for callers with nothing else to do. There is still exactly one
function that changes `Athlete.state`, which was `P3-BE-01`'s whole invariant;
it takes the transaction as an argument now, like `audit` and `enqueue`.

**The reviewer's note was being audited but never stored.** `P3-BE-01` passed
`reviewerNotes` into the audit payload and dropped it. The column exists —
§11 §10, already in the schema, no migration needed — and the applicant's own
screen reads it when the state is CHANGES_REQUESTED. A note that lives only in
the audit log means being told to fix something without being told what. The
transition now writes `reviewerNotes` and `reviewedAt` whenever the
destination is a review decision.

**Approval is not activation.** APPROVED and ACTIVE stay different states:
§37's guardian gate sits between them and `transitionAthlete` enforces it. A
minor passing review is correct; a minor taking paid work without a verified
guardian is what the gate forbids. A test asserts the minor case stops at
APPROVED.

**The idempotency key is the decision, not the clock.** The state machine
already makes a second identical decision impossible — after APPROVED there
is no legal move from UNDER_REVIEW — so keying on the destination state means
a retried outbox drain cannot duplicate the message, while a genuinely
different decision later is a different key and does send.

### Verification

30 new unit cases, all green. They run the real domain function against a
transaction stub that **buffers writes and discards them when the callback
throws** — a stub that committed on failure would make every rollback
assertion pass vacuously, which is the main way a test like this lies.

Covered: the six roles the matrix denies and the three it allows;
cross-tenant refusal answered as a denial rather than a 404; notes required
for CHANGES_REQUESTED and REJECTED including a whitespace-only string; the
note and `reviewedAt` actually persisted; exactly one queued email per
decision with the right template; a second decision refused so it cannot
notify twice; a refused decision leaving no audit row and no email;
`beginReview` emailing nobody.

Repo-wide: backend 101 passed, frontend 46 passed, `npm run build` clean,
`eslint` clean.

### Not done here

Endpoint paths are still absent from `openapi.json` — the registry holds
components only, which is the state `P2-BE-07` shipped. The new contracts are
registered as components; describing the six routes is a separate pass across
all routers, not something to do for one of them.

## Note on graphify

`graphify-out/graph.json` still maps the pre-split `src/…` tree, so a query
about `backend/src` returns frontend files and documentation. It needs
re-ingesting after the 2026-09-21 repo split before it is useful again.

## `P3-BE-07` review follow-ups — B7 and B8, fixed the same day

Two items came out of the code-review pass and were fixed rather than raised
as separate rows.

**B7 — one condition should have one status.** `GET /applications/:id`
answered 404 on a miss while the four decision endpoints answered 403 for the
same id. Neither disclosed anything: both already answer "not found" and "not
yours" identically, which is the property that matters, and which is
`P3-BE-01`'s deliberate convention — telling a caller that an id exists in
another tenant is itself a disclosure. But a client had to code around two
statuses for one condition. The read now throws `ForbiddenError` like the
domain layer does. The convention was not re-decided; it was applied
consistently.

**B8 — the queue is now cursor-paginated.** It took a flat 200 rows with no
way to reach the next ones, while `PageQuery` had existed unused since
`P2-BE-07`. That contract is cursor-based by design and this is precisely the
collection that needs it: a work queue changes under the caller, because the
rows being decided are the rows being listed, and an offset would skip an
applicant or show one twice exactly when the desk is busy.

Two details worth keeping:

- It fetches `limit + 1` and slices, so `hasMore` is answered without a second
  `COUNT` against a table that is being written to.
- It orders by `createdAt` **then `id`**. `createdAt` alone is not unique — an
  import job writes a whole cohort in the same millisecond — and a cursor over
  a non-deterministic order drops rows silently. That tiebreaker is
  load-bearing, not tidiness.

The two read handlers became named exports so a test can drive them directly.
`supertest` is still not a dependency; what is under test is the handler's own
logic, not Express's routing.

12 new cases. Backend 113 passed, frontend 46 passed, build and lint clean.

The other eight judgement calls (B1–B6, B9, B10) were reviewed and kept as
built — each is settled by a source (§21, §37, §23, the RBAC matrix) rather
than open.
