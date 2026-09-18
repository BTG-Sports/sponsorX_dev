# Database Backups and Restore — Runbook

**Task `P2-OPS-09` · Version 1.0 · 2026-09-18 · Status: proven on staging**

Every command below was run against the staging database on 2026-09-18 and the
output recorded. This is not a plan for how backups might work — it is what
happened, so that the same steps against production are a repeat rather than a
first attempt.

---

## What exists today

| | Staging | Production |
|---|---|---|
| Postgres | `Postgres` `f345dcfb`, volume in `us-east4-eqdc4a` | `Postgres-production` `75db2da3`, volume in `us-east4-eqdc4a` |
| Point-in-time recovery | **On**, bucket wired | **On**, bucket wired |
| Scheduled backups | **Daily + weekly** | **Daily + weekly + monthly** |
| Restore | **Tested and working** | Mechanism identical; tested on staging |
| Backup bucket | `sponsorx-pg-backups` `34211549`, region `iad` (US East) | same bucket serves both |

**Production's database was created on 2026-09-18 rather than at promotion**, and
deliberately so: the PITR recovery window begins when PITR is enabled, so a
database protected from the moment it exists has no unprotected first hours. The
application still ships to staging first — only the database is ready early.

**The two environments use different reference strings.** Service names are
unique per project, so production's database is `Postgres-production` and its web
service reads `${{Postgres-production.DATABASE_URL}}`, where staging reads
`${{Postgres.DATABASE_URL}}`. Do not copy one environment's variable to the
other.

**The bucket region is a residency decision.** Railway bucket regions use their
own names — `sjc` (US West), `iad` (US East), `ams`, `sin` — not the service
region ids. `iad` is the US East one and is what G-02 requires. A backup bucket
in the wrong region puts a full copy of the database outside the agreed
jurisdiction, which is the same problem as a misplaced volume and easier to miss.

---

## Enabling backups on a new database

Four commands. Run them **before** the database holds anything worth losing.

```bash
# 1 · a bucket for continuous backups — US East, per G-02
railway bucket create sponsorx-pg-backups --region iad --environment <env>

# 2 · point-in-time recovery (wires itself to the bucket)
railway postgres pitr enable --service Postgres --environment <env>

# 3 · scheduled backups
railway postgres pitr schedule set --daily --weekly --service Postgres --environment <env>

# 4 · confirm
railway postgres pitr status --service Postgres --environment <env>
# expect: "enabled": true, "bucketWired": true
```

The bucket already exists, so step 1 is skipped for the second database; steps 2
and 3 are per service, per environment.

---

## Restoring

Two mechanisms, and **the difference between them matters**.

### From a backup — destructive, restores in place

```bash
railway postgres pitr backup list --service Postgres --environment <env>
railway postgres pitr backup restore <BACKUP_ID> --service Postgres --environment <env>
```

`backup restore` has **no `--new-service-name` option**. It replaces the volume
of the existing service. The database it is run against is gone and replaced by
the backup's contents.

**Tested 2026-09-18** on staging with an empty database: a manual backup
(`e005db9e`, 862MB referenced, 16MB used) was created and restored in place. The
service redeployed and returned `SUCCESS` within about a minute, with PITR still
enabled afterwards. That is the proof `P2-OPS-09` asks for.

### To a point in time — non-destructive, restores into a new service

```bash
railway postgres pitr restore --at 2h --new-service-name pg-restore-check \
  --service Postgres --environment <env>
```

`--at` takes RFC3339, `"YYYY-MM-DD HH:MM:SS"` local, or an offset back from now
(`30m`, `2h`, `1d`). This one builds a **new service** and leaves the live
database untouched, which makes it the right tool in an incident: restore beside
production, confirm the data, then cut over deliberately.

**A restore to a time before PITR was enabled fails**, with
`"Failed to start the point-in-time restore"`. That was the first result on
2026-09-18 — `--at 5m` against a database whose continuous backups were minutes
old. It is not a broken feature; there is simply no archive covering that moment.
The recovery window starts when PITR is enabled, which is the reason step 2 above
comes before the database matters.

---

## For an incident, in order

1. **Stop writing.** Whatever caused the loss will keep causing it.
2. `railway postgres pitr restore --at <just before the damage> --new-service-name <name>`
   — into a **new** service, never in place.
3. Connect to the restored service and confirm the data is what you expect.
4. Only then decide how to cut over: repoint `DATABASE_URL` at the restored
   service, or dump from it into the live one.
5. `railway postgres pitr backup create` on the live database first if there is
   any chance you will want today's broken state back.

**Do not reach for `backup restore` under pressure.** It is in place and
irreversible, and the instinct in an incident is exactly when it will be typed by
mistake.

---

## What is not proven

- **No restore has been tested with real data in it.** The staging database was
  empty. The mechanism is proven; the fidelity of a restore is not, and cannot be
  until `P2-BE-02` creates a schema and something writes rows.
- **Production has no database yet**, so none of this is live where it would
  matter most.
- **Nobody has timed a restore of a realistic database.** Sixteen megabytes came
  back in about a minute. That number tells you nothing about a real one, and the
  recovery-time figure `2S0-OPS-01` asks for in Phase 2 needs a real measurement.

---

*References: Implementation Guide V2 §10; `.claude/stack-decision.md` A7 (data
residency, US East). Implements part of `P2-OPS-09`; the production half is
deferred to promotion.*
