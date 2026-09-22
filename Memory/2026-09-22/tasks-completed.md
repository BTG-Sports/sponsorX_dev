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

## SponsorX NEXT raised — 32 tasks, and the split that matters

The NEXT programme (`P0-PMO-14`'s spec, written earlier the same day) was
raised onto the board. Phase 1 goes 201 → 233 tasks, 464 → 554 person-days.

### The impact assessment that came first

The user asked for the damage before the tasks, which was the right order. The
answer was **low, and almost entirely additive**: seven new models, two `Role`
values, no existing table altered, no existing route changed. Default-deny in
`authz-policy.ts` means the 32 existing resource rows need no edit — two new
roles are denied everywhere until written in.

Three things do break, all of them the good kind:

- `ACCENT` is `Record<Portal, …>`, so adding a fifth portal **fails the build**
  until the accent entry exists. That is the type system doing its job.
- `Portal` is declared **twice** — `portal-shell.tsx` and `server/portal.ts`.
  Pre-existing duplication; the fifth portal is when it bites.
- Two assertions in `authz.matrix.test.ts` are pinned to today's answers: the
  catalogued-resource list, and the hardcoded role lists in the money-boundary
  tests. `STUDENT` has to be added to the latter, which is desirable.

The accent itself is already decided in
`Design/frontEndVersion2/01-accent-decision.png` — NEXT violet `#a479ff`, every
pair AA or better, 52° clear of athlete blue. §9.1's "open decision" is closed.

### The split: screens are Block A work, models are gated

The user asked whether the frontend could integrate now — buttons, layouts,
even disabled. **Yes, and the board should say so.** This repo already works
that way: `P1-FE-16` *builds* the `/join` wizard on fixtures, `P3-FE-01`
*wires* it. So NEXT's screens went into **Stage 1** as `P1-ART-08` and
`P1-FE-18`…`P1-FE-26`, and only the wiring (`P9-FE-01`…`P9-FE-06`) stayed
behind the gate.

The reasoning is worth keeping: **the gate exists to stop seven models and two
roles being cut into a schema whose first loop is still open. It does not
protect pixels.** Fixture UI costs no schema and is reversible, so gating it
was over-applying the rule. `P1-ART-08` and `P1-FE-18` are Ready today.

Each wiring row depends on **both** its backend task and its Stage 1 scaffold
row, so no screen is wired before it exists or before its API does.

### Three decisions the user made

Placement: **new Stage 9 in Phase 1**, not a fifth phase sheet — the Stage
Progress sheet picks it up for free and it stays visibly behind the §39 loop.
Scope: **Stage 0 and Stage 1**, with Stage 2 (points, leaderboard, digital
reader) left unraised because nobody could act on it for months. Gates: **B8
and edition-sold block; legal does not.** The legal questions are real and sit
on the Legal sheet, but they gate no build row — the standing rule on this
project.

`P9-PMO-03` is a single gate row depending on `P8-PMO-06` and `P9-DATA-01`, so
Stage 1 rows hang off one dependency instead of repeating two.

### Two findings to carry forward

`P9-BE-08` amends `P3-BE-12`: the margin floor must be evaluated **per NIL line
item, not per package total**, or a hybrid package's ad revenue inflates the
apparent margin and hides a losing NIL line behind a profitable page.
`P3-BE-12` is still unwritten, so this costs nothing now — the cheapest
possible outcome, and the reason the assessment was worth doing before the code.

`P9-BE-09` carries the genuinely unresolved one: `CampaignOrder.athleteId` and
`.jobId` are both non-null, so **a pure ad sale has no order at all** and its
campaign would sit in `STAFFING` with nothing to staff.

### Board mechanics

The ID prefix maps strictly to the stage on this board (`P3-*` is Stage 3, and
so on), so restaging the scaffold rows meant renaming them — done in two passes
so an intermediate collision could not clobber a row, with every `Depends On`
rewritten to follow. New Stage 1 rows carry **fractional Orders** (37.01…37.10)
so nothing else renumbered in anyone else's copy.

All 32 definitions were written into
`documentation/SponsorX-Phase1-Managed-Marketplace.md`, generated from the board
so the two cannot disagree. The phase document owns definitions; a board row the
plan has never heard of is the drift flagged on 2026-09-21 about the `P1-FE-09`
…`P1-FE-15` rows. The roadmap's Block C was amended to say where the screens
went.

Every hardcoded range was extended to row 237 — Dashboard formulas, three
conditional-formatting ranges, the Status validation list and the autofilter —
and `Stage Progress` was rebuilt for ten stages.

## NEXT spec v2.0 — reconciling the tasks with a rewritten specification

A parallel session replaced the spec with v2.0 (`e909cb9`) and raised five
backend rows. Reviewing it against the board found two gaps and one rule
violation.

### What v2.0 changed, and why it matters

Version 1.0 read the $1,500 package as containing four SX-02 NIL jobs performed
by paid athletes. **The social posts are student-created** — the concept note
says so twice. Everything downstream of that misreading was wrong:

- `P3-BE-12` needs no amendment. A NEXT package has no NIL line items, so no
  athlete cost, so the per-line margin floor has nothing to evaluate. `P9-BE-08`
  existed only to amend it and is now **void**. This is the second time today
  that a finding about `P3-BE-12` cost nothing because it is still unwritten.
- The ad-only-sale question is settled: a NEXT sale **is** an ordinary
  `Campaign`, carries no `CampaignOrder`, and must skip `STAFFING`.
- "Roughly 70% already exists" became 35–40% by build effort — 1.0 counted *"a
  school is a Property"* as equal in weight to *"build a dated inventory
  ledger"*.

### The two gaps

**The points ledger had no row anywhere.** `StudentPointAccrual` is `DECIDED` in
v2.0 §5.5 and appeared neither on the board nor in the phase document. Raised as
`P9-BE-15`.

**None of v2.0's new frontend surfaces had rows.** Four raised in Stage 1 on
fixtures — `P1-FE-27` the free digital edition reader, `P1-FE-28` *Claim this
profile* and the `FEATURED` state, `P1-FE-29` the rights ledger and clearance
queue, `P1-FE-30` the points balance — with `P9-FE-07`…`P9-FE-10` wiring them.

The reader is the largest correction. Principle 10 makes **free digital the V1
reader product**, where 1.0 had it deferred to Stage 2 as a nicety needing an
editorial type scale. It still does not get one: article pages run on the
existing scale, and inventing a long-form scale here is the scope error the spec
itself warns sinks the programme.

### The rule violation

`P9-BE-11` shipped depending on `P0-LEG-01`. **Removed.** Legal work is tracked
separately on this project and gates no build row — the three-part consent model
is `DECIDED` in v2.0 §5.4 and buildable today. What counsel answers is the
payout, not the record. The spec's own §12 repeats the legal gate in prose; the
board does not have to inherit it.

### Two judgement calls worth keeping

**The accent was un-decided.** `P1-FE-18` previously asserted NEXT violet as
settled, on the strength of `01-accent-decision.png`. v2.0 §14 lists the fifth
accent as an open **brand** gate. The row now builds against the proposed violet
**as a token pair rather than a literal**, so a different brand answer later is
a two-line change instead of a rework. That is the right shape for any open
brand decision blocking build work: implement behind a token, not behind a wait.

**The design set is in flux.** The user said `Design/frontEndVersion2` is being
rebuilt, so every design-led row carries a note that those screens are direction
rather than specification and must be re-checked before building.

Phase 1 is now **247 tasks · 595 person-days**, Stage 1 at 42 rows and Stage 9
at 32. 494 days remain.
