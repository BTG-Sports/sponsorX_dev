# 2026-09-15 — tasks completed

## Task — `P0-PMO-11` · Re-verify and pin all dependency versions (Code review)

**Trigger:** user asked what to pick up next. Block A is closed, so the roadmap
puts B0 · Foundations next, and its first line is *"Pins & deps (§01)"*.
`P0-PMO-11` was the only Ready code task on the board and depends on nothing.

### The scope boundary that matters

**Nothing was installed.** `P2-BE-01` · *Install and pin the dependency set*
is a separate task (Stage 2, Blocked, depends on this one) whose criterion is
*"Every package from Guide §01 installed at an exact version"*. The programme
splits this deliberately: **`P0-PMO-11` decides the numbers, `P2-BE-01` installs
them.** Graphify surfaced `P2-BE-01` on the first query — it would have been
easy to miss and to over-run this task into an install.

The user asked directly, *"so this is just an installed package task?"* — worth
recording that the task's name invites exactly that misreading, and that the
board's `Where: Code` label means the output lands in the repo, not that
anything gets installed.

### What was checked

29 packages queried straight from the npm registry (abbreviated packument, one
parallel fetch each — no `npm view` loop): 16 from Guide §01's main table, 6 V2
additions that had never been pinned, and the 8 toolchain packages sitting in
`package.json` that §01 never listed. Zero lookup failures.

### The three findings that justify the task existing

1. **`prisma`'s `latest` dist-tag points at `8.0.0-rc.15`** — a release
   candidate. A plain `npm install prisma` today takes the RC, while
   `@prisma/client` resolves to stable `7.10.0`. Unpinned, the pair installs
   **mismatched**. V1's note said "not 8.x, still release-candidate"; the
   sharper reason is that the registry's own default now points at it.
2. **Three unwanted majors were one `npm install` away**, held back only by
   carets: `typescript` latest is **7.0.2** (the Go rewrite) against `^5`;
   `eslint` is **10.10.0** against `^9`; `@types/node` is **26.5.1** against
   `^20`.
3. **`@types/node` is four major lines behind the runtime.** The project runs
   Node 24.21.0; the types were pinned at `20.19.43`, so TypeScript has been
   checking against Node 20's API surface. `@types/node` 24.13.4 exists and
   matches. **Left for `P2-BE-01`** — correcting it is an install, not a pin —
   but written into §01 as an explicit open finding so it cannot be lost.

### Version changes recorded in Guide §01

`next` 16.3.4→16.3.5 · `react` / `react-dom` 19.2.8→19.3.0 · `zod` 4.5.4→4.6.5 ·
`@clerk/nextjs` 7.9.1→7.9.2 · `pg-boss` 12.30.0→12.32.0 · `react-hook-form`
7.87.0→7.88.0 · `resend` 6.26.0→6.28.0 · `twilio` 6.1.0→6.1.1.

Unchanged and re-confirmed: `@prisma/client` 7.10.0, `tailwindcss` 4.3.3,
`recharts` 3.10.1, `playwright` 1.63.0, `vitest` 5.0.0.

**Newly pinned** (the V2 additions, plus one V1 named but never pinned):
`sharp` 0.35.4 · `@aws-sdk/client-s3` 3.1132.0 ·
`@aws-sdk/s3-request-presigner` 3.1132.0 · `maxmind` 5.0.7 · `qrcode` 1.5.4 ·
`@asteasolutions/zod-to-openapi` 9.1.0 · `@hookform/resolvers` 5.9.1.

Two corrections made while there: `maxmind` and GeoLite2-City were one table
row, but GeoLite2-City is a **data file, not a package**; and the two
`@aws-sdk` packages shared a row despite needing to be pinned in lockstep.

`twilio`'s version is **recorded but marked do-not-install** — SMS is still
undecided (`P0-PMO-04` / G-06 is open, Addendum A1 defers it).

### Files changed

- `documentation/SponsorX-Implementation-Guide-V2.md` — §01 re-verified and
  dated; second table gained a Version column; **new third table** for the eight
  toolchain packages that live in `package.json` but were never listed, each
  with the reason for its version (so nobody "helpfully" bumps eslint or
  TypeScript past a major); the `@types/node` open finding; and a note
  explaining the deliberate target-vs-installed gap.
- `package.json` — **all 7 carets removed**, pinned to the versions actually
  installed. No upgrades: `next`, `react` and `react-dom` stay one release
  behind the §01 targets on purpose, because closing that gap is an install and
  therefore `P2-BE-01`'s job.
- `package-lock.json` — refreshed with `npm install --package-lock-only`, which
  rewrites the lock without touching `node_modules`. Necessary: `npm ci`
  validates the lockfile's recorded specs against `package.json`, so leaving
  `^4` in the lock while `package.json` says `4.3.3` would have broken CI.

### Verified

`npm run build` passes (CLAUDE.md's rule — not `npx tsc --noEmit`, which reports
phantom `LayoutProps` errors before a build). `npm run lint` gives 0 errors and
1 pre-existing warning in `src/app/t/[code]/route.ts`, a file this task did not
touch. Checked that no dev server was running first, since a second one refuses
to start.

### Tracker

`P0-PMO-11` → **Code review**, Owner `rcfworks`, Date Started 2026-09-15, with
the findings in Notes. Board now reads **19 Done · 23 Ready · 1 In progress ·
1 Code review · 301 Blocked**. Dashboard formulas (77), the status validation
and the three conditional-formatting ranges all survived the edit — only
existing cells were changed, no rows inserted.

**`P2-BE-01` deliberately left Blocked.** It is the only task listing
`P0-PMO-11` as a dependency, and it should flip to Ready when this one is
reviewed and moved to Done — not before.

### Still to do

End-of-day mirror of the Google Sheet by hand, as the daily rule requires.

---

## Code review closed — `P0-PMO-11` to Done

User reviewed and asked for their Code review rows to be closed. One row
qualified — `P0-PMO-11`, owner `rcfworks` — moved to **Done** with Date Done
2026-09-15.

**`P2-BE-01` unblocked as a consequence.** `P0-PMO-11` was its sole dependency,
so it moved **Blocked → Ready**, with a note carrying the pinned-version
location and the outstanding `@types/node` correction it has to make. The board
does not do this itself; a finished dependency leaves its dependants sitting
Blocked until someone looks.

**Board: 20 Done · 24 Ready · 1 In progress · 300 Blocked — nothing in Code
review.** Dashboard formulas (77) intact.

`P2-BE-01` is now the natural next piece of B0: install the set that was just
pinned.

---

## Legal decoupled from the build — new `Legal` worksheet

**User decision, and it is a standing one:** *"do not make other task dependent
on legal approvals, or else this project will not take off."* Legal is not
needed at present; what matters is getting the project to basic working
functionality. Legal work is still tracked — it just cannot gate development.

### What changed

**All 9 `LEG` tasks moved to a new `Legal` worksheet** in the task board
(6 from Phase 1, 2 from Phase 2, 1 from Phase 3), each keeping every column plus
a `Phase` column recording where it came from. Their `Unblocks` values were
**reset to 0**, because after the dependency edits below nothing depends on them
— leaving `32` and `30` in place would invite someone to re-prioritise counsel
work on a number that is no longer true.

**Six development tasks had their legal dependency stripped.** Three of them had
*no other* dependency, so they were Blocked purely by counsel and are now Ready:

| Task | Depends On before | after | Status |
|---|---|---|---|
| `P0-DATA-02` | P0-LEG-04 | None | Blocked → **Ready** |
| `P1-ART-05` | P0-LEG-04 | None | Blocked → **Ready** |
| `P3-BE-06` | P0-LEG-01, P0-LEG-03 | None | Blocked → **Ready** |
| `P3-SEC-01` | P3-BE-03, P0-LEG-06 | P3-BE-03 | stays Blocked |
| `P5-BE-01` | P0-LEG-02, P3-BE-06, P4-BE-04 | P3-BE-06, P4-BE-04 | stays Blocked |
| `P6-SEC-01` | P0-LEG-04, P6-BE-03 | P6-BE-03 | stays Blocked |

`P0-LEG-03` still depends on `P0-LEG-01` — legal-on-legal, internal to that
track, gating no development. Left alone deliberately.

### Plan documents brought back into sync

Dependencies are part of a task's *definition*, so the Markdown had to move with
the tracker or the two would disagree:

- The 6 dependency lines edited in `SponsorX-Phase1-Managed-Marketplace.md`.
- All 9 LEG task entries annotated across the Phase 1/2/3 documents.
- `SponsorX-Phase1-Build-Roadmap.md` — both counsel gates struck from the
  A-gates table, the guardian e-signature gate decoupled (click-wrap is now the
  working assumption to build on), and the B4 note rewritten.

### The one consequence worth keeping visible

The roadmap's guardrail used to read *"Don't build acceptance on unapproved
text."* It now reads that acceptance **may** be built on draft text — but
**every `AgreementAcceptance` body-hash generated against draft wording is void
and must be regenerated once counsel signs off.** That is a launch-blocking
item, not a coding one. Stated once, in the roadmap and here; not re-litigated,
and not smuggled back in as a dependency.

### Verified

All **77 dashboard formulas identical before and after** — the hardcoded ranges
(`$I$5:$I$190` etc.) are now oversized rather than undersized, which COUNTIF /
COUNTA / SUMIF handle correctly. Zero LEG rows left in the phase sheets, zero
`Depends On` cells still naming a LEG task. **336 delivery tasks + 9 legal = 345**,
the programme total, and the status arithmetic reconciles exactly (three tasks
moved Blocked → Ready). Dashboard subtitle now states the split, since its
totals cover the 336 and its "External · counsel" row correctly reads 0.

### Board after the split

**20 Done · 22 Ready · 1 In progress · 293 Blocked** across the four phase
sheets; the Legal sheet holds 5 Ready + 4 Blocked.

`P0-OPS-01` (Railway, **unblocks 115**) is now unambiguously the top of the
queue — the two counsel tasks that previously sat second and third at 32 and 30
are out of the delivery path entirely. `P3-BE-06` (30) is newly Ready as a
direct result of this change.

### Not changed

`CLAUDE.md` still lists guardian e-signature under "Open decisions — do not code
around these silently". It is no longer a blocker, but editing the project
instructions was not part of this request — flagged for the user.

---

## B0 begins — `P2-BE-01`, `P2-BE-09`, `P2-OPS-06`, `P2-BE-07` (all Code review)

User asked for the first four pre-subscription tasks, in sequence. All four
built and verified; no vendor account touched, no money spent.

### `P2-BE-01` · Install and pin the dependency set

17 dependencies + 11 devDependencies installed at exact versions, **zero carets
remaining**. This closed the deliberate target-vs-installed gap `P0-PMO-11` left
open: `next` 16.3.5, `react`/`react-dom` 19.3.0.

- **`twilio` deliberately not installed.** Guide §01 records its version but
  marks it do-not-install while G-06 (SMS) is open.
- **`@types/node` corrected 20.19.43 → 24.13.4**, closing the open finding from
  `P0-PMO-11` — the types now match the Node 24.21.0 runtime instead of checking
  against Node 20's API surface.

**Three things cost time and are now written into Guide §01 so they cost nobody
else any:**

1. **Prisma 7 forbids `url` in a `datasource` block.** `prisma validate` fails
   with P1012; the connection string moves to `prisma.config.ts` and the client
   takes an adapter.
2. **`prisma/config`'s `env()` helper resolves eagerly and throws.** With no
   database provisioned, declaring `env("DATABASE_URL")` there breaks *every*
   prisma command, including `validate` and `generate`, which need no
   connection. Reading `process.env.DATABASE_URL` directly is the fix until
   Railway exists.
3. **npm 11 blocks install scripts by default.** `prisma` and `@prisma/engines`
   had to be approved explicitly — without that the query engine is never
   downloaded and the client cannot run. Easy to miss: install reports success.

`prisma validate` passes and `prisma generate` writes to `src/generated/prisma`
(gitignored), proving the explicit output path the acceptance asks for.

**One open risk, deliberately not "fixed".** `npm audit` reports 4 high-severity
advisories in `mysql2`, pulled in transitively by `@prisma/config`. We use
Postgres, so the vulnerable code is unreachable, and `npm audit fix --force`
would downgrade Prisma to 6.19.3 — breaking the pin and the v7 config layout.
Left alone, recorded here and in the tracker.

### `P2-BE-09` · Establish the repo layout

`prisma/sql/`, `src/server/` (+ `domain/`), `src/contracts/`, `worker/`
(+ `jobs/`), `tests/` (+ `e2e/`), per Guide §02. Each carries a `.gitkeep` that
names the files belonging there **and the task that builds them**, so the
structure documents the plan rather than just reserving directories.

### `P2-OPS-06` · The bare-`findMany()` lint rule

A `no-restricted-syntax` rule covering `findMany` / `findFirst` / `findUnique`
(+`OrThrow`) called without an explicit `select`.

**Verified rather than assumed:** ran it against a five-case probe — it fired on
all three bad cases and stayed silent on both good ones, then the probe was
deleted. `src/generated/**` is ignored, since the generated client's own
internals call `find*()` without a select by definition.

Two things to know: it is a **syntactic** check, so a nested `select` inside an
`include` satisfies it — accepted deliberately, because the alternative is
type-aware linting for a guard whose job is to stop the obviously-wrong case.
And "the build fails" now means **the CI lint step** (`P2-OPS-07`): Next no
longer runs ESLint during `next build`.

### `P2-BE-07` · Contracts registry and OpenAPI generation

`src/contracts/registry.ts` + `common.ts` + `zod.ts`, served at
`GET /api/v1/openapi.json`, generated on every request rather than committed so
the spec cannot drift from the code.

**Verified live against a running server:** HTTP 200,
`application/json; charset=utf-8`, `no-store`, OpenAPI **3.1.0**, four schemas
plus a `bearerAuth` security scheme — and the Zod constraints survive the
generation (`status` carries `minimum: 400 / maximum: 599`, `limit` carries
`default: 25`, `Provenance` emits all six labels).

Only **cross-cutting** shapes are registered: `ProblemDetails` (RFC 9457),
`PageQuery`/`PageMeta` (cursor pagination — offset silently skips or repeats
rows when a tenant-scoped collection changes under the caller), and
`Provenance`. Domain contracts belong to B1 onwards, against the real models
from `P2-BE-02`; writing them now would mean guessing at a schema that does not
exist.

**Trap worth carrying: import `z` from `src/contracts/zod.ts`, never from
`"zod"`, anywhere under `src/contracts`.** `zod-to-openapi` works by patching
`ZodType.prototype.openapi`, and applying that patch inline in `registry.ts`
worked under plain Node but **failed under the Next server build** — the schema
modules and the registry did not share a patched prototype, and
`registry.register(...)` threw "openapi is not a function" at build time.
Funnelling every contract through one module that applies the patch before any
schema is constructed removes the ordering question entirely.

### Verified

`npm run build` passes. `npm run lint` gives 0 errors and the same single
pre-existing warning in `src/app/t/[code]/route.ts`, untouched by this work.
No caret or tilde remains in `package.json`.

### Tracker

All four → **Code review**, Owner `rcfworks`, Date Started 2026-09-15, each with
its findings in Notes. **Board: 20 Done · 21 Ready · 1 In progress · 4 Code
review · 290 Blocked.** 77 formulas intact.

### Where this leaves B0

Items 1–4 of the pre-subscription list are done. The remaining vendor-free work
is the decision documents and the design deliverables. **`P2-BE-02` — the full
Prisma schema, which unblocks 104 tasks — needs a database, and therefore
Railway.** That is still the wall.

---

## `P0-PMO-01` · Phase 1 payment policy (G-01) — drafted, awaiting signature

Shipped `documentation/SponsorX-Phase1-Payment-Policy.md` v0.1, and uploaded it
to the user's Drive review folder as a Google Doc:
*SponsorX — Phase 1 Payment Policy (G-01) — DRAFT for signature*
(`1RB-irpjIrf1Uzu5uJ-KZUaS-pZ9hx6K2ujWwVAAsJmI`).

**This codified a decision rather than making one.** The answer was already
settled in three places — `CLAUDE.md`, the build roadmap's A-gates, and
`.claude/stack-decision.md` Addendum A6 — all saying earnings *status* only and
no tax ID. Addendum A6 traces it to §11 ("no raw bank credentials in SponsorX"),
§26 repeating it as a hard requirement, §27 making Phase 1 invoice/reference
tracking only, and §31's lean scenario. Writing it as a new decision would have
manufactured work.

The six earning states in §2 of the policy are exactly `P7-BE-01`'s acceptance —
PENDING → ELIGIBLE → APPROVED_FOR_PAYOUT → PAID / HELD / DISPUTED — so the one
task this unblocks can be built straight from the policy without interpretation.

The policy's own contribution beyond restating the decision: framing `PAID` as
**a bookkeeping mark about something that already happened elsewhere, never an
instruction**; an explicit list of what must never be added; and §7's four
triggers that force a replacement policy before the work starts.

**Left at Code review, not Done.** Acceptance requires a signature from whoever
runs athlete payouts. The user was explicit that they or Rodney give the go on
whether it is signed. One open item is carried in §6 for the signer to check:
whether anything in the current manual payout process pushes a tax ID into the
app anyway (an emailed W-9, an imported spreadsheet column, a note field used as
a workaround) — if so the route gets closed rather than the policy widened.

**Drive conversion artefact worth knowing.** Uploading markdown with
`contentMimeType: text/markdown` converts to a Doc and keeps headings, bold and
tables — but **bold markers inside table cells are escaped rather than applied**,
so a `**Status**` header cell renders literally, and underscores in table cells
come through as `APPROVED\_FOR\_PAYOUT`. Next time, put plain text in table cells.
Also note the connector reported `fileSize: 1` on creation, which is wrong — the
content was verified present by reading the file back.

**Board: 20 Done · 20 Ready · 1 In progress · 5 Code review · 290 Blocked.**

---

## Nine Stage 0 decision documents — `P0-PMO-03/04/05/06/09/10/12`, `P0-DATA-02/03`

User asked for the rest of the pre-subscription document tasks, **one document
per task, explicitly not consolidated**. All nine written to `documentation/`
and uploaded individually to the Drive review folder as Google Docs.

**Source discipline:** the blueprint v2.0 `.docx` is in the repo at
`documentation/Master/Updated_BTG_..._Integrated_Athlete_Network.docx`, so §5,
§6, §7, §14 and §16 were read from it directly rather than reconstructed. The
"Confirm…" tasks transcribe the blueprint's own numbers; they do not invent
them.

### The three genuine findings

**`P0-PMO-09` — the tier multiplier breaks the sell floor on every job.** §5 sets
athlete pay and sponsor price bands; §6 sets tier multipliers (Emerging 1.00×,
Creator 1.25×, Premium 1.50×). The two tables were written independently and
multiply against each other. At the **top of the base band with a Premium
athlete, athlete cost exceeds the sell floor on all seven jobs**: SX-07 by $375,
SX-05 by $50, SX-02/03/04/06 by $25 each, SX-01 landing at exactly $0. Creator
tier also goes negative on SX-07 (−$187.50) and breaks even on SX-02. SX-07 is
worst because its base top ($750) equals its sell floor ($750) before any
multiplier at all. Midpoint margins are by contrast healthy and strikingly
consistent — 60–67% across all seven — which is what shows the bands were set
deliberately and the *collision* is the accident. Recommended a floor rule
(price ≥ athlete cost × 1.4) as the Phase 1 fix.

**`P0-PMO-10` — packages cannot be seeded because none names its job codes.**
Price is fixed, athlete count is a range, and "premium content" is sales
language rather than a bill of materials. Athlete Takeover at ~$10,000 swings
from **83% margin to −31%** purely on job mix chosen after the sale. Proposed
concrete line items per package, pitched deliberately lower than the
descriptions imply — because if Takeover is to mean ambassador-grade work, the
price has to rise rather than the margin absorb it. Also flagged the Local
Blitz / 10-Athlete Blitz overlap at $2,500 / 10 athletes, and that "iMC/BTG
feature" is sold in three packages with no cost line.

**`P0-DATA-03` — the Content Value Score is half self-reported.** The seven §14
factors total 100%, and follower count is only 15%, which is the right emphasis.
But only **20% of the score (Reliability + Sponsor Performance) is data the
system itself observed**; 50% is self-reported by the athlete being scored. Rule
written in: the score is never displayed as a bare number — its provenance mix
goes with it.

### The decisions taken

- **`P0-PMO-03` (G-04): Resend**, behind a single send interface, Postmark as
  fallback. Cost and deliverability are near-identical at 25-athlete volume, so
  the deciding factor is operational burden — which rules SES out. The
  abstraction matters more than the vendor: no feature code imports the SDK,
  templates are ours, sends are queued.
- **`P0-PMO-05` (G-07): a file is required, but a print stylesheet supplies it.**
  The reason is *who reads the report* — the renewal signer often never logs in.
  Separating "sponsor needs a file" from "system must render it unattended" is
  what dissolves the PDF worker.
- **`P0-PMO-06`: drop the PDF worker**, keep the worker service (queue, Zoho,
  rollups, geo, image derivatives need it regardless). Recorded the wider lesson:
  an infrastructure decision should name the written requirement it serves — the
  second service was justifiable on the job queue alone the whole time.
- **`P0-PMO-04` (G-06): SMS out.** Already enforced — `P2-BE-01` left `twilio`
  uninstalled and no `TWILIO_*` exists anywhere.
- **`P0-DATA-02`: the four reward events defined by trigger.** The sharp points:
  a CLAIM *is* the consent record, not a metric that happens to carry an email;
  REDEEM is enforced once-forever by a partial unique index, not application
  logic; the SCAN→LANDING gap is an operational finding about venue wifi and must
  not be engineered away; and **only REDEEM is business outcome** — presenting
  SCAN as a result is overselling.

### `P0-PMO-12` was repo edits, not a document

Corrected `Memory/Initial Memory/02-confirmed-tech-stack.md` to the Railway
stack, keeping the superseded 2026-09-10 table at the bottom **labelled** with
why each component changed — deleting it would have destroyed the reasoning;
leaving it unlabelled was the original fault. Closed the open-discrepancy section
in `04`. Corrected `03`'s reversed "no spreadsheet is committed" rule and the
344 → 345 task count. Left `01` and `05` alone, and deliberately left `03`'s
Windows/PowerShell contributor note alone — correcting it for one machine makes
it wrong for the next.

### Tracker

All nine → **Code review**, Owner `rcfworks`, Date Started 2026-09-15, each
carrying its findings in Notes. `P0-PMO-06` moved Blocked → Code review as
`P0-PMO-05` answered its dependency.

**Board: 20 Done · 12 Ready · 1 In progress · 14 Code review · 289 Blocked.**
77 formulas intact.

### Note on Drive uploads

Bold inside markdown table cells is escaped rather than applied by the Doc
converter, so these nine were written with **plain text in table cells** —
unlike the payment policy uploaded earlier, which shows literal `**Status**` in
two header rows. The connector also reports `fileSize: 1` on every create; it is
wrong and can be ignored.

---

## Board summary and legal brief (both Drive deliverables, not board tasks)

### Board summary — written twice

First version led with progress numbers and the sign-off list. The user's
correction: *"not quite, expand on the existing prototype website. This will be
read by people who does not know technical stuff."*

**The rewrite made the prototype the body of the document, not a line in a
table** — a walk through the site grouped by who sees what: the public pages,
the sponsor's area (ending at the campaign report, "the document that earns the
renewal"), the athlete's phone view, the BTG staff area ("the largest part of
the product and the part an outsider never sees"), and the fan QR page. It also
explains *what a prototype is* rather than assuming it, and why building this
way was worth it — changing a screen now costs an afternoon, later a week.

Two things worth keeping from that rewrite: an honest what-is-real table
(buttons that open the right screen but save nothing), and a short section on
what the prototype has already earned — a sales tool that exists today, design
decisions settled cheaply, and the pricing problems found only because someone
had to decide what a screen would display.

**Drive cannot revise a document.** `create_file` makes a new file and
`update_file` is metadata-only, so the revision is a second document and the
superseded one is still in the folder. Asked the user before trashing it rather
than deciding myself. Both live in the review folder
`1cZC-1KpT0myKSdmT6wbP_HVGliGIT-TC`.

### Legal work brief

Consolidated the nine `LEG` rows into one commissionable document, saved to a
separate Drive folder (`10mOueV2D1PXAl2jPTTpayz8HJR2EWuO9`) with a repo copy at
`documentation/SponsorX-Legal-Work-Brief.md`.

Written **for outside counsel**, not for us — so it opens with the background a
lawyer would otherwise have to ask for: that many athletes are minors, that
athletes are not employees, that fan PII is collected at youth sporting events
and passed to a commercial third party, that the DMV and Baltimore are the
target jurisdictions, and that Phase 1 moves no money and collects no tax IDs.
That last point deliberately narrows scope.

Six Phase 1 items in priority order, three later-phase items marked **do not
start now**, each with a "done when" so counsel can quote without a call.
~14 days of Phase 1 counsel time; items 1, 2 and 5 share subject matter and are
efficient to commission together.

**One requirement counsel would not otherwise know:** every template must be
delivered as *versioned final text*, because the platform stores a fingerprint
of the exact wording each athlete accepted. A quietly amended template breaks
the audit trail for everyone who already accepted it.

The brief states the draft-text consequence plainly rather than burying it: any
acceptance captured before sign-off must be re-issued against approved wording
before go-live — a launch condition, not a coding one.

---


## Task — Redesign `/admin/campaigns/new` (Create Campaign) UX

**Trigger:** user asked to redesign the Create Campaign page for a "wow factor"
with a good, easy-to-learn UX. Design was presented and approved (guided wizard
+ live projection rail) before any code, per the standing rule.

### The problem
The old [page.tsx](../../src/app/(app)/admin/campaigns/new/page.tsx) was a static
server component: the "fields" were read-only display boxes, the stepper was
decorative (hardcoded to step 1), the athlete checkboxes changed nothing, and
the summary never moved. It looked like a form but did nothing.

### What was built
Rebuilt as **one client island** —
[campaign-builder.tsx](../../src/components/campaign-builder.tsx) — matching the
established applications-desk idiom (URL-synced state, animated score rings,
local demo actions, `filter-kit` toolbar, `sx-animate` motion):

- **Five focused steps** (`builderSteps` fixture updated): Inventory → Details →
  Athletes → Rewards → Review & Launch. The stepper is real and clickable, with
  completed ✓ states and a filled progress line. Step 3 gates Next until ≥1
  athlete is picked (teaches the managed-loop core).
- **Step 1 · Inventory** — selectable package cards from the `mediaInv` fixture;
  choosing one sets the CPM and seeds the budget.
- **Step 2 · Details** — real inputs + a **budget slider** driving live reach
  (budget$ ÷ CPM × 1000); platform toggles.
- **Step 3 · Athletes** — selectable cards with sweep-in **ScoreRing** (§14
  Content Value Score), instant search + sport/tier filters, dismissible chips.
  A category-conflicting athlete is shown **Blocked** (§26), not hidden.
- **Step 4 · Rewards** — optional; toggle + coupon preview, links to Reward
  Creator.
- **Step 5 · Review & Launch** — receipt summary + roster + `sx-pop` launch
  confirmation, honestly noting invitations stay held until counsel clears the
  Campaign Order template (§08).
- **Live projection rail** (sticky): reach tweens on every change via a
  ref-based `AnimatedNumber` (same set-state-in-effect workaround count-up.tsx
  uses); reach/budget/roster/platforms, all `est`-labelled per the
  stats-provenance rule.

### Refactor
Extracted `ScoreRing` out of applications-desk into shared
[score-ring.tsx](../../src/components/score-ring.tsx); applications-desk now
imports it. No duplication.

### Follow-up — builder now opens in a modal (user request)
User asked for a **"Create New Campaign" button → popup modal** rather than the
builder filling the page. Reconciled the modal-cramping concern by making it a
**spacious modal** (max-w-6xl · 92vh · internal scroll), so the two-column
wizard + rail keep their full-page layout.

- `/admin/campaigns/new` is now a **launch screen**: hero + a "how it works"
  five-step preview + the Create New Campaign button (also aids the
  learning-curve goal). No `/admin/campaigns` list page exists — the builder is
  launched globally from the sidebar, the dashboard and a campaign's detail
  page, so this screen is its home.
- New [campaign-launcher.tsx](../../src/components/campaign-launcher.tsx): the
  button + the modal. Modal plumbing mirrors the applications-desk review
  drawer — portaled to `<body>`, Escape/backdrop close, scroll-lock, focus
  moves to the close button and returns to the trigger, animated
  backdrop/`sx-pop` panel with a closing fade + fallback timer.
- CampaignBuilder gained two props: `syncUrl` (off in the modal, so closing
  leaves no stale `?step`) and `onCancel` (Cancel closes the modal instead of
  linking to /admin). Each open mounts a fresh builder = clean slate.

### Follow-up 2 — route removed, list page added, popup relocated (user request)
User: remove the New-campaign page **and** its nav item, make creating a
campaign a **popup inside the campaigns page**, and the campaigns page must
**list campaigns first**, then open the actual campaign.

Findings that shaped it: there was no `/admin/campaigns` list — the "Campaigns"
nav item pointed straight at `/admin/campaigns/c1` (the ops dashboard), and the
detail page's "Edit campaign" button linked to `/admin/campaigns/new`.

Done:
- **Deleted** the `/admin/campaigns/new` route entirely (the launch screen too).
- **New list page** [/admin/campaigns](../../src/app/(app)/admin/campaigns/page.tsx):
  campaign cards built from `campaignDetailX` (c1 Player of the Week, c3
  Community Campaign — flagged "Needs attention" from its `notice`), each a
  progress meter + pacing/engagement/reward stats, linking to
  `/admin/campaigns/[id]`. The **Create New Campaign popup** lives in its header.
- **Nav** (admin/layout.tsx): dropped "New campaign"; "Campaigns" now →
  `/admin/campaigns`.
- **CampaignLauncher** gained `label` / `variant` (primary|secondary) /
  `className` so the same popup serves the list header ("New campaign",
  primary) and the detail header ("Edit campaign", secondary — repointed from
  the dead `/new` link).
- **Repointed every dead `/admin/campaigns/new` reference** so nothing 404s:
  dashboard "Briefs to match" queue, `lib/back.ts` `builder` target
  (→ /admin/campaigns, "Back to Campaigns"), the /map sitemap, and
  build-preview. Only a code comment mentions the old path now.

### Verification
`tsc --noEmit` clean · `eslint` clean · `next build` succeeds — route table
shows `/admin/campaigns` (static) + `/admin/campaigns/[id]` (dynamic), and
`/admin/campaigns/new` is gone. Dev SSR: `/admin/campaigns` returns 200 with
both campaign cards, the New-campaign button, the Needs-attention flag and the
progress meters. Client interactions (list → detail, popup open/close, the
5-step builder) are demo-only, local-to-visit — nothing persisted.

## Task — Complete the sponsor campaigns path (List → Detail → Report)

**Trigger:** user asked to complete `/sponsor/campaigns/c1/report`, sensing
"there's a list or some content before reaching /c1/report." There was: the
report existed but nothing led to it — the sponsor **Campaigns** nav item
pointed straight at `/sponsor/campaigns/c1/report`, skipping any list/dashboard.
Design brainstormed and approved (List → Detail → Report), spec at
[docs/superpowers/specs/2026-09-15-sponsor-campaigns-path-design.md](../../docs/superpowers/specs/2026-09-15-sponsor-campaigns-path-design.md).

### Data reconciliation (the decision that shaped it)
Two campaign fixture families: `sponsorCampaigns` (c1–c5, the sponsor's
portfolio, already drives the dashboard's "5 campaigns") vs `campaignDetailX`
(rich series/roster/topContent/notice, only c1 + c3). The list **must** show all
5 or it contradicts the dashboard and reads as a bug. So the detail page is
**tiered**: c1/c3 render the full dashboard; c2/c4/c5 render an honest lighter
detail from portfolio-summary data. No campaign is faked with data it lacks.

### What was built
- **New list** [/sponsor/campaigns](../../src/app/(app)/sponsor/campaigns/page.tsx):
  one card per `sponsorCampaigns` entry — monogram, state badge (or "Pacing
  behind" when `sponsorCampaignsX.pacing === "BEHIND"`), deliverables meter,
  views·spend·athletes stats — linking to `/sponsor/campaigns/[id]`.
  Owner-framed; **no** "New campaign" launcher (Phase 1 managed — BTG staff
  create campaigns, not sponsors). Standard `demoState` empty/loading/error.
- **New detail** [/sponsor/campaigns/[id]](../../src/app/(app)/sponsor/campaigns/[id]/page.tsx):
  header (monogram, state badge, "Presented by … · pkg · endsIn") + a **View ROI
  report →** CTA (`?from=sponsor-campaign`), swapped for a muted "available once
  delivery begins" when `state === "STAFFING"`. Rich tier (c1/c3): pacing hero
  (`RadialGauge` + `campaign-ui` `paceFor`/`paceProjection`), a sponsor-reworded
  attention banner (data-driven from roster flags — **no** operator verbs, per
  the portal rule), stat tiles with provenance chips, performance `AreaChart`,
  **read-only** athlete roster (no `RosterOps` action drawer), top-content
  `HBarList`. Lean tier (c2/c4/c5): summary stat tiles + state-appropriate copy.
- **Nav** (sponsor/layout.tsx): "Campaigns" `href` `/sponsor/campaigns/c1/report`
  → `/sponsor/campaigns`.
- **Back-links**: `back.ts` gained a `sponsor-campaigns` target
  (→ /sponsor/campaigns); the report page resolves `from=sponsor-campaign`
  **inline** using its own `id` (`/sponsor/campaigns/${id}`, "Back to campaign"),
  since the static TARGETS map can't express an id-dynamic target. Existing
  `from=campaign` (admin origin) untouched.

### Deferred (unchanged, flagged for later)
The ROI report still renders c1's `roiReport`/`roiGauge` fixtures regardless of
`id` — a c3/c4 report shows c1's numbers. Wiring it to real campaign lifecycle
state (empty → partial → full as deliverables verify) is deferred until real
campaign state exists; fine for the PM demo.

### Verification
`tsc --noEmit` clean · `eslint` clean · `next build` succeeds — route table adds
`/sponsor/campaigns` and `/sponsor/campaigns/[id]` (both dynamic), report route
intact. Dev SSR (all 200, no render errors): list shows all 5 with c3 "Pacing
behind"; c1/c3 render the rich dashboard (pacing, roster, report CTA; c3 shows
the attention banner); c5 renders the lean/STAFFING tier with no report CTA;
unknown id → "Campaign not found"; report reached via the detail CTA shows the
"Back to campaign" link. All demo/fixture data — nothing persisted.

### Follow-up — search, filters and sort on the campaigns list (user request)
User asked to add search, filters and sort to `/sponsor/campaigns`. Built to the
applications-desk idiom (instant, no Apply button; URL-synced so a filtered view
is shareable) rather than a form, per the prefer-app-like-UX rule.

- **New client island** [sponsor-campaigns-list.tsx](../../src/components/sponsor-campaigns-list.tsx):
  instant **search** (name + package), **Status** filter
  (Active/Reporting/Staffing/Completed), **Pacing** filter (On track/Behind),
  **Sort** (Name A–Z · Views · Spend · Progress %), dismissible active-filter
  chips + "Clear all", a live "N of M" count and a filtered-empty state. State
  seeded from and synced to the URL (`?q=&status=&pace=&sort=`) via
  `replaceState`. The card markup moved from the server page into the island.
- **filter-kit**: added a `sponsor` tone (the `--sx-sponsor` token already
  existed) so the search/dropdowns/chips tint in the sponsor color, not
  athlete/admin. Shared component — athlete/admin tones untouched.
- **page.tsx** now shapes the `CampaignRow[]` server-side (source of truth
  still `sponsorCampaigns` c1–c5) and passes them + `initial` to the island;
  demo/empty/loading handling stays on the server page.

Verification: `tsc --noEmit` clean · `eslint` clean. Dev SSR (island seeds
filters from the URL, so filtering is verifiable server-side): base → 5 cards;
`?q=community` → c3; `?status=STAFFING` → c5; `?pace=behind` → c3; `?q=zzzzz` →
"No campaigns match"; sort orders confirmed for spend/name/views/progress.

### Follow-up — pagination (user request)
User asked why the toolbar showed "5 of 5" and to make the list support
pagination. The "5 of 5" was the match counter — replaced. Chose **12 per
page**; pager design `‹ 1 2 3 4 5 … 10 … 25 ›` (first/last always shown, window
around current, ellipsis gaps, prev/next arrows).

- **New reusable component** [pagination.tsx](../../src/components/pagination.tsx):
  a controlled, tone-aware pager + an exported **pure** `pageItems(page, count,
  siblingCount?, boundaryCount?)` helper (MUI-style truncation). Returns null
  for ≤1 page. Lives on its own so other lists can adopt it.
- **Wired into** the campaigns island: `PAGE_SIZE = 12`, `page` state seeded
  from `?page=` and synced to the URL (omitted when page 1); any
  filter/sort/search change resets to page 1 via an `onFilter` wrapper; a
  seeded out-of-range `?page=` clamps via a derived `safePage` (no
  setState-in-effect — that tripped `react-hooks/set-state-in-effect`).
- **Counter replaced**: the standalone "N of M" chip is gone. A range line
  ("Showing X–Y of Z[ matching]") shows **only** when filtered or when there's
  more than one page — so the default single unfiltered page (today's 5
  campaigns) shows no counter and no pager, which is what removed the odd
  "5 of 5".

Verified: `pageItems` output checked for count=25 across page positions (early →
`1 2 3 4 5 … 25`, middle → `1 … 12 13 14 … 25`, end → `1 … 21 22 23 24 25`) and
small counts collapse correctly; the range line "Showing 1–1 of 1 matching"
shows when filtered, and `?page=99` clamps to page 1. `tsc` + `eslint` clean.

**Tweaks (user requests):** (1) **always show the pager** — added an
`alwaysShow` prop to Pagination (renders `‹ 1 ›` with disabled arrows for a
single page); enabled on the campaigns list. (2) **right-align it** — dropped
the hardcoded `justify-center` from the component so alignment is
consumer-controlled via `className`; the list passes `justify-end`. Verified on
the running server: pager present at rest, `justify-end` applied, Next disabled
on the single page.

**Page-size selector (user request):** added a **12 / 24 / 60 per page**
dropdown beside the pager, in a `justify-between` footer row (size left, pager
right). `pageSize` state defaults to 12, seeded from and synced to `?size=`
(omitted at 12), and changing it resets to page 1. Reused the filter-kit
`Dropdown` with a new **`includeAll={false}`** prop (added to the shared
component) so it renders just the three sizes with no forced empty "all" row —
a page size is always set. `page.tsx` seeds `size` from the URL. Verified:
dropdown present next to the pager, trigger reads "12 / page" by default and
"60 / page" under `?size=60`. `tsc` + `eslint` clean.

Follow-ups: dropdown moved to sit **directly beside the pager** (footer row
`justify-end` instead of `justify-between`). And, since it's at the page bottom,
the filter-kit `Dropdown` gained a **`placement="up"`** prop (panel opens with
`bottom-full mb-1.5` instead of `top-full mt-1.5`) so the page-size menu opens
**upward** and no longer extends/scrolls the page; the page-size dropdown uses
it. Default placement stays "down" for the top-of-page filter/sort dropdowns.

Then user asked to move the pagination + page-size controls **above the item
list**: now one row directly under the filter toolbar / chips and before the
grid — range indicator left (`mr-auto`), page-size dropdown + pager right. With
the controls back near the top, reverted the page-size dropdown to the default
downward `placement` (the `placement="up"` prop stays on Dropdown for future
bottom-of-page use). Verified via SSR: both controls render before the first
campaign card. `tsc` + `eslint` clean.

Finally, user asked to **duplicate the pager before and after the list**. Added
a second `Pagination` below the grid (right-aligned, `alwaysShow`), sharing the
same `safePage`/`totalPages`/`setPage` as the top one so they stay in sync. The
page-size dropdown + range indicator remain only in the top row. Verified via
SSR: two `aria-label="Pagination"` navs, one before the first card and one after
the last. `tsc` + `eslint` clean.

Then user wanted the **page-size dropdown duplicated at the bottom too**, so the
bottom row now mirrors the top (dropdown + pager). The bottom dropdown uses
`placement="up"` (opens upward — it's at the page bottom). Range indicator stays
top-only. All four controls share the same state. Verified via SSR: two size
dropdowns + two pagers, one set before the list and one after. `tsc` + `eslint`
clean.

## Task — Wire search / filter / sort / pagination on `/sponsor/marketplace`

**Trigger:** user asked to complete all frontend functions on the sponsor
marketplace — especially the sorting, filtering, search and pagination of each
tab (Packages, Athlete inventory, Media properties).

### The problem
The marketplace [page.tsx](../../src/app/(app)/sponsor/marketplace/page.tsx) was
a server component that rendered **every** fixture row per tab with no paging,
and its `FilterChips` were purely decorative (`title="Filters not wired"`,
hardcoded "Basketball ✕" + inert Sport/Geography/Tier/Budget buttons). Nothing
searched, filtered, sorted or paged.

### What was built
One generic client engine reused across all three tabs —
[marketplace-catalog.tsx](../../src/components/marketplace-catalog.tsx),
following the proven sponsor-campaigns-list idiom (instant, URL-synced, no Apply
button), tinted `sponsor`:

- **`useCatalog<T>` hook** — the shared filter/sort/paginate/URL-sync engine:
  instant search, N filter dropdowns (config-driven), a sort menu, page + size
  state, any change resets to page 1, out-of-range `?page=` clamps via a derived
  `safePage` (no set-state-in-effect). Syncs `?q=&<filter>=&sort=&page=&size=`
  via `replaceState`, **preserving `tab` and `demo`** so a filtered view is
  shareable per tab.
- **`CatalogShell`** — toolbar (search + filter dropdowns + right-aligned sort),
  dismissible active-filter chips + "Clear all", filtered-empty state, and the
  dual page-bar (range line + 12/24/60 size dropdown + numbered pager) rendered
  **above and below** the grid, matching the campaigns list. Card body is a
  render prop, so only the per-tab card differs.
- **Three tabs**, each with data-derived filter options:
  - **Packages** — search name/note/contents; filter Availability; sort
    Featured first · Name · Price ↑/↓ (`parseAmount` handles `"$1,500–$3,000"`,
    `"~$2,500"`, `"$15K–$30K+"`).
  - **Athletes** — search name/sport/geo/job; filter Sport · Tier · Availability
    · Verification (Verified/Self-reported); sort Followers · Engagement ·
    On-time · Price · Name. Sponsor prices only — `AthleteRate.amount` still
    never reaches the client (guide §04, §30 test).
  - **Media** — search name/property/platform; filter Availability · Platform
    (from the flattened `platforms` arrays); sort Est. views · CPM · Price ↑/↓ ·
    Name.

The card markup + `IdentityCard` frame moved verbatim from the server page into
the island; the informational footer notes (§7, the AthleteRate rule, the CPM
warn card) stay on the server page. The **tab strip stays a server nav** (`?tab=`
Link), now preserving the `demo` param in its hrefs.

### Verification
`tsc --noEmit` clean · `eslint` clean. Dev SSR (server on :3000, all tabs 200):
`?tab=packages` renders the search box, Availability filter, Sort control, two
pagers and 6 "Request a brief" cards; `?tab=athletes` renders Sport/Tier/
Availability filters + 5 "Add to brief" (Leila `SOLD_OUT` → "Join waitlist");
`?tab=media` renders Platform/Availability filters + 6 "View Details", each with
two pagers. Filter/sort/pager interactions reuse the same primitives already
proven on the campaigns list. All demo/fixture data — nothing persisted.

## Task — Wire the sponsor "Request a brief" / "Add to brief" flow (frontend)

**Trigger:** user asked what the marketplace "Request a brief" button should do
per the docs, then said to build it — **frontend only**. Design brainstormed and
approved (side drawer · in-place confirmation · wire packages + athlete buttons);
spec at
[docs/superpowers/specs/2026-09-15-sponsor-brief-request-drawer-design.md](../../docs/superpowers/specs/2026-09-15-sponsor-brief-request-drawer-design.md).

### The problem
The packages **"Request a brief"** and athlete **"Add to brief"** buttons were
decorative stubs (`title="… not wired"`). Per the docs they're the front door to
the managed-marketplace loop (§9 screen 4, §13, §17: *sponsor brief → matching →
invitation → Campaign Order → …*). The whole flow is Stage 4, **Blocked** in the
task board — FE `P4-FE-01` depends on the backend `CampaignBrief` model
`P4-BE-02`, which doesn't exist. There was **no brief UI anywhere**.

### What was built
New client component
[brief-request-drawer.tsx](../../src/components/brief-request-drawer.tsx) — a
right-side drawer, **frontend only, nothing persisted**:

- **Plumbing copied verbatim** from the applications-desk review drawer: portaled
  to `<body>`, `role=dialog aria-modal`, `sx-drawer`/`sx-backdrop` in-out
  animation, Escape + backdrop close, body scroll-lock, focus to the close button
  → returns to trigger, `animationend`-drives-unmount with a 300ms fallback.
  Sponsor-toned.
- **`BriefSeed`** discriminated union — `{kind:"package"}` (name + price) or
  `{kind:"athlete"}` (name, sport, jobName, sellPrice). Non-null seed opens the
  drawer; the parent clears it to close. Keyed on seed identity so each open is a
  clean slate.
- **Pinned context header** shows what's requested (package badge, or "Requested
  athlete" badge). **Form** captures exactly the `CampaignBrief` fields
  `P4-BE-02` names: Objective (req) · Budget (req, seeded from package price /
  `money(sellPrice)`) · Timing (start date + 2/4/8/12-week duration) · Targeting
  (Sport/Geography/Tier dropdowns, options from `distinct(athleteInv)` like the
  catalog filters; **sport pre-filled** for an athlete seed) · Category (the
  competitor-conflict field, §26) · optional Message. Submit is gated on
  Objective + Budget.
- **On submit** → in-place success state ("Brief received. BTG will match, price,
  run conflict checks and follow up — Phase 1 is managed, no self-service
  checkout (§17)"), plus a persistent "a request, not a purchase" sub-line. No
  network. `AthleteRate.amount` never enters the component — sponsor sell prices
  only (guide §04).

### Wiring
[marketplace-catalog.tsx](../../src/components/marketplace-catalog.tsx):
`PackagesCatalog` and `AthleteCatalog` each hold one `briefSeed` state and mount
a single `<BriefRequestDrawer>`; the two stub buttons now `setSeed(...)` (packages
→ package seed; athletes → athlete seed, still disabled/"Join waitlist" when
`SOLD_OUT`). Media tab untouched. No fixture/backend changes.

### Verification
`tsc --noEmit` clean · `eslint` clean. Dev SSR (server on :3000, all tabs 200):
the package "Request a brief" and athlete "Add to brief" stub tooltips are gone
(remaining "not wired" strings are portal-shell chrome + the intentional sold-out
waitlist). Drawer open/submit/close is client-interactive — not driven in a
browser this pass, but the plumbing is the verbatim, already-proven
applications-desk drawer. Nothing persisted; each open is a fresh form.
