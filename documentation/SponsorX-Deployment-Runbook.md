# SponsorX Deployment Runbook

**`P2-PMO-01` · §38 deliverable · 2026-09-22**

Four procedures: deploy, rollback, migration failure, restore. Each has been
walked once against staging; where a step has *not* been exercised against
real data, it says so rather than implying it has.

Read [`SponsorX-Deploy-Ordering.md`](SponsorX-Deploy-Ordering.md) first — it
owns the one ordering rule this runbook assumes throughout.

---

## 0 · What is deployed

Two Railway services from one repo, plus managed Postgres and Redis.

| Service | Runs | Public |
|---|---|---|
| `web` | `frontend`, Next.js `output: 'standalone'` | yes |
| `api` | `backend/src/index.ts` (Express) — or `combined.mts`, which runs the API and worker in one process | yes |
| `worker` | `backend/worker/index.mts` — outbox drain, pg-boss, seeds, invitation sweep | **no** |
| `postgres` | product data, the job queue, the audit log | no |
| `redis` | cache and rate limiting only — never the queue | no |

Redis holding no queue is what makes a Redis failure survivable: the outbox is
in Postgres, so a flushed Redis loses rate-limit counters and nothing else.

---

## 1 · Deploy

1. **Merge to `main_development`**, then open the PR to `main`. Nothing
   deploys from a feature branch.
2. **Check what the release adds.** If it adds a job type — a new `JobName` in
   `backend/src/db/outbox.ts` — the worker must deploy first. See
   Deploy-Ordering; this is the rule the ordering document exists for.
3. **Migrations run as a pre-deploy step** (`prisma migrate deploy`), not at
   boot. A failing migration therefore fails the release before any new code
   serves traffic.
4. **Watch the worker log for one drain cycle.** It prints what it seeded and
   what is waiting for a handler. `outbox waiting for a handler: …` is normal
   when a job type has shipped ahead of its consumer; a *growing* count of the
   same name after its handler shipped is not.
5. **Check `/health` on `api` and `web`.**

**Expected duration:** under five minutes. Anything longer usually means the
migration step is waiting on a lock — see §3.

---

## 2 · Rollback

**Code rolls back. Migrations do not.** That asymmetry is the whole of this
section: Railway can redeploy a previous image in a click, and no button
un-applies a migration. So a release that adds a column is safe to roll back;
a release that *drops* one is not, and the only safe way to remove a column is
two releases — stop writing it, then drop it in the next.

1. Redeploy the previous successful build from Railway's deployment list.
2. **Roll the worker back too, and in the same order as the deploy** — worker
   first if the release added a job type, because the old worker cannot
   consume a job the new API queued. Those rows stay in the outbox
   undispatched, which is the designed behaviour and not a loss.
3. If the release included a migration, **do not** attempt to reverse it. Go
   to §3.

**Not yet exercised:** a rollback across a release that added a job type. The
mechanism is the `HANDLED_JOBS` guard in `worker/index.mts`, which holds
undeliverable rows rather than dispatching them, and that guard is tested.

---

## 3 · Migration failure

A migration fails the deploy before new code serves traffic, so the running
system is the *previous* release with the database in a partially-migrated
state or none at all.

1. **Read the error in the pre-deploy log.** Three causes cover almost
   everything:
   - **A NOT NULL column added to a non-empty table.** Several of this repo's
     migrations are written to fail rather than invent a default — see the
     header comments in `20260921120000_athlete_application_fields` and
     `20260922190000_campaign_order_sell_price`. The fix is a backfill
     migration first, then the constraint.
   - **A lock timeout.** Long-running queries block DDL. Find them with
     `SELECT pid, query, state FROM pg_stat_activity WHERE state <> 'idle'`.
   - **Drift** — the database does not match the migration history, usually
     because someone applied SQL by hand.
2. **The previous release is still serving.** There is no outage to race.
3. **Fix forward.** Write the corrective migration, deploy again. Do not edit
   an applied migration file: `prisma migrate deploy` records a checksum and
   will refuse the next deploy on the whole environment.
4. `backend/prisma/sql/*.sql` holds the partial indexes Prisma cannot express.
   They are **not** applied by `migrate deploy` — apply them by hand after a
   fresh database is created, or single-use reward redemption is not race-safe.

---

## 4 · Restore

Procedures in [`SponsorX-Database-Backup-Runbook.md`](SponsorX-Database-Backup-Runbook.md);
this is the decision layer above it.

1. **Decide whether you need a restore at all.** Almost nothing here is
   unrecoverable by other means: the outbox retries, Zoho syncs are
   idempotent, and R2 objects are not deleted by the app.
2. **Restore to a new database, never over the live one.** Point a staging
   environment at it and confirm the data before any cutover.
3. **After any restore, re-apply `prisma/sql/*.sql`.** A restored database is
   a fresh one as far as those indexes are concerned.
4. **Expect duplicate outbox sends.** A restore rewinds `dispatchedAt`, so
   jobs already delivered will be delivered again — which is why every email
   carries an idempotency key and `EmailSendLog` has a unique constraint on
   it. Nothing else in the outbox is non-idempotent today; check that claim
   before adding a job type that is.

**Not yet exercised against production data** — there is no production data.
Restore has been walked once on a staging snapshot.

---

## 5 · What has actually been tested

Honesty about this is the point of writing it down.

| Procedure | State |
|---|---|
| Deploy | Exercised repeatedly against staging, including a release that added a job type |
| Rollback (code only) | Exercised once on staging |
| Rollback across a migration | **Not exercised.** The rule is "do not"; §3 is the path |
| Migration failure | Exercised by accident on 2026-09-21 — the pre-deploy command was broken by the repo split and the deploy failed correctly, serving the previous release throughout |
| Restore | Walked on a staging snapshot; never against production data |

*Owner: rcfworks. Review this whenever a new service, job type or external
dependency is added.*
