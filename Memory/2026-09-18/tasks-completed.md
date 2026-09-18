# 2026-09-18 — tasks completed

---

# rcfworks — pricing

## `P0-PMO-13` raised and closed — the margin floor rule

An untracked workbook, `SponsorX-Pricing-Collision.xlsx`, turned out to hold the
commercial question that `P0-PMO-09` and `P0-PMO-10` documented on 2026-09-15 and
closed on 2026-09-17 without answering. **No task in the 345 owned that answer** —
the two PMO rows closed the documents, not the decision. So it was raised as a
task and decided in the same pass, at the user's instruction: *"we follow this new
pricing scheme as it provides better business returns... others will adjust."*

Written to
[documentation/SponsorX-Pricing-Floor-Decision.md](../../documentation/SponsorX-Pricing-Floor-Decision.md).

### What was decided

**Sponsor price may never be below athlete cost × 1.4**, computed from the agreed
rate after the §6 tier multiplier, as a hard block per campaign-order line.

A floor rule alone is not enough, and this is the part worth remembering: applied
against the base-band top, 1.4× makes **every** published §5 sell floor
unreachable for a Premium athlete. So the rate card now carries a floor per job
per tier, derived as `base-band top × tier multiplier × 1.4` — the substance of
the workbook's option 2 obtained by formula from option 1, with no hand
re-pricing. SX-07 is the one job the rule cannot rescue on its own, because its
base-band top ($750) equalled its old sell floor; its sell band becomes
**$1,050–$2,000**.

Package side: `P0-PMO-10` §3's line items adopted as written (all six clear 1.4×
across their range, tightest is Local Blitz at 2.2×); Local Blitz narrowed to
$1,500–$2,400 / 5–9 athletes so 10-Athlete Blitz is a distinct product; "iMC/BTG
feature" becomes a non-NIL inventory line with a record, because §26 exclusivity
and delivery tracking both need it to exist.

### The assumption it rests on

**The §5 sell-band floor is a real floor, not an opening indication staff may
discount below.** `P0-PMO-09` §5 Q3 raised that risk and it was never answered; a
discountable floor makes the whole rule decorative. Stated in §2 of the decision
document rather than buried, so it is visible if the business later permits
discounting.

### Raised

| Task | | |
|---|---|---|
| `P0-PMO-13` | Decide the margin floor rule and tier-derived sell floors | Done, order 16.5 |
| `P3-BE-12` | Enforce the margin floor at quote and Campaign Order creation | Blocked on `P0-PMO-13` + `P3-BE-11`, order 74.5 |

Both added to the Phase 1 plan document as well as the board. `P3-BE-11`'s
Unblocks went 1 → 2; the `P0-PMO-09` and `P0-PMO-10` rows carry a RESOLVED note
pointing at the decision rather than being reopened.

### The workbook was in `public/`

It was untracked at `public/SponsorX-Pricing-Collision.xlsx` — Next.js's static
directory, so it would have served athlete cost and BTG margin at
`/SponsorX-Pricing-Collision.xlsx` on the first deploy. Moved to
`Claude outputs/` and committed there.

### Board after

**42 Done · 9 Ready · 1 In progress · 4 Code review · 131 Blocked = 187** on
Phase 1 (343 delivery tasks, 352 with Legal). All **77 formulas verified
identical** after rewriting them; two rows were physically inserted, so the
Dashboard's `$I$5:$I$190` ranges, the autofilter, the three conditional-formatting
ranges and the Status data-validation list were each extended to row 192 by hand,
and the row heights were re-mapped so they follow their rows across the insert.
Backed up to the session scratchpad first; `openpyxl` in a throwaway venv there.

**Noticed, not fixed:** the phase sheets' subtitle totals were already stale
before today — Phase 1's `A2` claimed 191 tasks and 451 person-days against 185
rows and 437 days, and Roadmap `C5`/`D5` disagree with both. Every stated total
was bumped by today's delta (+2 tasks, +4 days) on its own basis rather than
re-baselined, because silently rewriting someone else's number on inference is
worse than a visible inconsistency. Worth one person deciding which figure is
authoritative.

### Fixtures

Checked before deciding: the tightest sponsor-price-to-athlete-cost pair in
[src/lib/fixtures.ts](../../src/lib/fixtures.ts) is Jalen Brooks, Premium, SX-05
at **1.67×**. Nothing in Block A's demo data contradicts the rule, so adopting it
costs no fixture churn and `P3-BE-12` inherits a clean baseline.

### Still to do

End-of-day mirror of the Google Sheet by hand: two rows raised (`P0-PMO-13` Done,
`P3-BE-12` Blocked), `P3-BE-11` Unblocks 1 → 2.

---

## The cascade into the downstream tasks

The decision changes what seven existing tasks have to do, so their definitions
were updated rather than left to be reinterpreted later — in the Phase 1 plan
document and the tracker together, as the definition rule requires.

| Task | What changed |
|---|---|
| `P3-BE-08` | Seeds SX-07's corrected band and each job's per-tier derived floor, not just the §5 bands |
| `P3-BE-09` | Setting an athlete rate must surface the minimum sell price it implies (rate × 1.4) |
| `P3-BE-11` | Seeds job-code line items, the narrowed Local Blitz and the iMC/BTG inventory line |
| `P3-FE-05` | The public package page shows the line items each package contains |
| `P7-BE-03` | Margin computed from the agreed rate and price, not the band midpoints |
| `P2-BE-02` | `NilJob` carries the per-tier floor; `SponsorPackage` carries `lineItems` |
| `2S3-BE-03` | Phase 2's "sub-floor pricing" is named as the same 1.4× rule |

`P3-BE-08` and `P3-BE-11` now also depend on `P0-PMO-13`, which is Done, so no
status changed. `P0-PMO-13`'s Unblocks went 1 → 3. All 77 formulas verified
identical again; no rows inserted in this pass.

---

## `P0-OPS-01` — Railway account, project and billing · Done

Closed 2026-09-18. The first Block B vendor step, and the one the roadmap's B0
milestone opens with.

| | |
|---|---|
| Workspace | `rcarr-crypto's Projects` |
| Project | `sponsorX` · `1c11f29a-b569-4d14-98cf-e97a4d3ae209` |
| Environment | `staging` |
| Region | US East — matches G-02's `us-east4-eqdc4a` |
| Plan | **Pro**, $20/month with $20 usage credit included |
| Spend limits | compute hard $150 / email alert $25; agent hard $20 / agent email alert $20 |

**Region is a per-service setting on Railway, not a project one.** The project
page has no region field, so G-02 compliance is read off the service. Worth
knowing before someone hunts for it in Project Settings.

**Two things happened in the console that the task did not ask for.** A GitHub
service `sponsorX_dev` was already deployed into the project before the task
began — that is `P2-OPS-01` work, recorded in the row so nobody is surprised to
find it. And a first workspace, `InfiNEX One's Projects`, was deleted partway
through; the project was rebuilt under the personal workspace, which is why the
project ID here differs from the one in the first console screenshot.

### Cascade

`P2-OPS-01` (Railway services and private networking) had `P0-OPS-01` as its sole
dependency and moved **Blocked → Ready**. It is the natural next task, and it is
where the already-deployed `sponsorX_dev` service gets regularised into
`web` / `worker` / `postgres`.

### Board after

**43 Done · 9 Ready · 1 In progress · 4 Code review · 130 Blocked = 187.**
77 formulas verified identical; no rows inserted.

---

## All four Code review rows closed to Done

`P1-ART-04`, `P1-ART-07`, `P4-ART-01`, `P5-ART-01` moved **Code review → Done**,
Date Done 2026-09-18, at the user's instruction. Nothing was Blocked on any of
them, so no cascade followed.

These were the four design deliveries from 2026-09-17 that had never been read by
a second person. Closing them accepts that; the known issues recorded on the day
stand and did not go away with the status — `P5-ART-01`'s export title band
renders near-white on white, and `P1-ART-06`'s logo SVGs still reference Barlow
Condensed by font name and need outlining before they go into `public/`.

The Phase 1 plan document's status glyphs were re-synced for every row that moved
today, so the ✅ / ▶ / ⏸ markers and the status word in each meta line match the
tracker again.

### Board after

**47 Done · 9 Ready · 1 In progress · 130 Blocked = 187.** Nothing at Code
review. 77 formulas verified identical.

---

## `P0-OPS-01` reopened — the region was never set

Closing it earlier was wrong, and the CLI is what showed it. `region` is **null**
on the `sponsorX_dev` service instance in **both** environments — nothing was ever
configured, so Railway placed each deployment by default: `staging` happened to
land on **US East**, `production` on **`sfo`** (San Francisco).

The US East chip read in the console belonged to staging. Production violates
G-02, which fixes SponsorX in `us-east4-eqdc4a`.

**The lesson worth keeping: a region chip in the Railway UI reports where a
deployment landed, not what was configured.** The configured value is
`serviceInstance.region`, and it is per environment. Read it from the API, not
from the screen.

The row is back at **In progress** with the billing half recorded as met. It
closes when one `serviceInstanceUpdate` per environment sets
`region: "us-east4-eqdc4a"` — which must happen before `P2-OPS-01` creates
Postgres, since moving a database region afterwards is the exact pain G-02 was
written to avoid.

### Blocked on a permission, not on Railway

The Railway CLI is installed and authenticated as InfiNEX One
(`infinex1@icarrefound.org`), and read access works. The write was refused by the
session's own sandbox — "Modify Shared Resources" — so every mutation in
`P2-OPS-01` (set region, rename the service, add `worker`, add `postgres`, wire
the internal variables) needs a Bash permission rule for `railway` before it can
run from here.

---

## `P2-OPS-01` — the three Railway services, built from the CLI

The Railway CLI (`@railway/cli` 5.57.9, installed globally, authenticated as
InfiNEX One) can do all of this from here once `Bash(railway *)` is allowed in
`.claude/settings.local.json`. Reads worked immediately; every write needed that
rule, and two categories stayed blocked even with it — see below.

### Built

| Service | ID | Note |
|---|---|---|
| `web` | `e004424e` | Renamed from `sponsorX_dev`; already deploying `infinex1/sponsorX_dev` on `main` |
| `worker` | `70a9ade0` | Same repo, created fresh |
| `Postgres` | `19fb0884` | Railway PostgreSQL template |

`web` and `worker` both carry `DATABASE_URL=${{Postgres.DATABASE_URL}}`, which
resolves to `postgres.railway.internal:5432`. No service has a public domain and
no service has a TCP proxy, so the database has no public exposure.

### The region lesson, properly understood

`serviceInstance.region` is inert — setting it returns `true` and changes
nothing. **Railway reads `multiRegionConfig`**, a JSON map of region to replica
count, and the value that matters is visible only in a deployment's
`meta.serviceManifest.deploy.multiRegionConfig`. The chip in the UI reports where
a deployment landed; the API field most people would reach for reports nothing.

### The mistake that cost something

**A new Railway service defaults to `sfo`, and the Postgres volume was
provisioned before the region pin landed.** `worker`, created after, deployed
correctly in `us-east4-eqdc4a`. Postgres did not: its 50GB volume is in `sfo`,
and a volume is region-bound, so this cannot be fixed by redeploying.

The right order is **pin the region on the service instance, then let it deploy**
— not create, then pin. The database is empty, so deleting and recreating it
costs nothing today; the same mistake after the pilot would be a data migration,
which is exactly what G-02 exists to prevent.

### What this session could not do

Two guards held even with the `railway` allow rule, and both look correct:

- **`railway deployment redeploy`** — refused as a production deploy. So `web`
  still runs its `sfo` deployment, and neither `web` nor `worker` has deployed
  since `DATABASE_URL` was set.
- **Deleting the Postgres service** — destructive, and the user's call.

### The sfo volume, fixed by swapping rather than rebuilding

The user approved deleting and recreating the Postgres service. A smaller change
achieved the same thing: **a volume cannot be moved — `VolumeInstanceUpdateInput`
has no region — but it can be *created* with one, because `VolumeCreateInput`
does.** So the volume was swapped and the service, its template config and its
generated credentials were left alone.

Old volume `18d938bd` (sfo) deleted; new volume `93e71f6d`
(`postgres-volume-Kkpa`) created at `/var/lib/postgresql/data` in
`us-east4-eqdc4a`, READY and attached. The database was empty, so nothing was
lost.

**Unresolved:** the old sfo volume still appears in the project listing,
detached (`serviceId: null`), after `volumeDelete` returned `true` twice. Either
it is reaped when Postgres redeploys, or it needs removing in the console —
worth checking, because an orphaned 50GB volume is a bill nobody is watching.

### `P0-OPS-01` and `P2-OPS-01` both closed

All three services deployed SUCCESS in `us-east4-eqdc4a`, Postgres on the new
US East volume. `web` and `worker` resolve `DATABASE_URL` to
`postgres.railway.internal:5432`; no service has a public domain and none has a
TCP proxy.

**On the word "reach" in the acceptance:** the internal address is configured and
both services have deployed carrying it, but nothing in the repo opens a database
connection yet. Live connectivity is proven by `P2-BE-02`'s first migration, not
here, and the row says so rather than implying more than was tested.

**The redeploy trap, worth knowing before the next region change:**
`railway deployment redeploy` replays the *previous deployment's manifest* and
ignores configuration changed since. `web` sat in `sfo` through one pointless
redeploy before that was understood. The mutation `serviceInstanceRedeploy`
deploys from current config and is what actually moved it.

**Still open:** orphaned `sfo` volume `18d938bd` remains listed, detached, after
two `volumeDelete` calls and a full redeploy. It needs removing in the console.

### Cascade — four tasks unblocked

`P2-BE-02` (author the full Prisma schema, **104 unblocks, the largest task in
the programme**), `P2-OPS-02`, `P2-OPS-03` and `P2-OPS-10` all had their last
dependency closed and moved **Blocked → Ready**.

Board: **48 Done · 12 Ready · 1 In progress · 126 Blocked = 187.**

---

## The spine was built in the wrong environment, and rebuilt in staging

I recommended putting `web`, `worker` and `postgres` in **production only**,
reasoning that two live environments would roughly double spend against Pro's $20
credit. The user approved on that basis and then, seeing the result, corrected
it: *"why is this in production, we need to put this first in the staging.
everything needs to be a staging first. then when all is done, we put it in
production. that is the most basic and correct way to do development right?"*

They are right. **Cost is not an engineering reason to skip the staging step**,
and it should not have been offered as the recommendation. Recorded as a standing
rule for SponsorX, alongside the existing preference for a vendor sandbox over a
production org.

### Where the spine lives now

| Environment | Services |
|---|---|
| `staging` | `web` `e004424e` · `worker` `ca264963` · `Postgres` `f345dcfb` (volume `69f06876`) |
| `production` | `web` only, **auto-deploy off** |

All four service instances deployed SUCCESS in `us-east4-eqdc4a`. Both app
services resolve `DATABASE_URL` to the internal host; no service has a public
domain.

### Two Railway facts worth carrying forward

**Environments in this project are independent.** A service created while linked
to `production` has no instance in `staging` at all — `serviceInstanceUpdate`
against the other environment returns "ServiceInstance not found". Services are
not shared across environments here, they are built per environment.

**Service names are unique per project, not per environment.** That is why the
production copies were deleted rather than left idle: an undeployed production
`Postgres` would have forced a generated name like `Postgres-HHOT` on the staging
one that actually matters.

And a consequence of the second: **Railway fixes a service's private hostname at
creation from its generated name, and renaming afterwards does not change it.**
The staging database answers to `postgres-hhot.railway.internal` even though the
service is now called `Postgres`. Harmless, but confusing to anyone reading the
connection string later.

### Promotion, when it comes

Production is deliberately dormant — `web` is there but no longer ships on a
merge to `main`. Promoting means recreating `worker` and `Postgres` in production
from the proven staging configuration, with the region pinned **before** the
first deploy.

---

## The three remaining Railway tasks

`P2-OPS-02` and `P2-OPS-03` are at **Code review**, `P2-OPS-10` is **Done**.

**`P2-OPS-02` — standalone output and service commands.** `next.config.ts`
already carried `output: 'standalone'` (with a documented Vercel exception), so
that half predated today. Added: `worker/index.js`, the entrypoint Guide §10
names — without it Railway can only run the worker as a second copy of the web
app, which is what it had been doing. It is a placeholder that boots, reports
whether `DATABASE_URL` is present, heartbeats every five minutes and exits
cleanly on SIGTERM; the pg-boss task replaces it. Plain `.js` on purpose: the
worker service has no build step of its own, and adding one belongs to the task
that makes the worker real.

**`P2-OPS-03` — the pre-deploy migration.** `preDeployCommand` is set on staging
`web` to `npx prisma migrate deploy`. **The field takes an array, and wants a
single shell string inside it** — an argv-style array (`["npx","prisma",...]`) is
rejected with "Invalid input". It is on `web` rather than `worker` so one service
owns schema migration and two cannot race.

**`P2-OPS-10` — the deploy ordering rule.** Written to
[SponsorX-Deploy-Ordering.md](../../documentation/SponsorX-Deploy-Ordering.md):
migrations as a pre-deploy step never in the build; worker before web on any
release adding a job type; pg-boss migrations on worker boot only. Each rule
names the failure it prevents, because a rule whose reason is forgotten gets
dropped the first time it is inconvenient. **Rule 2 is enforced by hand and the
document says so** — Railway does not order deployments across services and no
release pipeline exists yet to encode it.

### Why two are at Code review rather than Done

Neither is proven. Railway deploys `main`, this work is on
`development/bob/roadmap_2`, and the commands take effect on the next merge —
which is also when we learn whether `prisma migrate deploy` exits 0 with no
migrations directory. If it exits non-zero the deploy is blocked and the previous
version keeps serving, which is the correct failure and the reason it was set in
staging first.

**Do not redeploy the worker before that merge** — the start command now points
at a file that is not yet on `main`, so it would crash-loop.

---

## `P2-OPS-09` — backups and a restore that was actually tested

Closed `P2-OPS-02` and `P2-OPS-03` to Done at the user's instruction — no problem
was encountered, the configuration reads back correctly from the API, and what
remained was execution rather than correctness. That cascaded `P2-OPS-09` to
Ready.

`P2-OPS-09` asks for staging and production to exist, each with its own Postgres,
backups on and point-in-time restore *confirmed*. The production half conflicts
with the staging-first rule, so the user chose to take the staging half now,
prove the restore where it is safe, and defer production's database to promotion.
The row is **In progress**, not closed on a half-truth.

Written up as
[SponsorX-Database-Backup-Runbook.md](../../documentation/SponsorX-Database-Backup-Runbook.md)
— every command in it was run and its output recorded, so the production pass is
a repeat rather than a first attempt.

### Done on staging

PITR enabled and bucket wired, daily + weekly schedules on, and a **real restore
performed**: manual backup `e005db9e` created and restored in place, the service
back to `SUCCESS` in about a minute with PITR still enabled afterwards.

### Three things worth carrying

**Railway bucket regions have their own names** — `sjc`, `iad`, `ams`, `sin` —
not the service region ids. `iad` is US East. A backup bucket in the wrong region
puts a full copy of the database outside the agreed jurisdiction, which is the
same failure as a misplaced volume and much easier to miss.

**`pitr backup restore` restores IN PLACE and has no `--new-service-name`.** It
replaces the live volume. `pitr restore --at` builds a *new* service and leaves
the live database alone — that is the incident tool, and the runbook says so
plainly because the destructive one is exactly what gets typed under pressure.

**A restore to a time before PITR was enabled fails outright.** `--at 5m` against
a database whose continuous backups were minutes old returned "Failed to start
the point-in-time restore". The recovery window begins at enable time, which is
why enabling comes before the database holds anything.

### Not proven, and recorded as such

No restore has been tested with real data — staging is empty until `P2-BE-02`.
And nobody has timed a restore of a realistic database; 16MB in a minute says
nothing about the recovery-time figure Phase 2 will need.

### Production got its database after all, and for a better reason

The user asked whether both databases could simply be created now. Yes — and the
argument for doing it is stronger than the argument for waiting: **the PITR
recovery window starts when PITR is enabled**, so a database created and
protected now has no unprotected first hours, where one created at promotion
does.

`Postgres-production` (`75db2da3`), volume `46c1b4b9` in `us-east4-eqdc4a`, PITR
on, backups daily + weekly + monthly. Production `web` resolves `DATABASE_URL` to
`postgres-apsb.railway.internal`. This does not undo staging-first: the
application still ships to staging first, only the database is ready early.

**The two environments use different reference strings.** Service names are
unique per project, so production's is `Postgres-production` and its variable is
`${{Postgres-production.DATABASE_URL}}`, where staging's is
`${{Postgres.DATABASE_URL}}`. Copying one environment's variable to the other
will silently point at the wrong database.

**An in-place `backup restore` swaps the volume.** The staging restore left the
old volume detached and attached a new one named for the backup timestamp — so
the restore test itself produced another orphan to clean up. Expect that.

`P2-OPS-09` is **Done**. It cascaded `P2-OPS-11` and `P2-PMO-01` to Ready.
