# Deploy Ordering and the Release Step

**Task `P2-OPS-10` · Version 1.3 · 2026-10-02 · Status: in force (rules 1–3)**

Four rules govern how a SponsorX release reaches Railway. They exist because
each one has a specific failure it prevents, and each is written here with that
failure named — a rule whose reason is forgotten gets dropped the first time it
is inconvenient.

---

## The topology the rules apply to — since 2026-09-21

Rules 1–3 were written on 2026-09-18 for three services: `web`, `worker` and
Postgres. The repo split (Addendum B) and a cost decision changed that, and the
rules are stated below for what actually runs:

| Service | What it is | Database |
|---|---|---|
| `api` | The Express API **and the pg-boss worker in one process** — `backend/src/combined.mts` (decided 2026-09-21, re-confirmed 2026-09-28 when the first CPU-heavy job landed) | Yes — private networking |
| `web` | The Next.js app. Reads and writes only through `api`'s HTTP interface | **None.** `DATABASE_URL` was deleted from `web` on 2026-09-21 |
| Postgres | Railway template | Private networking only |

There is no separate `worker` service. Where an older note says "worker", read
"the worker half of `api`".

---


## Daily deploys at 8 pm Manila — in force from 2026-10-01

At the user's instruction, to stop a full rebuild of staging and production on
every merge and to cut GitHub Actions minutes (the account ran out on
2026-09-30):

- **Railway deploys from the `release` branch**, not `main`, in both
  environments (the deploy triggers for `api` and `web` point at `release`).
- **CI (`ci.yml`) runs once a day**, at 8 pm Manila, on the latest `main`, and
  only when `main` differs from `release`. It no longer runs on pushes or pull
  requests. It can be run by hand from the Actions tab.
- **When that run passes, `deploy-daily.yml` moves `release` to that commit**,
  and Railway deploys it to staging and production. Nothing new, or a failed
  check: nothing moves.
- **Manual deploys are unchanged:** Railway's Deploy / Redeploy buttons, or
  `npm run deploy` for GitHub `main`.

## 1 · Migrations run as a pre-deploy step, never in the build

**The rule.** `prisma migrate deploy` runs as Railway's **pre-deploy command**
on the `web` service, before the new version takes traffic. It never runs in the
build step.

**Why.** A build runs far more often than a release — every pull request, every
retried build, every preview environment. A migration in the build step runs on
all of them, against whichever database that build happens to see. As a
pre-deploy step it runs once per release, against that environment's database,
at the moment the new code is about to serve.

**Where it is set — today: `api`, in both environments.** `web` no longer has a
database to migrate, so the command moved with the API: on staging when `api`
was created (2026-09-21, "pre-deploy runs migrations"), on production when its
`api` was created (2026-09-24, "pre-deploy `prisma migrate deploy`"). The rest
of this section is the 2026-09-18 original, when it was set on `web` in
`staging`:

```
preDeployCommand: npx prisma@7.10.0 migrate deploy
```

**The version is pinned on purpose.** `prisma`'s `latest` dist-tag currently
points at `8.0.0-rc.15`, so an unpinned `npx prisma` would run a release
candidate against a client pinned at 7.10.0.

Production has no services beyond `web` yet and gets the same command when the
spine is promoted.

**It is on `web`, not `worker`, deliberately.** One service must own schema
migration or two will race. `web` owns it because `web` is what the release is
for; the worker's own queue tables are rule 3.

---

## 2 · The worker deploys before the web app

**The rule.** On any release that adds or changes a job type, `worker` deploys
first and is healthy before `web` starts taking traffic.

**Why.** New web code enqueues the new job the moment it serves its first
request. If the worker is still running the previous build, that job has no
handler. Depending on the queue's behaviour it either sits unclaimed or fails
and retries until the worker catches up — and the symptom shows up as a user
action that silently did nothing, which is the worst kind of bug to trace.

**How it is enforced today.** By hand, and honestly so: Railway does not order
deployments across services by itself. On a release that touches
`worker/jobs/`, deploy `worker` first, confirm it is healthy, then deploy `web`.

The ordering is not automated yet. When a release pipeline exists it should
encode this rule rather than rely on the person doing the deploy remembering it,
and this document should be updated to say so.

**The reverse direction is safe.** A release that changes only web code can
deploy in any order — the worker does not depend on the web app.

**How it is enforced since 2026-09-21 — by construction, and by the script.**
The failure this rule names — web code enqueuing a job no running worker can
handle — can no longer happen:

1. **`web` cannot enqueue at all.** It has no database and no pg-boss: nothing
   under `frontend/src` imports either (checked 2026-10-02). Every job is
   enqueued by the API.
2. **The API and the worker are one process at one commit** (`combined.mts`).
   A release that adds a job type ships its enqueuer and its handler together;
   one cannot be live without the other.
3. **The overlap window is safe too.** While Railway swaps an old `api`
   deployment for a new one, the old process may still be draining. pg-boss
   hands a job only to a process that registered `boss.work()` for that queue
   name, so the old worker never claims a new job type — it waits in the
   queue (visible as depth) until the new process registers it.
   `worker/index.mts` states the same.

What ordering still protects is `web` running ahead of the API it calls: new
web code deployed before its API serves a page that calls an endpoint the old
API does not have. So **`npm run deploy` (`scripts/deploy.mjs`) now deploys
`api`, waits until it is live, then deploys `web` — and stops without
deploying `web` if `api` fails.** It used to start both at once.

**The one path the script cannot order: the daily deploy.** Since 2026-10-01
Railway deploys both services from the `release` branch when
`deploy-daily.yml` moves it, and Railway does not order deployments across
services. By (1)–(3) no job can be lost on that path; the residual risk is a
minute in which a new page can call an API that is still finishing its own
deploy and get a 404. Encoding the order there needs the workflow to call
Railway's API, which needs a project token the current CLI login is not
authorised to create (see the deploy-daily notes). Until then this is
accepted, not hidden.

---

## 3 · pg-boss migrations run on worker boot only

**The rule.** The queue's own schema is installed by `worker` at boot. The web
app never installs it.

**Why.** pg-boss migrates its tables when it starts. If both services did it,
two processes would install the same schema against the same database in the
first seconds of a deploy, and the loser gets an error that looks like data
corruption and is not.

This is separate from rule 1: `prisma migrate deploy` owns the application
schema, pg-boss owns its queue tables, and neither touches the other's.

---

## 4 · Watch Paths — set, then removed

**Status: NOT IN FORCE.** Set on 2026-09-18 and removed the same day at the user's
instruction. Every commit to `main` triggers a deploy again. The reasoning is
kept because the exposure it addressed has not gone away.

**The rule was.** Each service declares Watch Paths, and Railway redeploys only when
a changed file matches. A commit touching `documentation/`, `memory/` or the task
board deploys nothing.

**Why.** `main` is auto-deployed, so before this every board update and every
memory log triggered a full rebuild of staging — on 2026-09-18 that was most of
seventeen commits, none of which changed a line of code. The risk is not the
wasted build; it is that a documentation commit can take a service down if the
build environment has drifted, and nobody expects a doc change to do that.

| Service | Watch Paths |
|---|---|
| `web` | `/src/**` `/prisma/**` `/public/**` `/package.json` `/package-lock.json` `/next.config.ts` `/prisma.config.ts` `/tsconfig.json` |
| `worker` | `/worker/**` `/prisma/**` `/package.json` `/package-lock.json` `/prisma.config.ts` |

**Keep them current.** A new top-level directory holding real code — `src/` moving,
a `config/` appearing — must be added, or changes to it will silently never
deploy. That failure is quiet and confusing: the commit lands, nothing happens,
and the obvious suspicion is the deploy pipeline rather than a missing pattern.

`/prisma/**` is in both lists on purpose: a migration must reach the service that
runs `migrate deploy` AND the service that will read the new tables.

---

## Current state, 2026-10-02

| Rule | State |
|---|---|
| 1 · pre-deploy migration | **In force on `api`**, staging and production. First executed 2026-09-18 07:27 UTC on `web` (`20260918060000_init`, deployment `08cd56a3`); moved to `api` with the database. |
| 2 · worker before web | **In force by construction** — `web` has no database or queue, and the API and worker ship as one process. `npm run deploy` also orders `api` → `web`. The daily `release` deploy is unordered across services; accepted above. |
| 3 · pg-boss on worker boot | **In force.** `boss.start()` runs only in `startWorker()` (`worker/index.mts`), which `combined.mts` calls after the API is listening. `web` has no database, so it cannot. |
| 4 · watch paths | **Removed.** Every commit to `main` redeploys staging. |

*Previous state table, 2026-09-18: rule 2 "in force, manual — no job types
exist yet"; rule 3 "in force"; rule 1 executed on `web`.*

---

**Service commands** (Guide §10), both environments:

| Service | Start command | Public |
|---|---|---|
| `web` | `npm run start -w @sponsorx/frontend` (`next start`) | Yes — `sponsorx.net` in production |
| `api` | `npm run start -w @sponsorx/backend` (`src/combined.mts`: API + worker) | No public domain; `web` reaches it at `api.railway.internal` |
| `Postgres` | Railway template | No. Private networking only |

*Until 2026-09-21 the worker ran as its own service (`node worker/index.mts`);
that entrypoint still exists, so splitting them again is a Railway change, not
a code change — see `combined.mts`.*

---

*References: Implementation Guide V2 §10; `.claude/stack-decision.md`.
Implements `P2-OPS-10`. Rule 1 is implemented by `P2-OPS-03`, rule 3 by the task
that attaches pg-boss to the worker.*
