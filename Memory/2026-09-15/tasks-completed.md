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
