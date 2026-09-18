# Deploy Ordering and the Release Step

**Task `P2-OPS-10` · Version 1.0 · 2026-09-18 · Status: in force**

Three rules govern how a SponsorX release reaches Railway. They exist because
each one has a specific failure it prevents, and each is written here with that
failure named — a rule whose reason is forgotten gets dropped the first time it
is inconvenient.

---

## 1 · Migrations run as a pre-deploy step, never in the build

**The rule.** `prisma migrate deploy` runs as Railway's **pre-deploy command**
on the `web` service, before the new version takes traffic. It never runs in the
build step.

**Why.** A build runs far more often than a release — every pull request, every
retried build, every preview environment. A migration in the build step runs on
all of them, against whichever database that build happens to see. As a
pre-deploy step it runs once per release, against that environment's database,
at the moment the new code is about to serve.

**Where it is set.** On the `web` service instance, per environment. As of
2026-09-18 it is set on `staging`:

```
preDeployCommand: npx prisma migrate deploy
```

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

## Current state, 2026-09-18

The rules are in force; two of the three have nothing to act on yet.

| Rule | State |
|---|---|
| 1 · pre-deploy migration | **Set on staging `web`.** No migrations exist yet — `P2-BE-02` writes the first. |
| 2 · worker before web | **In force, manual.** No job types exist yet, so no release has needed it. |
| 3 · pg-boss on worker boot | **Not yet applicable.** `worker/index.js` is a placeholder; the task that attaches pg-boss implements this rule. |

## 4 · Only code changes trigger a deploy

**The rule.** Each service declares Watch Paths, and Railway redeploys only when
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

**Service commands** (Guide §10), set on staging:

| Service | Start command | Public |
|---|---|---|
| `web` | `next start` | Yes, once a domain is generated |
| `worker` | `node worker/index.js` | **No — never give the worker a domain** |
| `Postgres` | Railway template | No. Private networking only |

---

*References: Implementation Guide V2 §10; `.claude/stack-decision.md`.
Implements `P2-OPS-10`. Rule 1 is implemented by `P2-OPS-03`, rule 3 by the task
that attaches pg-boss to the worker.*
