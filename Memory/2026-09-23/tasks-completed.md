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

---

# Late afternoon — Slack deploy alerts, and B6 (tracking & reward)

## Slack notifications on every deployment

Railway posts to `#deployment` in the SponsorX Slack workspace on every
deployment status change, across both environments.

**How it actually works, because two wrong turns cost an hour:**

- Railway needs **no Slack app install**. It detects a `hooks.slack.com` URL
  and transforms the payload itself — Railway calls this a *Muxer*. The
  `upsertSlackChannel` mutation in its API is for the Railway **Agent** in
  Slack (chatting with `@Railway`), not for deploy notifications.
- **Event Types are required.** I advised leaving the selection empty on the
  reading that empty meant "all". It does not — `Create Webhook` stays
  disabled, so the webhook is never created at all. All 14 Deployment events
  are now selected.
- **`Test Webhook` proves nothing about the webhook.** It posts from the
  browser directly to the URL, bypassing both the event filter and the saved
  record. A successful test alongside silent deploys is exactly the signature
  of "never created".

**Railway's public API cannot see project webhooks.** The entire GraphQL
schema contains one webhook field, `webhookTest` — no query, no create, no
update, and they are not stored as an `Integration` either. So this is
UI-only, like adding `api` to the production environment. Do not promise to
configure it from here.

Volume warning: with all 14 events selected, one deploy posts about four times
(Queued → Building → Deploying → Deployed). If that gets noisy, the set worth
keeping is Crashed, Oom Killed, Failed, Deployed, Restarted.

## B6 · Tracking & reward — five backend tasks closed

`P6-BE-02`, `P6-BE-03`, `P6-BE-04`, `P6-BE-01`, `P6-BE-07` — §39's
*tracking/reward* segment.

| New file | Purpose |
|---|---|
| `domain/reward-state.ts` | DRAFT→ACTIVE→PAUSED→EXPIRED/ARCHIVED, plus the four event types |
| `domain/reward.ts` | Rewards, tokens, the four-event funnel, race-safe redemption |
| `domain/tracking.ts` | Tracking links, resolve/record split, per-athlete codes |
| `contracts/reward.ts` + `routes/v1/rewards.ts` | 7 staff endpoints + **6 public ones** |

### Decisions worth remembering

- **The public surface is real now.** Six endpoints under `/api/v1/public/`
  carry no auth, because §16's fan scans a QR at a stall and is never asked to
  log in. They are grouped under one path prefix so the unauthenticated set is
  visible at a glance rather than discovered by noticing a missing middleware.
- **Redemption is public too.** There is no MERCHANT role in §15 and there
  should not be — the person at the till is not a SponsorX user. Possession of
  the token IS the entitlement, like a paper voucher, which is why tokens are
  160 bits of randomness and never the record id.
- **The single-use rule is the index, not an `if`.** `redeemToken` attempts
  the insert and catches P2002 from `reward_single_redeem`. A read-then-write
  check is the obvious implementation and it loses the race every time two
  merchants scan the same code in the same second. The test drives ten
  concurrent redemptions and asserts exactly one REDEEM row.
- **`resolveCode` performs no write, ever.** That is what makes P6-BE-01's
  "the fan never waits on our write" true, and it is the half that could
  silently regress — so the test counts writes during resolution and requires
  zero. Resolve and record are two exports precisely so no single call could
  be awaited before the redirect.
- **P6-BE-07 falls out of the schema rather than needing a mechanism.**
  `TrackingLink.deliverableId` is unique, a deliverable belongs to one order,
  an order to one athlete — so one link per deliverable already is one code
  per athlete. `codesForCampaign` is the read that proves it.

### A subtlety in the redirect

The Next route calls the API from `after()`, so the API sees **the Next server**
as its caller and `req.ip` would geo-resolve every click to Railway. The fan's
address is forwarded on `x-sponsorx-client-ip` — deliberately not
`x-forwarded-for`, so it reads as our convention rather than something
infrastructure set. That header is **analytics-grade, not trust-grade**: the
endpoint is public, anyone can set it, and the cost is a wrong city on a chart,
never a crossed permission boundary. `P6-BE-05` owns geo and can tighten it.

Verified `after()` against the vendored Next 16.3.5 docs rather than memory —
note `next` hoists to the **repo root** `node_modules`, not `frontend/`.

**677 backend + 46 frontend tests pass; full root build green.**

Phase 1: **96 → 101 Done**, Blocked 97 → 87. Seven rows moved Blocked → Ready
(`P6-BE-05`, `P6-BE-06`, `P6-FE-01`…`P6-FE-03`, `P6-INT-02`, `P6-SEC-01`).
Stage 6 went 0 → 5.

---

# Evening — B7 earnings spine, plus B6/B5's two worker jobs

`P7-BE-01`, `P7-BE-02`, `P7-BE-03`, `P6-BE-06`, `P5-BE-07`.

## A blocker found before starting, not after

**`P6-BE-05` (geo worker) cannot be finished yet.** `maxmind` is already a
declared dependency, but there is **no GeoLite2 `.mmdb` in the repo** and the
package ships no test database. That file needs a **MaxMind account and
licence key**. Its acceptance is "resolves against local GeoLite2", which
cannot be verified without it — so it was left open rather than closed on a
promise. Same shape as `P0-OPS-03` needing a domain: a real-world prerequisite
that no task covers and that `Depends On` cannot show.

## What was built

| File | Purpose |
|---|---|
| `domain/earning-state.ts` | PENDING→ELIGIBLE→APPROVED_FOR_PAYOUT→PAID, HELD/DISPUTED aside |
| `domain/earning.ts` | The record, the money split, automatic eligibility |
| `contracts/earning.ts` + `routes/v1/earnings.ts` | Finance surface — 3 endpoints, no public one |
| `worker/jobs/generate-qr.mts` | QR PNG → **private** bucket (P6-BE-06) |
| `worker/jobs/derive-image.mts` | 320/640/1280 webp via sharp (P5-BE-07) |

New dependencies: `qrcode` + `@types/qrcode`; `sharp` was already resolved in
the tree and is now declared. B0 is long done, so the dependency freeze no
longer applies.

## Decisions worth remembering

- **A deliberate divergence from `P7-BE-02`'s wording.** The task says
  "closing an accepted deliverable makes the associated earning ELIGIBLE".
  Read literally that fires on the FIRST deliverable — but an Earning is per
  ORDER and SX-07 owes four weekly posts, so it would owe an athlete the whole
  fee for a quarter of the work. It fires when the LAST one is verified.
  Recorded in the code, tested, and raised on the PR rather than quietly
  reinterpreted.
- **The earning is raised at acceptance, not completion.** Otherwise the
  period between signing and delivering shows an athlete owed nothing for work
  they are already contractually committed to.
- **ELIGIBLE and APPROVED_FOR_PAYOUT are kept apart.** ELIGIBLE is a fact
  about the work; APPROVED_FOR_PAYOUT is a person in Finance deciding. Merging
  them would let completing a deliverable authorise money with nobody looking.
- **`maybeMakeEligible` only ever promotes from PENDING.** An earning a human
  put on HOLD or into DISPUTE must not be quietly released by the last
  deliverable landing.
- **The QR goes in the PRIVATE bucket.** It is a picture of a bearer
  credential, and the public bucket is a CDN with no access control by design.
- **"No tax ID, no bank details" is tested as a shape**, not trusted as an
  intention — assertions run against `schema.prisma` and the published
  contract. The whole schema greps clean for `taxId`, `bankAccount`,
  `routingNumber`, `iban`, `sortCode`.

## A test guard improved rather than patched

`alignment.test.ts` asserted the literal contents of `HANDLED_JOBS`, so it
broke every time a handler shipped — a chore, not a guard. It now asserts the
invariant the worker's own comment states: every handled name has a matching
`boss.work()` registration. The failure that actually matters is a name in the
set with no consumer, which would mark rows dispatched and let the work expire
unread.

Also removed a test of my own that passed by catching its own error and
asserting `null` — it proved nothing.

**780 backend + 46 frontend tests pass; full root build green.**

Phase 1: **101 → 106 Done**, Blocked 87 → 80. Five rows moved Blocked → Ready
(`P6-ART-01`, `P7-FE-01`, `P7-FE-02`, `P7-SEC-01`, `P7-SEC-02`). Stage 5 → 9,
stage 6 → 6, stage 7 → 3.

---

# `P6-BE-05` · Geo resolution — built, at Code review, not Done

Built on request after I flagged it as blocked. Everything in our control is
done and tested; one acceptance clause cannot be verified here, so the row is
at **Code review** with the reason in its Notes rather than at Done.

## The §26 problem the task's own wording hides

The acceptance says the raw IP "**lives only in the job payload**". That is
only true if a payload is transient — and **ours is not**. The drain marks
`OutboxJob` rows `dispatchedAt` and **never deletes them**, so without
intervention the address of every fan who ever tapped a link would sit in
Postgres indefinitely.

So the drain now strips it, in the same transaction that marks the row
dispatched and *after* `boss.send` has already carried the full payload to the
queue:

```sql
UPDATE "OutboxJob" SET payload = payload::jsonb - 'clientIp'
 WHERE id = ANY($1::text[]) AND name = 'tracking.resolveGeo'
```

The `::jsonb` cast is belt and braces: `-` is a jsonb operator, and on a plain
`json` column it would abort the **whole drain transaction**, not just that
statement. The column is jsonb (verified in the init migration), but the cast
makes it correct either way. **It could not be checked against a live
database** — Railway's Postgres is private-network-only with no TCP proxy, so
`psql` from this machine cannot reach it.

## Other decisions

- **The reader is opened once, at worker boot**, not per job — GeoLite2 is
  ~100 MB and memory-mapped. `GEOLITE2_CITY_PATH` is **optional**: a checkout
  without the file starts normally, logs that it has none, and records clicks
  with no location. A missing dimension on a chart beats a worker that will
  not boot.
- **`x-forwarded-for` is a divergence.** The task says the job reads that
  header; it cannot, because by the time the job runs the request is over. The
  address is captured at the redirect route, forwarded to the API on
  `x-sponsorx-client-ip`, and arrives in the payload.
- **Private ranges are skipped before the lookup**, so a dev machine does not
  log a miss per click. The test pins 172.15 and 172.32 as *public* — an
  off-by-one on the 172.16–172.31 block would silently drop real traffic.
- **The lookup is injected**, like the storage functions in the QR and image
  jobs, so the rules are testable without the licensed file.

## What is still needed to close it

A `GeoLite2-City.mmdb`: free MaxMind account → licence key → download → set
`GEOLITE2_CITY_PATH`. Then watch one real click resolve to a city and move the
row to Done.

**808 backend + 46 frontend tests pass; full root build green.**

---

# Evening (2) — metrics, the sponsor report, and the Zoho invoice mirror

`P7-DATA-01`, `P7-DATA-02`, `P7-BE-05`, `P7-BE-04`, `P3-BE-02`. **One branch
this time**, after the stacking mistake earlier today.

## A decision found before building: G-07 says NO PDF worker

`P7-BE-06`'s acceptance is conditional — *"If G-07 requires a PDF... If not,
this task is closed as not-required."* **G-07 recommends a print stylesheet,
not a server-rendered PDF**, and `P0-PMO-06` concludes no Phase 1 requirement
for server-side rendering exists.

But **G-07's confirmation block is blank** — no Yes/No, no signatory, no date
— even though `P0-PMO-05` is marked Done. So the decision is written but not
confirmed, and closing `P7-BE-06` as not-required is a business call, not
mine. Left open and raised. *(It has since moved to Ready as its dependencies
closed, which is the board being literal — it should probably be Dropped.)*

## Provenance is enforced by SHAPE, not by discipline

§22 names conflated provenance as the product's biggest credibility risk, so
nothing in this area returns a single number:

- `SourcedTotals` has five required keys. The published contract types it that
  way, so §8's service account and INFINEX literally cannot receive a blended
  figure from these endpoints.
- The blended total exists — "total reach" is a real question — but only as
  `blendedTotalRequiringDisclosure()`, named so no reader mistakes it.
- **The rollup groups BY SOURCE.** A rollup that summed the labels away would
  destroy the distinction one layer below where anyone would look for it.
- `VERIFIED_API` rows record **no `enteredBy`** — stamping a staff id on an
  automated read would make it look like a human attestation.

## The rollup stores nothing authoritative

There is no aggregate table. Totals are a `GROUP BY` over `MetricDaily`, and
the job writes only to Redis (cache-only per Addendum A3). That is what makes
"aggregates are reproducible from events" true *by construction* — a stored
total can drift from its rows after a backdated correction or a missed run,
and nothing would compare them.

## The report invents nothing

Media value is a CPM against **verified impressions only**, and always carries
a `basis` string saying so. Self-reported reach is usually the largest figure
available; including it would inflate the most-quoted box on the page. There
is a test asserting the ABSENCE of demographics, sentiment, benchmarks and
brand lift — Phase 1 collects none of them.

## Migration verified against a real Postgres

`CampaignInvoice` needed a migration and there is no local database, so an
embedded Postgres was spun up in the session scratchpad and **all seven
migrations applied from scratch**. Confirmed the table, its four indexes —
and two things from earlier PRs that had been unverifiable:

- **The geo scrub works**: `payload::jsonb - 'clientIp'` → `{"linkEventId":"lev_1"}`.
  That was the one untested line in PR #25.
- `reward_single_redeem` exists as a partial unique index on REDEEM.

**Worth repeating: `npm i embedded-postgres` in the scratchpad gives a real
database in about a minute.** Use it whenever a migration is written.

## §15 has no `invoice` resource

`invoicesForCampaign` is gated on **`campaign` read**, not an invented
`invoice` resource — `policy.ts` is a transcription of the RBAC matrix, and
adding a resource the document does not contain would put an unreviewed
permission in the code. An invoice is a fact about a campaign, so the gate is
honest. Raised on the PR: §15 should gain an invoice row.

## Also

`Actor` now carries `propertyId` — the column was already on `User` but never
carried, which is why every `own-property` scope silently matched nothing.
`P3-BE-02`'s sponsor scope has two halves and the second is the confidential
one: **ACTIVE only**, so a sponsor never learns an athlete was rejected or
suspended.

**887 backend + 46 frontend tests pass; full root build green.**

Phase 1: **106 → 111 Done**, Blocked 80 → 72. Stage 7 went 3 → 7.

---

# Night — stage 7's data and security layer

`P7-DATA-03`, `P7-DATA-04`, `P7-DATA-05`, `P7-SEC-01`, `P7-SEC-02`. One
branch. Stage 7 is now 12 of 20, with only `P7-BE-06` (the PDF worker, which
G-07 argues against) and frontend rows left.

## A deliberate exception to "never store a derived number"

`P7-DATA-02` established that aggregates are always recomputed and never
stored, because a stored total drifts from its rows. **`P7-DATA-03` stores
one anyway**, and the distinction matters:

- An **aggregate over rows** must be recomputed — it has a current truth.
- A **historical belief** must be frozen — `projectedImpressions`,
  `impliedCpm` and `projectionSource` record what we thought a line was worth
  *when we sold it*. The athlete's follower count moves constantly, so
  recomputing later answers "what would we project today" and destroys the
  only signal worth having: whether our pricing was right.

Same reasoning that freezes `compensation` and `sellPrice` at send.

All three columns are nullable. An athlete with no audience figure gets no
projection, and **null says so — a zero would be a claim** that the line
reaches nobody, and would make the CPM a division by zero.

## Judgements inside the projection

- **Average views beats follower count.** Followers are an audience that
  *might* see something; avgViews is roughly how many did. Followers are the
  fallback, discounted by `FOLLOWER_TO_IMPRESSION_RATE` (0.1) — treating every
  follower as an impression overstates reach by an order of magnitude.
- **The strongest single account, never the sum.** Posting one deliverable to
  two platforms does not reach the combined audience.
- **`projectionSource` travels with the number.** It is almost always
  SELF_REPORTED, and an implied CPM quoted without that label reads as though
  it rested on verified reach.

## Two kinds of under-delivery, kept apart

`P7-DATA-04` reports work-not-delivered and reach-below-projection
**separately**. Overdue deliverables are unambiguous and actionable — someone
chases the athlete. A reach shortfall is softer, because the projection was
built from self-reported figures, so it may mean the athlete overstated their
audience rather than that anything went wrong. **They need different phone
calls**, so a single "health score" would have hidden which was happening.

Threshold is 0.7, not 1.0: a dashboard that fires at 99% is ignored inside a
week.

## The two SEC tasks are structural, not behavioural

- **`P7-SEC-01`** discovers every exported function in the money modules **by
  reading the source** and asserts each one audits. A behavioural test only
  proves the functions it happens to call are covered; this covers the one
  somebody writes next month. Escaping it requires naming the function in an
  explicit `READ_ONLY` list — a visible act, not an omission.
- **`P7-SEC-02`** scans the whole schema and every source file for a narrow,
  literal list of forbidden fields, plus the dependency list for payment SDKs.
  **The point is the day somebody adds `taxId` so a 1099 can be generated** —
  it looks reasonable in isolation and would pass review. Deliberately not a
  fuzzy regex on "tax": `taxYear` is legitimate, and a check that cries wolf
  gets disabled.

## Process notes

- **Ran `npm run lint` this time**, which caught two unused imports before
  CI did. Build and test alone are not enough — CI runs lint.
- The `order_implied_cpm` migration was verified by applying **all eight
  migrations from scratch** to an embedded Postgres in the scratchpad, as with
  `CampaignInvoice`.

**975 backend + 46 frontend tests pass; build green; lint clean.**

Phase 1: **111 → 116 Done**. Stage 7: 7 → 12.

---

# Late — notifications, fan consent, and three security proofs

`P5-INT-01`, `P6-INT-02`, `P6-SEC-01`, `P4-SEC-01`, `P5-SEC-01`. One branch.

## B8 was the obvious next milestone and is NOT startable

`P8-INT-01` (Zoho outbound push) is Ready on the board but **blocked in
reality**, and the field-mapping document says so itself — its status line
reads *"Two items carry an explicit OPEN marker and must be closed before the
code that depends on them is written."*

- **O-5 · UNRESOLVED** — Zoho user ↔ BTG staff mapping and who owns records
  the service account creates. Its own note: *"Otherwise CRM records land
  ownerless and nobody is notified."*
- **O-2 · needs sign-off** — Campaign represented as a Deal.
- **O-6** — **there is no sandbox org.** Any push writes to the live iCARRe
  Foundation CRM, against the standing sandbox-first preference.

The row is now **Blocked** with those reasons in its Notes. Read
`documentation/SponsorX-Zoho-Field-Mapping.md` §10 before picking it up.

Also worth knowing: that document says the dedupe key is **`SponsorX_ID`**,
while `P8-INT-01`'s acceptance says `External_Id`. The document is v0.2,
revised against the live org, and is the later artefact — but the two should
be reconciled before the code is written.

## Consent is three columns, not a boolean

`RewardEvent.fanEmail` is the only fan PII this system holds, and it could
previously be written with nothing recording that the fan agreed.

- **The version is the point.** "They consented" stops being evidence the
  first time the wording is edited — and it always gets edited. The version
  string identifies the text that was on screen.
- **Purpose is scoped.** Agreeing to be sent a voucher is not agreeing to
  marketing, and one flag loses that the first time somebody exports the
  claims for a campaign.
- `consentFor()` refuses an address arriving without a **known** version and a
  **known** purpose, so there is no path that writes fan PII unevidenced. The
  test asserts that a refusal writes **nothing at all** — not the claim, not
  the address.

## Notifications commit with the thing they announce

Deliverable messages are enqueued **inside the same transaction as the state
change**, so an athlete is never told their work was approved by a
transaction that then rolled back. Idempotency keys carry the state, so
re-entering DRAFT_SUBMITTED after a second revision sends again — correct,
it is a new request — while a retried transition does not.

Deadline reminders are a **sweep**, like invitation expiry: a per-deliverable
timer that is lost leaves that athlete never reminded. The window is in the
idempotency key, so hourly sweeps do not produce twelve emails, and 3-day and
1-day are distinct sends.

## The security suites are structural

- **`P4-SEC-01`** — the task says inspection is not enough, and it is right:
  the rule lives in two places. Matching excludes via `NOT hasSome`; the
  invitation re-checks and throws. **The second is the one that matters** —
  a shortlist built this morning must not let a desk make a forbidden offer
  this afternoon. Also pins `hasSome` over a negated `hasEvery`: an athlete
  barring *any* listed category is a conflict.
- **`P5-SEC-01`** — proves no presigner can be exported without an audit in
  front of it, that the raw presigner stays unexported, and that the TTL
  constant is used everywhere rather than a literal. Checked the QR and
  derivative jobs at the **wiring** in `worker/index.mts`, not in the jobs'
  own text — grepping a job for "public" only found the comment explaining
  why it is not used.

## A missing artefact fixed

`P6-INT-02` was on the board at fractional order 131.5 with a full acceptance
but **no section in the phase document**. Written in, per the rule that a
definition is fixed in the Markdown rather than reinterpreted in the tracker.

**1015 backend + 46 frontend tests pass; build green; lint clean.** Both
migrations verified by applying all nine from scratch to an embedded Postgres.

Phase 1: **116 → 121 Done**.
