# Monitoring and Alerting Plan

**Task `P2-OPS-11` · Version 1.0 · 2026-10-07 · Status: in force, both environments**

`P2-OPS-11` asks for four things visible — service health, queue depth, failed
jobs, error rate — and for **someone to be paged when the worker stops
draining**. All four are visible, and the page is a Slack alert from the health
monitor. This document says where each one is read and what raises an alert.

Version 0.1 (2026-09-18) recorded three blockers: no real worker, no public
address, no alert destination. All three are gone: the worker runs pg-boss
(Addendum B), staging and production have public addresses, and the health
monitor posts to Slack (2S8-OPS-01).

---

## Where each signal is read

| Signal | Where | Refreshed |
|---|---|---|
| **Service health** | `GET /api/v1/public/health` (the API's `/health/full`): Postgres, Redis, storage, backups and the queue, each ok or not. Also the health monitor's job summary in the Actions tab. CPU, memory, network and volume: `railway metrics --all --environment <env> --since 1h` | Every 15 min (monitor); live (Railway) |
| **Queue depth** | `checks.queue.depth` in the same answer: jobs due and not yet picked up, plus outbox rows waiting to be dispatched. Per job type and per tenant: the admin portal's integration-health page (P8-FE-01) | Every 15 min; live |
| **Failed jobs** | `checks.queue.failedLast24h`: jobs that ran out of retries in the last 24 hours. The job names and their errors: the integration-health page | Every 15 min; live |
| **Error rate** | `traffic` in the same answer: API responses in the last 15 minutes, how many were 5xx, and the rate. 4xx is the caller's mistake and is not counted as an error | Every 15 min |

The health monitor writes all of these into each run's job summary, so a run in
the Actions tab (`Health monitor`) is the dashboard. To read it live:

```bash
curl -s https://sponsorx.net/api/v1/public/health
curl -s https://web-staging-904a.up.railway.app/api/v1/public/health
```

The answer is public, so it holds only booleans, counts and minutes — no job
name, host or error message.

---

## What alerts

| Alert | Condition | Who hears |
|---|---|---|
| **Worker not draining** | A due pg-boss job, or an outbox row the worker would dispatch, has waited **more than 15 minutes** | Slack, through the health monitor |
| Site or API down | `/` or the health answer fails 3 attempts in a row | Slack, same path |
| Backups stale | Last WAL archive older than 60 minutes (the RPO) | Slack, same path |

**How "not draining" is measured.** A worker can be up, with CPU and memory
healthy, and still do nothing. So the check looks at the work itself, in both
places it can stall:

- **pg-boss:** the oldest job whose start time has passed, in state `created`
  or `retry`, not blocked by a queue policy;
- **the outbox:** the oldest row not yet dispatched, of a type the worker
  handles. Two kinds of row wait there on purpose and are left out: a type
  with no handler yet, and a Zoho CRM job on a worker without CRM credentials
  (production today). Counting them would alert forever.

An empty queue is not a stall. The signal appears as soon as anything is
enqueued, which every sign-up, order and email does.

The monitor runs every 15 minutes, so a stalled worker is announced between 15
and 30 minutes after its oldest job came due. Slack hears once when it starts
failing and once when it recovers (runbook: *Alerts* in
`SponsorX-Database-Backup-Runbook.md`).

**Failed jobs and the error rate are visible, not alerting.** A threshold set
before there is a baseline produces noise. After a few weeks of real traffic,
set one from the numbers in the job summaries.

**If the queue alerts:** check the API service's logs in Railway for
`[worker]` lines. The worker runs in the same process as the API
(`src/combined.mts`), so a redeploy restarts it:
`npm run deploy <environment>`.

---

## Not built, and not needed for this task

- **Railway deployment failed / volume above 80%.** Railway raises these
  through project webhooks, which are set up in the console only
  (Project → Settings → Webhooks). A deploy failure is visible in Railway and
  in `npm run deploy`. Add them if either is ever missed.
- **A real on-call tool.** Slack is the alert destination for the pilot.

---

*References: Blueprint §38; Implementation Guide V2 §10. Code:
`backend/src/domain/system-health.ts`, `backend/src/lib/request-stats.ts`,
`scripts/health/monitor.py`. Implements `P2-OPS-11`.*
