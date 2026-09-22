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

## `P3-BE-13` — an athlete can actually apply

*Code review. Raised and built the same day, because it did not exist.*

Asked what backend work came next, the answer was not on the board. **None of
the sixteen new NEXT backend rows are startable** — they all sit behind
`P9-PMO-03`, which needs B8 closed and an edition sold. So the next work was
still B1, and checking B1 turned up a hole.

`AthleteApplicationInput` was written by `P3-BE-01` and published in
`openapi.json`, **and nothing consumed it.** No domain function, no route, and
the seed job creates users and roles but no `Athlete` rows. The four decision
endpoints built earlier today could only review applications that had no way
of being created. B1's exit is *"a real athlete applies → admin approves →
ACTIVE"*; the approve half was done and the apply half had never been built.

**No task covered it**, and that is the pattern worth remembering: `P3-BE-01`
delivered exactly what its acceptance asked for, and `P3-FE-01` says "wire
`/join` to the real application API" on the assumption that the API exists.
A dependency column records dependencies between tasks; it cannot record a
thing nobody wrote a task for.

### The only write path in the API with no actor

Every other domain function takes an `Actor` and asks `scope.ts` what they may
reach. An applicant at `/join` has no session and no `User` row, so three
things stand in for the role check:

1. **The tenant is configuration, never input.** A public form cannot be
   allowed to nominate the tenant it lands in.
2. **An existing application is reachable only by a signed token that names
   it** — the token returns the id rather than a boolean, so a caller cannot
   verify one application and then read another.
3. **Editing is refused unless the state allows it.** An applicant cannot edit
   their way around a decision already taken about them.

### `SystemActor`, and the trap it avoids

`transitionAthleteIn` calls `assertAllowed`, so the intake needed *something*
to present. The first attempt passed an actor with no roles, which simply
fails the check. `SERVICE` was the tempting fix and is wrong twice over: §8
deliberately gives it read-only reach on athletes, and it would file an
applicant's own act under the API service account.

So the absence of an actor became explicit in the type. `SystemActor` is the
one thing that skips the role check, which makes every bypass one `grep` away
— and **it cannot reach ACTIVE at all**. §37's gate is a decision with a person
behind it; a path with nobody behind it must never be what grants someone the
ability to take paid work. The state table still governs it exactly as it
governs a human transition.

### Three smaller decisions

**A patch from CHANGES_REQUESTED resubmits in the same act.** An applicant who
has edited in response to a request has answered it, and should not also have
to find a second button. §21 draws that edge explicitly for the same reason.

**The slug is never repatched.** It is a public URL that may already have been
shared, and §11 gives no rule for changing one. Renaming it silently breaks a
link nobody knows they are holding.

**The rate limiter fails open.** Redis's first real use in the codebase, and
the one the stack decision reserved it for. If Redis is unreachable the
application still goes through — a limiter that takes the intake form down when
the cache blinks has caused a worse outage than the one it prevented. Same
reasoning that keeps Zoho off the request path.

### Two things that cost a cycle

**Zod refuses `.partial()` on a refined object**, and it fails at *module load*,
so two unrelated suites went red with an error pointing at a file they only
import transitively. `AthleteApplicationInput` carries a refinement — one of
`birthDate` or `ageBand` is required — so the shape had to be split from the
refinement. That is the correct pattern anyway: "one of these two" cannot
survive every field becoming optional.

**A rollback test that asserted the wrong thing.** The first version passed an
empty `displayName` and expected a throw; validation lives at the route, so the
domain happily fell back to a default slug. Rewritten to fail the *last* write
in the transaction — the receipt email — and assert that the athlete, the
socials and the audit row are all absent. An applicant who was told nothing
must also not exist, or the review queue holds someone who never heard from us.

### Verification

30 new cases. Backend 143 passed, frontend 46 passed, `npm run build` clean,
`eslint` clean. Phase 1 is now 248 tasks · 598 person-days.

**Clerk needs no change for this.** The applicant has no identity at all.
Clerk matters one step later, at approval, and the setting that governs it was
already settled on 2026-09-21: sign-up stays open, because restricted mode
would stop a provisioned athlete creating the identity that claims their row.

## `P3-BE-14` — the rest of B1, reachable

*Code review. Raised and built the same day, for the same reason as
`P3-BE-13`.*

Three tasks were **Done whose domain functions no endpoint called**:
`acceptAgreement` (`P3-BE-06`), `linkGuardian` / `verifyGuardian` /
`readGuardianReadiness` (`P3-BE-03`), and the APPROVED → ACTIVE move
(`P3-BE-01`). B1's exit asks for an athlete ACTIVE *"with agreements and (if
minor) verified-guardian captured"*. Apply worked as of an hour earlier,
approve worked, and then it stopped.

**This is now a pattern, not a coincidence.** Each of those rows delivered
exactly its own acceptance, and each acceptance was written in terms of a
domain function. Nothing in the plan said "and it must be callable", so three
tasks closed honestly while the capability they describe remained unreachable.
Worth checking the rest of Block B for the same shape before trusting a Done.

### The finding that mattered

**Activation is a narrower permission than approval.** `POST
/applications/:id/activate` needs `approve` on `athlete`, not on
`athleteApplication` — and the RBAC matrix's `athlete` table gives Approve to
**`NETWORK_MGR` alone**, a dash to everyone else including `SUPER_ADMIN`.

My first test assumed `SUPER_ADMIN` could activate. It failed, and the right
move was to read the document rather than widen the policy: `authz-policy.ts`
says in its own header that it is a transcription and that the document wins
if they disagree. They did not disagree — the test was wrong. Both actions sit
on the same admin screen, so widening one to match the other is a
one-character mistake, which is why it is now pinned by an assertion that
`athlete.approve` has exactly one holder.

**A contradiction inside the matrix document, recorded not resolved.** Its
`athlete` table gives `BTG_ADMIN` no Approve cell, while its §12 says
`BTG_ADMIN` sets athlete status *"as the superset role"*. `policy.ts` follows
the table. This will surface as a 403 on an activate button the first time a
BTG_ADMIN uses the admin UI. It needs a pull request to the document — the
plan owns task and policy definitions, and reinterpreting it in code is
exactly the drift `CLAUDE.md` forbids. Noted on the row.

### A contract that would have lied

`GuardianRelationship` was first written by hand as five values, including
`GRANDPARENT` and `SIBLING`. The domain's `GUARDIAN_RELATIONSHIPS` has three —
`PARENT`, `LEGAL_GUARDIAN`, `AUTHORIZED_REP` — and `linkGuardian` validates
against it. The published `openapi.json` would have advertised two options the
API refuses, to §8's service account among others. The contract now derives
its enum from the domain's own list, so the two cannot drift.

The same rule applied to the acceptance endpoint: the signer, IP and user
agent come from the request and never from the body. Evidence a caller
supplies about itself is not evidence.

### Left out deliberately

The **applicant-facing half of guardian capture** — a minor's parent
submitting their details at `/join` — has no home. `linkGuardian` takes an
`Actor`, and a guardian at sign-up has no account, which is precisely the
problem `P3-BE-13` had to solve for the applicant. Rather than invent a second
public path before `/join`'s guardian step is settled, this task kept to the
BTG-side endpoints and the gap is recorded on the row.

### Verification

19 new cases. Backend 162 passed, frontend 46 passed, `npm run build` clean,
`eslint` clean. Phase 1 is 249 tasks · 601 person-days.

**B1's backend is now complete end to end**: an athlete applies with no
account, BTG reviews and decides, a guardian is linked and verified, an
agreement is accepted against the text actually shown, and the athlete is
activated — with §37 refusing a minor whose guardian is unverified at every
door. What remains in B1 is wiring (`P3-FE-01`, `P3-FE-02`), the notification
jobs (`P3-INT-02`) and the E2E (`P3-QA-01`).

## Three closed in one run — `P3-BE-04`, `P3-BE-08`, `P3-BE-11`

*All three Code review. Chosen because none needs a migration, so all three
were closeable without a database, and two of them unblock B2.*

### The catalogue seeds outside the production guard, on purpose

`seed-environment.mts` refuses to run in production, and it is right to: what
it seeds is fake people, and a demo athlete in a production tenant is
indistinguishable from a real one. The seven NIL jobs and six sponsor packages
are the opposite — they are the **real price list**, identical in every
environment, and production needs them most of all. So they went into a new
`seed-catalogue.mts` that runs everywhere.

It **upserts** rather than inserting-if-absent. The bands will change when the
business revises them, and a run after a revision has to correct the rows
rather than leave them stale. That is safe here precisely because a `NilJob`
is a price list, not a record of something that happened — nothing anyone
could lose.

### The floors are derived, and the test is the real safeguard

Each job's minimum sell price per tier comes from `minimumSellPrice()` —
**base-band top × tier multiplier × 1.4** — rather than a transcribed number,
so the catalogue cannot drift from the rule that produced it.

The test then transcribes `P0-PMO-13`'s published table **independently** and
asserts the two agree. All 21 values match. This is the part worth keeping:
the derivation and the document were written by different people at different
times, either could have been wrong, and "two hand-copied lists stay equal" is
not something to hope for.

Two details inside the formula that are easy to get wrong:

- **Base-band top, not the midpoint.** The floor has to hold for the most
  expensive athlete who could be staffed on the job, or it is not a floor.
- **Rounded up.** Rounding down publishes a price a cent under the rule it was
  derived from — the kind of defect nobody finds until an auditor does.

`SX-07` carries its corrected band (`$1,050–$2,000`, pay band unchanged); it
was the one job the rule could not rescue alone, because its base-band top
equalled its old sell floor. Local Blitz is narrowed to `$1,500–$2,400` across
5–9 athletes so it stops below 10-Athlete Blitz — otherwise one product is a
point inside another's range. The iMC/BTG feature is an `includes` line with a
record rather than a phrase in a description, so §26's conflict checks and
delivery tracking can see it at all.

A test also asserts every package clears the 1.4× floor **at its most
expensive athlete count**, which is the check whose absence produced the
negative margins in the first place.

### `P3-BE-04` — the caller does not choose the provenance

The columns have existed since `P2-BE-02` and the intake writes them, but
nothing could change a social account once the application closed. That is the
point of the task: a follower count an athlete typed in March is not a
follower count in September.

The rule that matters is not the columns, it is who may label them. **An
athlete's own edit is `SELF_REPORTED` however the body is filled in; only BTG
records `VERIFIED_MANUAL`.** §22 calls the provenance label the project's
biggest credibility risk, and a caller who can set their own has removed its
meaning entirely — every downstream screen would repeat "verified" because
the person being measured said so. `VERIFIED_API` is not offered at all, since
nothing in Phase 1 can perform it and offering it invites a claim the system
cannot back.

One subtlety worth keeping: the self-scoped check reads **roles**, not scopes.
`scopeFor` returns the *widest* of an actor's roles, so a BTG staffer who is
also an athlete in the network would read as self-scoped under a naive scope
comparison and quietly lose the ability to verify anything.

### Verification

38 new cases. Backend 200 passed, frontend 46 passed, `npm run build` clean,
`eslint` clean. Closing these also unblocked `P4-BE-01`.

## Five closed in one run — `P3-BE-05`, `P3-BE-10`, `P3-INT-02`, `P3-SEC-01`, `P4-BE-01`

Four remaining B1 rows plus the first B3 model row. One migration
(`20260922140000`), generated offline with `prisma migrate diff` as the repo
already does — no machine here has Postgres.

### `P3-BE-05` — the columns are `TEXT[]` because the acceptance says *queryable*

The acceptance reads "restrictions are queryable for the conflict check in
Phase 4", and that single word decides the shape. §26's check asks *"which
athletes exclude alcohol?"* — a question an index answers against a `TEXT[]`
and cannot answer against a JSON blob or a paragraph of notes.

`restrictionNotes` is a **separate nullable column** for what does not reduce
to a category, and the conflict check deliberately cannot read it.
Unenforceable text sitting in the enforceable column is exactly how a
restriction silently stops being one.

The category vocabulary is **closed and shared** with sponsor categories. Free
text cannot be conflict-checked: *"no booze"*, *"No Alcohol"* and
*"alcohol/bars"* are three strings and one intention, and a query that has to
guess is a query that misses.

### `P3-BE-10` — a missing factor is not zero, and it changes the answer

The rule most likely to be got wrong. A zero is an assessment — *we looked,
and it is bad*. An absence is *we have not looked*. A new athlete with no
sponsor-performance history scored as zero is punished for having no history,
which is backwards for a network trying to recruit.

So an absent factor's weight is redistributed across the rest, and the
unassessed share is reported alongside the number so a weak score says so out
loud. The same athlete scores **80** with `sponsorPerformance` absent and
**76** with it recorded as zero. That gap is why it is tested rather than
assumed.

Worth noting: the score document's own confirmation block is still blank —
factors and weights are settled by §14, but new-athlete handling and score
visibility have no recorded answer.

### `P3-INT-02` and `P3-SEC-01` — asserting what must already hold

Neither builds much, and that is the point of each. "Notifications exist" and
"the rules about minors are enforced in code, not just documented" are claims,
and a claim nobody checks is a document.

The templates now have a test that they **survive an empty payload**. An
outbox row can outlive a code change that renamed a data key, and a greeting
reading *"Hi undefined,"* is worse than a generic one.

For minors: minority is evaluated against today's date and never stored, so an
athlete who applies at 17 and activates at 18 is an adult. "No guardian" and
"an unverified guardian" stay distinct, because collapsing them would let an
athlete self-declare a parent. And **the `SERVICE` account cannot reach a
guardian at all** — §18 syncs Contacts with Zoho, and a minor's parent must
never be pushed to a CRM as a sales contact.

### `P4-BE-01` — `SponsorContact` is its own table

Not a use of `User`. Most sponsor contacts never sign in, and folding them in
would make every inbound Zoho Contact a login-capable account.

`Actor` now carries **`sponsorId`**, because the matrix's `own` and
`own-sponsor` scopes on `sponsor` and `sponsorContact` cannot be expressed
without it — a scope builder has no second query to find out who the caller
works for. A sponsor user with no `sponsorId` matches **nothing** rather than
everything; the dangerous failure in Prisma is `{}`, which means every row.

### A structural note

Two modules were split so their rules import nothing, matching
`athlete-state.ts` and `guardian-rules.ts`: `content-value-rules.ts` and
`brand-categories.ts`. The immediate reason was that a test could not load a
module reaching `db/client` and therefore `env`, but the better reason is that
B3's sponsor and brief models need the category vocabulary without pulling in
a database client. **When a test cannot import a rule without a database, that
is usually the rule being in the wrong file rather than the test needing a
mock.**

### Verification

45 new cases. Backend 245 passed, frontend 46 passed, `npm run build` clean,
`eslint` clean. Phase 1: Done 58 · Code review 20 · Ready 15 · Blocked 133.

## Five more — the whole B3 backend spine (`P4-BE-02`…`P4-BE-06`)

*All Code review. §39's "sponsor brief → matching → invitation" segment, end
to end. No migration: `P2-BE-02` had already authored `CampaignBrief`,
`Campaign` and `CampaignInvite` with their enums.*

Worth noting how they were chosen. Only four backend rows were Ready and all
four sat in Stages 6-8 — far ahead of the roadmap's block order. Stage 4 is a
strict chain (`P4-BE-01` → `02` → `03` → `04` → `05`, and `02` → `06`) with
everything downstream blocked behind it, so working the chain **is** the
in-order choice even though the rows read as Blocked. They were blocked only
by rows at Code review, all of them written earlier the same day.

### The conflict check runs twice, deliberately

`matching.ts` shortlists and a shortlist is **advisory**. A desk that filters
correctly and then invites from a tab opened an hour ago has still put an
athlete in front of a brand they refused. §26 is a rule about the invitation,
so `inviteAthlete` re-asks it at the moment of the offer — and §37's guardian
gate with it, because an invitation *is* the offer of paid work and catching
it later at acceptance would mean telling a sixteen-year-old about a campaign
they were never able to accept.

The exclusion is `NOT hasSome`, never a negated `hasEvery`: an athlete barring
**any** of the brief's categories is a conflict. A brief for an alcohol brand
with a restaurant category attached must still exclude the athlete who refuses
alcohol.

**Conflict is a rule; sport and geography are targeting.** A brief naming
Maryland basketball describes who it wants, not who is forbidden, so an empty
list means "no preference" rather than "nobody". Conflating the two is the
failure worth guarding against — a targeting miss costs a good match, a
conflict miss is what §26 exists to prevent.

### A test caught a real authorisation gap

`ATHLETE` holds `invitation.write` in the matrix — for *their own*
invitation, so they can accept or decline. `inviteAthlete` checked only
`assertAllowed(actor, "invitation", "write")`, which an athlete passes, so an
athlete could have invited themselves to a campaign.

The matrix already distinguishes the two acts and does it **by scope**: BTG
roles hold `own-tenant`, an athlete holds `own`. So creating an invitation now
requires a tenant-wide reach. The rule came out of the matrix rather than a
hardcoded role list, which is the difference between a fix and a patch.

**The general lesson: when one action name covers two different acts, the
scope is usually what separates them.** A coarse `isAllowed` check is not
enough wherever a role holds the same verb on its own row.

### Three state-machine edges worth remembering

Each table is asserted exhaustively over all ordered pairs, transcribed
independently of the implementation — a happy-path test passes just as well
against a machine that permits everything.

- **A campaign cannot be cancelled once REPORTING.** The athletes did the work
  and the sponsor owes for it; cancelling there is a billing decision dressed
  as a state change.
- **An invitation cannot be ACCEPTED without being VIEWED, but can be DECLINED
  unopened.** The accept path runs through the screen that shows the terms; a
  decline can be a link in an email. "They accepted without ever seeing it"
  must not be representable.
- **A brief closes from any pre-campaign state.** "They went quiet" and "they
  said no" both end there and neither is a qualification.

### `P4-BE-05` is a sweep, not a timer per invitation

A per-invite job that is lost leaves that offer open forever; a missed sweep
catches everything on its next run. It expires and writes the audit rows in
**one statement**, so the log cannot lag the data. Hourly, and it sends no
email — an athlete who ignored an invitation for a week does not need telling,
and BTG sees it on the roster.

One coupling made explicit: `OPEN_INVITE_STATES` is used in the query rather
than a hand-typed literal, because `prisma/sql/invite_one_open.sql` indexes
exactly those states and a second copy is how the guard and the index drift
apart. A test asserts the two lists agree.

### Verification

40 new cases. Backend 285 passed, frontend 46 passed, `npm run build` clean,
`eslint` clean. Phase 1: Done 58 · **Code review 25** · Ready 15 · Blocked 128.

## Authorization fixes — the row-scope bypass, and a document that argued with itself

Reviewing the day's gotchas turned one listed item into three, and the middle
one was the serious one.

### Sixteen lookups ignored the scope filter

Every domain write checked `assertAllowed`, then fetched its row with
`{ id, tenantId: actor.tenantId }`. `scope.ts` exists precisely to turn a
matrix scope into a `where` fragment, and **the queries never called it**. So
any role holding the action at *any* scope reached *every row in the tenant*.

The matrix was right the whole time. This was not a policy mistake; it was a
policy nobody asked. Live consequences before the fix:

- an athlete could accept or decline **another athlete's** invitation
- an athlete could rewrite another athlete's `restrictedCategories` — the
  input to §26's conflict check
- an athlete could rewrite another athlete's follower numbers
- a sponsor admin could close **any** brief in the tenant

The fix is `whereFor()` in the lookup, which `createBrief` was already doing —
the mechanism was there and unused elsewhere. It needed real builders for
`athleteSocialAccount`, `athleteScore`, `campaignBrief`, `campaign` and
`invitation`, plus `own`/`ward` on `athlete` and `guardian`. `Actor` therefore
carries `athleteId` and `guardianId` now, alongside `sponsorId`, for the same
reason: the matrix's `own` and `ward` name a row, and a scope builder has no
second query to find out which.

### Scoping the row does not fix a self-signed act

The one a filter cannot catch. A guardian holds `guardian.write` at `own` so
they can maintain their own details — which also let them **verify
themselves**. Guardian verification is §26's attestation by a named BTG staff
member, and it is the evidence if a minor's participation is ever challenged.
The row genuinely belongs to them, so no `where` fragment refuses it.

`assertTenantWide()` checks the **width** of the reach instead. It now guards
`verifyGuardian`, `scoreAthlete` and `inviteAthlete` — the acts performed
*about* someone rather than *by* them. An athlete answering their own
invitation is deliberately untouched: `own` there is the matrix working.

**The general rule worth carrying forward: when one action name covers two
different acts, the scope is what separates them, and `assertAllowed` alone
cannot.** The first instance of this was found by a test the same day
(`inviteAthlete`); these two were found by going looking.

### The matrix document contradicted itself

Its `athlete` table gave `SUPER_ADMIN` and `BTG_ADMIN` a dash under Approve,
while its own §12 states that `NETWORK_MGR` sets athlete status *"and
BTG_ADMIN can too, as the superset role"*. `athlete` was also the only approve
column in the entire matrix without `SUPER_ADMIN`, which holds `any` on
`athleteApplication`, `campaignBrief`, `campaign`, `deliverable` and
`earning`.

So: a transcription slip in the table, not a policy — and it would have
surfaced as a 403 on the activate button for a BTG_ADMIN. **The document was
corrected first, then `policy.ts` followed it**, per that file's own header
rule that the document wins. Doing it the other way round would have been
exactly the drift `CLAUDE.md` forbids.

The matrix digest moved deliberately, `438e87a9a4d2fa80` →
`bc4ddbf83a1e7538`. That pin exists so a matrix change cannot happen quietly,
and it did its job.

### Verification

18 new cases, including one that sweeps every self-scoped role against every
row-scoped resource and fails if any of them gets an unrestricted filter — the
dangerous answer being `{}`, which in Prisma means every row.

Backend 305 passed, frontend 46 passed, `npm run build` clean, `eslint` clean.

## SponsorX NEXT aligned into the authorisation model

The NEXT spec specified two roles and ten models; the RBAC matrix knew about
none of them. Policy living in a feature document rather than in the matrix is
how the two drift, so the matrix gained **§15**, a full cell-by-cell appendix.

### The rule that had to be inverted, and said out loud

Everywhere else in that document: *the document wins, `policy.ts` follows*.
§15 inverts it — **it is marked provisional and must not be transcribed** until
`P9-BE-05` runs, because adding `STUDENT` and `ADVISOR` to the `Role` enum is a
migration and Stage 9 is gated behind B8 and a sold edition. The NEXT spec now
states the same thing from its side, so neither document can be read alone and
come to the wrong conclusion. `policy.ts` is untouched and the matrix digest
has not moved.

This is the general shape for recording policy for gated work: **write it in
the authoritative document, mark which way the authority runs until the gate
opens, and say so in both places.**

### Three decisions the appendix records rather than invents

- **`ADVISOR` is not `PROPERTY_MGR`.** That role scopes to a property's
  inventory and analytics; an advisor's authority is editorial and custodial
  over minors. Same row scope, different permissions.
- **`ADVISOR` gets no publishing economics and no rights decisions** (V3 §3).
  They approve what students publish; they do not price inventory or grant a
  licence. So `revenueSplit` has no advisor row at all, and `contentRight` is
  read-only for them.
- **A `STUDENT` reads their own sales and never another's** — the likeliest
  leak inside a school, and the direct analogue of `PROPERTY_MGR` seeing only
  their own roster.

### Two prerequisites found by writing it down

`User.propertyId` already exists, so `ADVISOR`'s `own-property` has a column
to filter on the day it is transcribed.

`User` has **no `studentId`**, so `STUDENT`'s `own` has nothing to filter by.
Every student-scoped row would fall through to `MATCHES_NOTHING` — which fails
safe but **silently**: the portal renders empty rather than erroring, and an
empty portal reads as a data problem, not a permissions one. Recorded on
`P9-BE-05`.

### The state-machine edge deliberately not added

`P4-BE-06` built the campaign state machine earlier the same day with
`DRAFT → STAFFING → APPROVAL` and no `DRAFT → APPROVAL`. v2.0 settled that a
NEXT sale **is** an ordinary `Campaign`, carries no `CampaignOrder`, and must
therefore skip `STAFFING`.

The edge was **not** added in advance, and `P9-BE-09`'s row now says why:
bending a shipped state table to accommodate unbuilt gated work is how a state
table stops meaning anything. The machine says what Phase 1 does; Stage 9
changes it when Stage 9 runs.

`CLAUDE.md` now records where NEXT sits — screens Stage 1 and startable, models
and roles Stage 9 and gated — so nobody has to reconstruct that split from
three documents.

## Alignment audit — four findings, two of them mine from the same day

Asked to check that everything was aligned, including enums. **The enums were
fine** — `Role`, `AthleteState`, `BriefState`, `CampaignState` and
`InviteState` all match `schema.prisma` exactly, in order. Four other things
were not, and the method that found them is worth keeping: read
`schema.prisma`, the SQL index and the worker **as text** and compare, because
these are the pairs with no compiler keeping them honest.

### The outbox was dispatching into a void

The drain called `boss.send()` for any outbox row, then marked `dispatchedAt`.
Only `notify.email` has a worker. `zoho.pushCampaign` and
`notify.invitationSent` — both enqueued by B3 domain code written hours
earlier — went into queues nobody works, were recorded as delivered, and would
expire unread. **The outbox exists so that work survives; dispatching into a
void defeats the entire mechanism.**

The drain now selects only names in `HANDLED_JOBS`, so an unhandled row keeps
`dispatchedAt` null and goes the moment its handler ships.

**The first version of that fix was wrong in an instructive way.** Filtering in
JavaScript *after* the `LIMIT` looks equivalent and is worse than the bug:
undeliverable rows are the oldest, so they would fill every batch forever and
starve everything behind them. The filter has to be in the SQL. Head-of-line
blocking is easy to introduce while fixing something else.

### I repeated the pattern I had flagged that morning

Nine B3 domain functions across brief, campaign, matching and invitation had
**no endpoints** — the same "closed against its acceptance, unreachable in the
product" defect I found three times in B1 earlier the same day and wrote up as
"a pattern, not a coincidence".

Knowing about a failure mode does not prevent it. The acceptance criteria for
those rows named domain functions, I built domain functions, and the rows
closed honestly. **The fix that actually holds is the test**, not the
resolution: `alignment.test.ts` now asserts every domain function is called by
a route, and it fails the moment one is not.

### Two configuration couplings

The tenant id existed as **two literals** that happened to match — the API's
`PUBLIC_INTAKE_TENANT_ID` and the worker's `TENANT_ID`. The first environment
to set one of them would have sent every application to a tenant with no
catalogue and no users: a data bug in appearance, a configuration bug in fact.
The worker reads the API's variable now.

`docker-compose.yml` passed none of the variables added today. Defaults made
that invisible locally, which is exactly why it would have surfaced first in
staging.

### What the audit deliberately did not change

`MetricSource` is five values in Prisma and the contract accepts three — the
two verified-by-machine labels that nothing in Phase 1 can produce are left
out on purpose. `AthleteTier` has four values and only three are priced;
`ANCHOR`'s multiplier is negotiated, so a derived floor would invent a policy.
Both subsets are now asserted as deliberate rather than left to look like
oversights.

## Five more — B2 closed, B4 opened (`P3-BE-09`, `P3-BE-12`, `P4-INT-01`, `P5-BE-01`, `P5-BE-02`)

### The two rules that are really one rule

**Rates are versioned, never updated**, and the unique index on
`(athleteId, jobId, version)` makes that structural rather than a convention.
A rate is the basis of an offer that may already have been made; overwriting
it silently rewrites the terms of orders that quoted it and leaves nobody able
to say what an athlete was promised in March.

**An order's terms are frozen at send, never read live.** Same reasoning from
the other end: an order reading the rate card live would pay an athlete who
accepted $150 in March whatever the card says in September, and neither party
could prove what was agreed.

### The floor refuses; it does not report

`P3-BE-12`'s whole point. A margin report tells you which campaigns lost
money — which is the state `P0-PMO-13` found us in. A floor means they cannot
be saved.

Two details that decide whether it works:

- **Line by line, never against a package total.** A package's cheaper lines
  would hide a losing one behind a profitable average.
- **Against `baseHigh`, not the agreed rate.** Staffing happens after pricing,
  so the floor has to hold for the most expensive athlete who could take the
  line — otherwise it moves every time the roster changes.

The error names the job, the tier, the floor and the shortfall. *"Below the
margin floor"* sends someone to a spreadsheet; four numbers let them fix it in
one step, which is what the acceptance asked for.

Tested at **all seven jobs × all three tiers** — 21 cases rather than a
sample, because the collision `P0-PMO-13` found existed on *every* job and a
sampled test would have missed that. One case reconstructs the original
defect: SX-07 at its old $750 floor, underwater before any multiplier.

### The outbox rows that were waiting got their handler

`P4-INT-01` is the consumer for `notify.invitationSent`, which `P4-BE-04` had
been enqueuing since it was written. The drain had been **holding** those rows
rather than dispatching them into a queue nobody worked — so nothing was lost
and they flow the moment the worker restarts.

The handler **resolves the invitation at send time**, not at enqueue time, and
skips one that has been accepted, declined or expired since. The payload
carries an id and the world moves between enqueue and drain; telling someone
about an invitation they already declined is worse than telling them nothing.
Embedding the details in the payload instead would make every retry send a
snapshot of a world that has moved on.

`zoho.pushCampaign` still has no handler and its rows still accumulate — a
test now asserts that, so it is a recorded state rather than an assumption.
`P8-INT-01` owns it.

### The guard that stops the recurring defect

The reachability test now covers the six new domain functions. That defect —
a task closing against an acceptance that names a domain function, leaving the
capability unreachable — happened three times in B1 and once more in B3 on the
same day. **The resolution not to do it again did not work; the test does.**

### Verification

35 new cases. Backend 379 passed, frontend 46 passed, build and lint clean.
Phase 1: Done 73 · Code review 15 · Ready 23 · Blocked 115 · 467 days left.

## Seven defects in five tasks I had just closed — and the lesson

Asked what problems remained in `P3-BE-09`…`P5-BE-01`, I found six. Fixing
them exposed a seventh. Two made the closed acceptances **untrue**. The user's
response was blunt and correct:

> *"why do you do tasks that are always incomplete, this is really not good.
> when you do a task, make sure there is no shit laying around."*

### What was wrong

1. **The margin floor was called by nothing.** `P3-BE-12`'s acceptance is *"a
   line below the floor cannot be saved"*. `assertClearsFloor` existed, was
   tested at 21 points, and no code path invoked it.
2. **`ACCEPTED` was reachable without evidence.** `transitionOrder` let an
   athlete move an order straight there — no body hash, no signer, no IP, no
   guardian check — around every guard in `acceptOrder`.
3. **Acceptance was three transactions and could deadlock an order.** I had
   written a comment reasoning that an orphan acceptance harms nothing. The
   orphan does not; **the order does**. It stayed `SENT`, the athlete retried,
   and `acceptAgreement` then refused with `AlreadyAcceptedError` — the order
   could never be accepted by anyone again.
4. **An athlete could not read their own rate card** — `assertTenantWide`
   where the matrix gives `own` to `ATHLETE`.
5. **The rate version race returned a 500** — raw `P2002`, uncaught.
6. **`notify.campaignLive` was enqueued with no handler and no owner.**
7. **Found while fixing the rest:** `campaignOrder` and `athleteRate` had no
   scope builders, so `acceptOrder`, `transitionOrder` and `readRateCard`
   threw `ScopeNotImplementedError` **at request time**. Every one of those
   functions had passing tests, because each mocked its database.

### The single pattern behind five of them

**A rule that exists, is tested, and nothing forces the system to use it.**
Defects 1, 2, 3 and 7 are all that shape. A unit test that calls the rule
directly passes whether or not any caller does — which is why they all shipped
green.

Two things follow, and both are now in the code rather than in a resolution:

- **Test the path, not the rule.** The new defect tests drive `createOrder`
  and `acceptOrder`, not `assertClearsFloor` and `acceptAgreementIn`.
- **Add the guard that fails loudly.** `alignment.test.ts` already asserted
  that every domain function has a route; it now also fails if `whereFor()` is
  called for a resource with no builder. Writing "do not do this again" in a
  log changed nothing three times today; the tests did.

### One place the acceptance could not be met as written

`P3-BE-12` says "refuse a line whose **sponsor price** is below athlete cost ×
1.4", and `CampaignOrder` has no per-line sponsor price — only
`compensation`, the athlete's side. There is nothing to compare a line against
on its own.

The enforceable form of the same rule is that the sum of every line's minimum
sell price fits the campaign's budget, which still refuses at the moment a
line is added rather than in a report afterwards. **That is weaker in one
way and the code says so**: a campaign with room can absorb one underwater
line behind several cheap ones. Closing that gap needs a sponsor price per
line — a schema change and a pricing decision, not something to invent while
fixing a defect.
