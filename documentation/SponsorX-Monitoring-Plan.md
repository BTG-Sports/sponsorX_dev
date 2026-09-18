# Monitoring and Alerting Plan

**Task `P2-OPS-11` · Version 0.1 · 2026-09-18 · Status: partial — two halves blocked**

`P2-OPS-11` asks for four things visible — service health, queue depth, failed
jobs, error rate — and for **someone to be paged when the worker stops
draining**. Two of the four are observable today. The other two, and the paging,
depend on things that do not exist yet. This document records which is which, so
nobody reads a green board row as meaning the system is watched.

---

## What is observable today

Confirmed on 2026-09-18 with `railway metrics --all --environment staging`.

| Signal | Source | State |
|---|---|---|
| CPU per service | Railway metrics | **Live** |
| Memory per service | Railway metrics | **Live** |
| Network in/out per service | Railway metrics | **Live** |
| Volume usage vs limit | Railway metrics | **Live** — the database volume is the one that fills silently |
| Deployment success/failure | Railway deployment status | **Live** |
| Service up/down | Railway service status | **Live** |

```bash
railway metrics --all --environment staging --since 1h
railway metrics --all --environment production --since 1h
```

That is genuine service health. It is not alerting — nobody is told.

---

## What is not observable, and why

**Queue depth and failed jobs — blocked on the worker being real.**
`worker/index.js` is a placeholder; pg-boss is not attached, so there is no queue
to measure. These two signals arrive with the task that attaches pg-boss, and
they are the ones that matter most: a worker that is *up* but not *draining* is
the failure this task exists to catch, and CPU and memory both look perfectly
healthy while it happens.

**HTTP error rate — blocked on the app being reachable.** Railway reports HTTP
metrics for services that receive HTTP traffic. `web` has no public domain in
either environment, so there is no request volume and no error rate to read. This
resolves when a domain is generated.

**Paging — blocked on a decision and on click-work.** Railway's project webhooks
are configured in the console only; they are not in the public GraphQL API, so
this cannot be scripted. And a webhook needs a destination, which is a vendor
choice nobody has made: Slack, email, or a real on-call tool.

---

## The alerting design, for when those unblock

Four alerts, in the order they should be built. Each names the failure it
catches, because an alert whose meaning is unclear gets muted.

| Alert | Condition | Why it matters | Who |
|---|---|---|---|
| **Worker not draining** | Oldest queued job older than 15 min while worker is up | The silent failure. Everything looks healthy; invitations, emails and Zoho syncs simply stop. | Page |
| **Deployment failed** | Railway deployment status FAILED or CRASHED | A release did not land. Someone is waiting on a fix that never shipped. | Notify |
| **Database volume filling** | Volume usage above 80% of limit | Fills slowly, then everything stops at once. Plenty of warning if anyone is looking. | Notify |
| **Job failure rate** | Failed jobs above a threshold over 15 min | Distinguishes "one bad job" from "every job of this type is broken". Threshold set once there is a baseline — guessing it now produces noise. | Notify |

**Only the first pages.** An alert that wakes someone must be one they can act on
at 3am; the rest can wait for a working day. Paging on everything is how a team
learns to ignore the pager.

---

## What has to happen next, in order

1. **Attach pg-boss to the worker.** Until then, half of this task is unbuildable.
2. **Choose the notification destination.** A vendor decision, not a technical
   one. Email is acceptable for Phase 1 with two people; it is not acceptable for
   the pilot.
3. **Configure the Railway webhook in the console** — Project → Settings →
   Webhooks. Not scriptable; it is click-work, once.
4. **Set thresholds from a baseline**, not from guesses. A week of real numbers
   makes the job-failure threshold obvious.

---

*References: Blueprint §38; Implementation Guide V2 §10. Implements part of
`P2-OPS-11`, which stays open until the queue exists and someone is actually
paged.*
