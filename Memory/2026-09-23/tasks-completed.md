# 2026-09-23 — tasks completed

The vendor-console block, as agreed at the end of yesterday. The first finding
was that most of these rows were further along than "In progress" suggested —
the work had happened over the previous week and nobody had updated the board.

## `P0-OPS-01` — Railway account, project and billing *(Done)*

Nothing to create. The project has existed since before the 2026-09-21
staging deploy; this was a verification pass against the acceptance.

| Clause | Finding |
|---|---|
| Project exists | `sponsorX`, environments `production` and `staging` |
| In the confirmed region | `web` is **US East (Virginia, USA)** — matches A7's `us-east4-eqdc4a` |
| Billing configured | Pro Workspace, card ending 1115, billing email `rcarr@icarrefound.org` |
| Spend alerts configured | Set today — see below |

### The ownership question, and how it was settled

The workspace reads **`rcarr-crypto's Project`**, which is Railway's naming for
a *personal* workspace rather than a team one, and an `InfiNEX One` workspace
also exists in the sidebar. That was raised as a continuity risk: a personal
workspace has one owner, so if that account were lost the database, volumes and
deploy history go with it.

**The user settled it:** `rcarr-crypto` is the owner, he *is* iCarr, and the
project sits there because his is the account holding Pro. That is the
BTG-controlled account for this purpose. **The question is closed — do not
reopen it.**

### The limits, and the number behind them

Railway's `Set limits` dialog has two independent columns, COMPUTE and AGENT,
each with a hard limit and an email alert. Set:

| | Hard | Alert |
|---|---|---|
| Compute | $50 | $25 |
| Agent | $5 | $0 |

Grounded in real figures rather than guessed: current usage **$1.35**, with
**$2.71** projected for the Sep 18 – Oct 18 period, against **$20 included** on
Pro. So $50 is roughly 18× the projection and about 2.5× what adding the `api`
service, the worker and a staging environment should cost. It is headroom
against a crash-loop or a runaway volume, not a budget.

Agent is capped at $5 because **nothing in this project uses Railway's agent
features**, and an unused feature should not be able to bill. Its alert is $0
because the dialog rejects anything between $1 and $5 — *"Must be $0 or at
least $5"* — and an alert at $5 would fire at the same moment the $5 cap
stopped the feature.

**The compute hard limit stops all resources**, which is the right trade now
and the wrong one later. A note was added to `P8-OPS-01` to raise or remove it
at the production readiness review, because once real athletes and sponsors
depend on the service a self-inflicted outage costs more than the overage.

## `P0-OPS-06` — the domain *(one clause outstanding)*

`sponsorx.net` was registered through Cloudflare on 2026-09-18. Verified today
**from outside the dashboard**, because a registrar's own UI cannot
independently confirm itself: registrar Cloudflare, created 2026-09-18, expires
2027-09-18, `clientTransferProhibited` (registrar lock on), nameservers
`garrett`/`raegan.ns.cloudflare.com`. The dashboard confirmed **auto-renew on**,
scheduled 2027-08-19, thirty days ahead of expiry.

**The written half is now done** — `.claude/stack-decision.md` gained a
`## The domain` section recording all of the above, stating plainly that the
domain is `.net`, and warning that the Implementation Guide's directory tree
still writes `sponsorx.com` and `app.sponsorx.com`, which are dead and will
mislead anyone reading that file for a hostname.

**Outstanding:** whether the *Cloudflare* account is BTG-controlled. The
Railway answer does not automatically transfer — it is a different account.

## `P0-OPS-03` — Clerk *(no work possible today)*

Both instances exist: application `app_3JcMVfla0x1djZe95U38EcsxfRP`, development
`ins_3JcMVgKOWFsPxVEQknFjjWg8d8k`, production `ins_3JcQVIy69lPJqNJb4XcS0PHDe2o`
on `sponsorx.net` with SSL issued.

The second half — "MFA available for privileged roles" — **cannot be reached by
clicking anything.** All three MFA strategies are Pro-badged on the Hobby plan,
and *Require multi-factor authentication* needs one enabled. This row is
blocked on a purchase that was already deliberately deferred to provisioning
step 16.

**Recommended and agreed: not today.** No real BTG staff account exists on the
production instance yet, so paying monthly for MFA before there is a privileged
account to protect is spend with no return. **The trigger that changes it:** the
moment a real admin or finance login is created on production, §26 makes MFA
urgent. When Pro is bought, enable **TOTP and backup codes, never SMS** — G-06
puts SMS out of Phase 1 and phone numbers are already correctly off.

## Two gaps found in passing, both belonging to `P2-OPS-01`

- **There is no `api` service in production.** Only `web` and
  `Postgres-production`. The backend was deployed to *staging* on 2026-09-21
  and never added to production, so the acceptance "web, worker and postgres
  exist in one project" is not met there.
- **Production is not connected to a branch.** The `web` service's Settings
  shows a *Connect Environment to Branch* button rather than a branch name, so
  deploys there are not tracking anything.

Also noticed: an unattached volume, `postgres-volume-Kkpa`, sitting beside
`postgres-production-volume`. Usually the remnant of a recreated Postgres.
Worth identifying before it becomes a billing line nobody can explain — not
touched.

## A note on the console instructions themselves

Two of the click paths given today were wrong, both because Railway has moved
things: region is under **Scale**, not Deploy, and the usage limit is behind
**Set limits** on the workspace Usage page rather than on Billing. Write these
one console at a time, immediately before the person uses them, and expect to
be corrected by the screenshot.

---

# Afternoon — staging deployed, and B5 (deliverables) built

## Staging is live and verified

The Railway work moved to **staging** rather than production, which is where
`api` actually existed and was already wired to `main`.

- **Site:** https://web-staging-904a.up.railway.app
- **API:** https://api-staging-07ea.up.railway.app

```
/health        200  {"status":"ok"}
/health/ready  200  {"status":"ready","checks":{"db":true,"redis":true,"storage":true}}
```

Added Redis (`Redis-KM77`), set `REDIS_URL`, `APP_URL` and a generated
`INTAKE_TOKEN_SECRET` (staging runs `NODE_ENV=production`, so the boot guard
would otherwise have refused to start), gave `api` a service domain on port
4000, and set the healthcheck path. Migrations apply on deploy — six found,
none pending.

Nearly all of this was done with the **Railway CLI**, which was already
installed and authenticated. Console click-work was not needed; check for a
CLI before writing steps for a person.

### Two defects found while deploying

1. **`web` staging pointed at `http://worker.railway.internal:4000`** — a
   service that does not exist. Corrected to `api.railway.internal`. The
   frontend could never have reached the API.
2. **Redis was unreachable over the private network.** `ioredis` defaults to
   IPv4; Railway resolves `*.railway.internal` over AAAA only. Postgres was
   fine because `node-postgres` resolves both families, so only Redis showed
   red. Fixed in **PR #21**; verified by deploying the branch to staging and
   watching `/health/ready` go green, then restoring the trigger to `main`.

### Still open on Railway

- **`api` has no production instance.** Variables, a `main` deployment trigger
  and the Dockerfile path are all configured and waiting, but
  `serviceInstanceDeployV2` and `environmentUnskipService` both return
  *Service Instance not found*. Needs the environment switcher in the UI.
- **`web` in production is frozen** on a pre-21-September commit. Its only
  trigger is on *staging*, so merges to `main` never reach it.
- **Railway builds with Railpack, not the repo's Dockerfiles.** Worth
  reconciling so local compose and the deployed image are not two build paths.

## B5 · Deliverables & creative — five backend tasks closed

`P5-BE-03`, `P5-BE-05`, `P5-BE-08`, `P5-BE-06`, `P5-BE-04` — the whole
milestone, each unblocking the next.

| New file | Purpose |
|---|---|
| `domain/deliverable-state.ts` | The seven-state machine; revision returns to DRAFT_SUBMITTED |
| `domain/deliverable-template.ts` | What each SX job obliges; due dates count **back** from the order's due date |
| `domain/deliverable.ts` | Creation, the approval chain, presigned R2 uploads |
| `contracts/deliverable.ts` + `routes/v1/deliverables.ts` | Nine endpoints |

Two decisions worth recording:

- **The deliverable template is new reference data.** `NilJob` carries a name
  and four prices and nothing about the work, so "derived from the SX job" had
  nothing to derive *from*. The table is in `deliverable-template.ts` and a
  test asserts every catalogue job has an entry — an unmapped job would mean
  an athlete accepting a contract that owes nothing.
- **Due dates count back from `CampaignOrder.dueDate`, never forward from
  acceptance.** Counting forward would let a late-accepted order schedule work
  after the moment the sponsor bought. A late acceptance leaves earlier items
  dated in the past and visibly overdue rather than quietly re-based.

### A second path closed

`transitionCampaign` could reach ACTIVE while doing only two of `P5-BE-04`'s
five writes — the orders stayed at ACCEPTED and nobody was notified. It now
refuses ACTIVE and names `launchCampaign`, exactly as `transitionOrder`
refuses ACCEPTED. The alignment suite's "every domain function is called by a
route" test gained ten more names.

**592 backend + 46 frontend tests pass; the full root build is green.**

## The task board had been undercounting

Every Dashboard and Stage Progress formula hardcoded `$5:$237`, but the sheet
now holds data to row **253** — so 16 rows, two of them already Done, were
invisible to every count. Widened to `$5:$400`. This is the trap `CLAUDE.md`
names, and it had already bitten.

Phase 1: **91 → 96 Done**, Blocked 109 → 97. Closing B5 moved nine rows from
Blocked to Ready (`P5-BE-07`, `P5-FE-02`…`P5-FE-05`, `P5-INT-01`,
`P5-SEC-01`, `P6-BE-01`, `P7-DATA-01`). Stage Progress snapshot for today
updated in place: stage 5 went 3 → 8.

## Also worth knowing

The **graphify knowledge graph is stale** — built 21 September, before the
`frontend/`/`backend/` split. It still indexes `src/server/outbox.ts` and
`src/app/(app)/…`, paths that no longer exist, and knows nothing of
`backend/src/domain/`. It needs re-ingesting before it is trustworthy again.

No read endpoint lists deliverables yet. None of the five acceptances required
one, but the portal screens will — it belongs with the `P5-FE-*` rows now open.
