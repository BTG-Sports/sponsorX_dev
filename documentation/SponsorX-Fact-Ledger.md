# SponsorX Fact Ledger

**Tasks `3S1-BE-01`, `3S1-BE-02`, `3S1-QA-02`, `3S1-QA-03`, `3S1-DATA-05/06/07`, `3S1-OPS-04`, `3S1-QA-01`, `3S1-OPS-03`, `3S1-DATA-03`, `3S2-BE-01` · Version 1.10 · 2026-10-14 · Phase 3, Sprint 1**

Phase 3's figures (reports, benchmarks, price suggestions, forecasts) come
from **facts the app records at the moment each thing happens**, not from a
separate warehouse that works the meaning out again later. This replaces the
warehouse design (`SponsorX-Warehouse-Schema.md`, superseded) and is decided in
`.claude/stack-decision.md` Addendum D.

## 1 · The idea, in one paragraph

When the app books an order, pays an earning, sends an invoice or verifies a
deliverable, the **same database step** also writes one row to the **fact
ledger** (what happened, to which campaign, athlete, job, channel and market,
how much, and on which day) and adds it to that day's **summary** row. Both are
saved or neither is. The amounts come from the same code that performs the
action, so the meaning is defined once. Facts are never edited: a correction is
a new fact that cancels the old one. The summaries are therefore always exactly
the sum of the facts, figures are up to date the moment something happens, and
nothing needs copying.

## 2 · The parts

| Part | Where | What it is |
|---|---|---|
| `Fact` | app database | One row per business event. Never edited or deleted: a database trigger refuses it. |
| `CampaignDaySummary` | app database | One row per tenant × campaign × athlete × channel × job × market × day; each measure is the running sum of its facts. |
| `recordFact(tx, …)` | `backend/src/domain/facts.ts` | **The only way to write a fact.** It takes the caller's transaction, writes the fact and moves its summary in that transaction. |
| `reverseFact(tx, …)` | same file | A correction: a new fact with the measures negated, on the day of the correction. At most once per fact. |
| `checkFactSummaries(db)` | same file | Proves the summaries equal the sum of the facts, measure by measure. Used by tests, and nightly by `3S1-QA-01`. |
| Vocabulary | `backend/src/domain/fact-rules.ts` | Closed lists of kinds, channels and measures, and the market rule. Anything not listed is refused. |

## 3 · The rules

1. **Same transaction.** A fact is written with `recordFact(tx, …)` inside the transaction that makes the change, the same way `audit()` and `enqueue()` are.
2. **One fact per event.** Every fact has a `key` naming its business event, unique per tenant (e.g. `order.booked:<orderId>`). A retried action finds the key and adds nothing.
3. **Never edited.** A cancellation, refund or corrected view count is a `REVERSAL` of the earlier fact, then (where needed) a new fact. History is never rewritten.
4. **Dated by the event.** `occurredOn` is the UTC day the thing happened (the booking day, the paid day), never the day it was recorded.
5. **Whole numbers only.** Counts and cents.
6. **Fan activity is counted, not copied.** Scans, landings, claims, redemptions, link clicks and edition views are already one row each, written the moment they happen (`RewardEvent`, `LinkEvent`, `EditionEvent`). The reads count those rows. Copying each into the ledger would only add work at busy events.
7. **Market.**
   - A US state (upper-case) and a city (title case; empty for a state-only market).
   - A reward's venue wins over the athlete's registered city and state when the reward has one.
   - No state means no market.
   - Never derived from an IP address.
8. **Only the app writes.** Corrections go through admin actions that record their facts. The database enforces it (§10).

## 4 · Facts by kind

Wired into the actions by `3S1-BE-02`. The writers live in `backend/src/domain/fact-writers.ts`, one per event; each action calls its writer inside its own transaction, right after its own write.

| Kind | Written when | Written by | Measures |
|---|---|---|---|
| `ORDER_BOOKED` | a campaign order is accepted (directly, or by accepting an offer) | `acceptOrder`, `respondToOffer` | `booked_sell_cents`, `booked_compensation_cents` |
| `ORDER_CANCELLED` | an accepted order is cancelled | `transitionOrder` | `cancelled_sell_cents`, `cancelled_compensation_cents` |
| `EARNING_PAID` | an earning is marked paid | `transitionEarning` | `earnings_paid_cents` (gross plus adjustment) |
| `INVOICE_ISSUED` / `INVOICE_PAID` | Zoho reports an invoice issued or paid | `ingestZohoInvoice` | `invoiced_cents` / `invoice_paid_cents` |
| `DELIVERABLE_DUE` | an order is accepted (one per deliverable, on its due date) | with `ORDER_BOOKED` | `deliverables_due` |
| `DELIVERABLE_PUBLISHED` / `DELIVERABLE_VERIFIED` | an athlete publishes; BTG verifies | `markPublished`, `verifyPublished` | `deliverables_published` / `deliverables_verified` |
| `REVISION_REQUESTED` | a reviewer, or the automatic checks, send a draft back | `requestRevision`, `submitDraft` | `revisions_requested` |
| `METRIC_RECORDED` | views and engagements are recorded for a day and source | `recordMetric` | `views_<label>`, `engagements_<label>` (plus `metric_corrections` on a correction) |
| `AD_SLOT_SOLD` | a NEXT ad slot is sold to a campaign | the edition sale | `ad_slot_sold_cents` |
| `MARKETPLACE_LINE_CONTRACTED` | a marketplace order is contracted, per line | `bookOrder` (ledger) | `marketplace_gross_cents`, `marketplace_net_cents` |
| `MARKETPLACE_REFUND` | a marketplace refund is marked sent (by the provider, or by Finance) | the four places in `refunds.ts` that mark one SENT | `marketplace_refunded_cents` |
| `REVERSAL` | any correction (below) | the writer of the event it corrects | the negated measures of the fact it reverses |

**What reverses what.** Each of these is a new `REVERSAL` row, never an edit.

| Event | Reversed | On which day |
|---|---|---|
| A deliverable is published | its "due" fact filed under `UNPUBLISHED`; it is filed again under its platform | its due date |
| An accepted order is cancelled | its deliverables' "due" facts (the app stops counting a cancelled order's deliverables). Anything already published or verified stays. | their due dates |
| A day's views are corrected | the earlier figure for that day and source | the figure's own day |
| Zoho changes an invoice's amount or date, or voids it | the figure that no longer holds. A void keeps nothing. A paid invoice never goes back (the ingest refuses that already). | the figure's own day |
| A NEXT edition is cancelled | each slot's sale, before the slot is cleared | the cancellation day |
| A marketplace order or line is unwound (`reverseOrder`) | that line's contract | the unwinding day |

**Not recorded.** A refund on a cancelled NEXT edition is not marketplace money, so it records no refund fact; the sale's reversal already takes it out. A marketplace refund still waiting on Finance's list is not yet a fact: it becomes one when it is marked sent, on the day Finance gives.

Channels: the social platforms (`SOCIAL_*`), `UNPUBLISHED`, `IN_PERSON`, `EDITION_PRINT`, `EDITION_DIGITAL`, `CAMPAIGN` (money that belongs to an order or campaign, not to one channel), and `MARKETPLACE`.

## 5 · What carries over from the warehouse design

These carry over unchanged from `SponsorX-Warehouse-Schema.md`:
- the list of figures;
- the channel and market rules;
- the metric definitions (verified views, claim rate, margin, effective CPM; §6 there).

The tables that did the copying and re-deriving do not carry over. `3S1-OPS-02` retires them.

## 6 · Nothing slips through

The facts are only as good as their coverage, and a gap raises no error: the figures are just quietly wrong. `3S1-QA-02` makes two kinds of gap fail the build.

1. **A write without its fact.** `tests/fact-coverage.static.test.ts` reads the code and finds every place that writes money or delivery data. That covers:
   - an order's state or price;
   - a deliverable's state, due date or platform;
   - an earning's payment;
   - a metric; an invoice;
   - an ad slot's sale;
   - a marketplace line's financials;
   - a refund being sent;
   - a ledger reversal;
   - any write to the fact tables.

   Each place has a reviewed decision in the test: the fact writers its function calls, and how many times, or "none" and why. The build fails when:
   - a fact call is removed (or only left in a comment);
   - a new write has no decision;
   - a new function calls the deliverable-set creator without recording the due facts;
   - anything but `facts.ts` writes the fact tables;
   - a decision names a write that no longer exists.
2. **A value without a decision.** `backend/src/domain/fact-classification.ts` classifies every value of the money and delivery vocabularies: the facts it leads to, or none and why. The vocabularies are:
   - order, deliverable, earning, edition and marketplace-order states;
   - metric sources; deliverable platforms;
   - payment methods;
   - refund causes, states and methods;
   - payment-dispute states.

   The tables are typed against the app's own lists, so a new value fails the typecheck, and the test fails it again by name. The fact writers read two of the tables directly: where a metric source's figures are filed, and which channel a platform is.

## 7 · Match the app

`checkFactSummaries` proves the summaries equal the facts. `checkFactsAgainstApp` (`backend/src/domain/fact-check.ts`, `3S1-QA-03`) proves the facts agree with the app's own records.

**For every campaign,** each summary total is compared with the same figure worked out from the app's tables:

| Measure | The app's own figure |
|---|---|
| booked (sell, pay) | accepted orders |
| cancelled (sell, pay) | accepted orders now cancelled |
| deliverables due | deliverables of accepted orders that are not cancelled |
| deliverables published | deliverables with a published date |
| deliverables verified | deliverables that are VERIFIED |
| drafts sent back | the audit log's revision entries (reviewer or automatic checks) |
| views / engagements, by label | each day's figure from `MetricDaily` |
| earnings paid | PAID earnings, gross plus adjustment |
| invoiced / invoice paid | Zoho invoices with an issue or paid date, not void |
| ad slots sold | slots currently sold to the campaign |

**For every tenant's marketplace:**

| Measure | The app's own figure |
|---|---|
| gross / net | the financials of lines whose booking is not reversed |
| refunded | marketplace refunds marked SENT |

`metric_corrections` is not compared, because the app keeps the corrected figure, not a count of corrections.

**What a difference means.** Each difference is named by tenant, campaign and measure, with the app's figure and the facts' figure. It means one of three things:
- history not yet filled (expected until `3S1-OPS-04`);
- an action that skipped its writer;
- a record or summary changed outside the app.

The app never deletes these records, so a difference is never "the record was deleted".

**Running it.** `npm run facts:check -w @sponsorx/backend [-- --tenant <id>]` runs both checks in a READ ONLY transaction, so it is safe against production. It exits 1 on any difference. The history fills use it to prove themselves, and the nightly check (`3S1-QA-01`) will run it.

## 8 · Filling the history

Facts start when the ledger goes live. The history fills (`backend/src/domain/fact-history.ts`) record the facts for everything before that. They work from the app's records and its audit log, **through the same writers the live actions call**, so a history fact means exactly what a live one does.

- **Safe to re-run, and safe while live.** Every fact carries the key its live action would have used, so an event already recorded adds nothing, whether by an earlier run or live since the ledger went in. Revisions have no fixed key (each sending-back is its own event), so they are counted instead: the audit log's revisions for a deliverable, less the facts it already has; the oldest missing ones are recorded.
- **One order per transaction.** A long fill never holds a lock for long.
- **Each event is dated by when it happened:**

  | Event | Dated by |
  |---|---|
  | Booked | the acceptance |
  | Published | the published date |
  | Cancelled, verified, sent back | the audit log entry written with the action |

  A record with no audit entry (data seeded straight into the database) falls back to the nearest known date: cancelled to the acceptance, verified to the publication. Each run reports how many records did, so it is never silent.
- **Filed where the live action would file it.** For example, a draft sent back before publication counts as `UNPUBLISHED`.
- **Running it.** `npm run facts:fill -w @sponsorx/backend -- <part> [--tenant <id>]`. Production needs `--confirm-production`, after a clean staging run. Afterwards it runs the "match the app" check (§7) for the measures that part answers for, and exits 1 on any difference.

| Part | Task | Covers |
|---|---|---|
| `orders` | `3S1-DATA-05` | orders booked and cancelled; deliverables due, published and verified; drafts sent back |
| `views` | `3S1-DATA-06` | each day's views and engagements by label, on its own day. Corrections are counted from the audit log (every value entered), less those the facts already count. The live writer cannot count a correction to a figure from before the ledger, because the old figure had no fact, so the fill counts it. |
| `payments` | `3S1-DATA-06` | earnings paid, on the paid day |
| `invoices` | `3S1-DATA-06` | Zoho invoices issued and paid, on their days; a void invoice records nothing |
| `slots` | `3S1-DATA-07` | NEXT ad slots sold now, on the sale day. Each sale a cancelled edition undid is rebuilt from the cancelled-sale record: the sale on its audit-log day (one per campaign and edition, since the per-slot prices were cleared with the slots), reversed on the cancellation day. It is skipped when the sale was recorded live. |
| `marketplace` | `3S1-DATA-07` | each contracted line on the contract day; each line since unwound, reversed on the day its books were (the ledger's REVERSAL journal); each refund sent, on its sent day |

**Proof that history equals live.** Tests take data the real actions produced, erase its facts, fill them again from history, and compare:
- **Marketplace:** the same facts, key for key and day for day.
- **Campaigns** (orders, deliverables, views, payments, invoices): every non-zero daily summary figure is the same.
- **A cancelled edition's slots:** each campaign's figure is the same, day by day.

**Filled on 2026-10-13 (`3S1-OPS-04`).** The ledger went live with the deploy of `f00d36a` at 10:36 UTC.

| Environment | Check before | Fill | Check after | Second run |
|---|---|---|---|---|
| Staging | One gap: 6 marketplace orders. Staging has no campaign orders, payments, views, invoices or sold slots. | 7 facts | both checks pass | added nothing |
| Production | Already matching: no money history before the ledger | 0 facts | both checks pass | added nothing |

## 9 · The nightly check

`backend/src/domain/fact-nightly.ts` (`3S1-QA-01`).

**When it runs.** Every night, the worker runs both checks (§7) across every tenant, read-only. It runs on the first hourly tick at or after **19:00 UTC** (3 am Manila).
- The run is kept as a `FactCheckRun` row, one per UTC day. Its unique `day` means a second worker, or a restart, finds the day already taken.
- A run cut short by a dead worker is taken over after an hour.
- A run that could not run (a database error) is recorded with its error, logged, tried again on the next tick, and never emailed as a mismatch.

**Who is told.** A tenant's active BTG admins get one email when its figures stop matching ("SponsorX report figures don't match the app") and one when they match again.
- The first email says the app's own records are untouched, lists up to 20 differences in plain words, and links to integration health. An example line: "Fall tacos — amount booked (sponsor price): the app says $200.00, the report figures say $0.00".
- The recovery email says since when the figures had not matched.
- Nothing is sent on the nights in between.

**Switched on per environment.** `FACT_CHECK_EMAILS=on` turns the emails on, once that environment's history is filled. The check runs and is recorded either way.

**On the admin screen.** `GET /operations/integration-health` carries a `facts` section for the caller's tenant only:
- when the check last ran;
- whether the figures match;
- since when they have not;
- the differences, in words;
- whether emails are on;
- the last error.

Drawing it on the integrations screen is `3S1-FE-01`.

**When an admin is emailed,** the developers run `npm run facts:check` for the full list. A gap in history is fixed by `facts:fill`. An action that skipped its writer is a bug, and `3S1-QA-02`'s coverage test should have caught it.

## 10 · Only the app writes

**`3S1-OPS-03`.** The facts are only as good as the rule that nothing changes
the app's records behind its back. The database enforces it with two logins:

- **`sponsorx_app`** is the app's. It owns the database and every table, so
  the app reads and writes, and its deploy step applies new tables. It is no
  superuser.
- **`sponsorx_readonly`** is developers'. Only members of the Railway project (the developers) can reach it. It reads every table, including ones
  added later, and Postgres refuses it any write, even with read-only
  switched off.

A wrong figure is corrected through the admin action that owns it, which
records its fact. Railway's master login is break-glass only.

- **Code:** `backend/src/db/logins.ts`, `npm run db:logins` (applies and
  checks) and `npm run db:read` (developers' queries).
- **Proof:** `backend/tests/db-logins.test.ts`, on a database built by every
  migration plus pg-boss' schema, as staging and production were. The app's
  login still deploys and runs the job queue; developers' login is refused every
  write.
- **Steps per environment:** Deployment Runbook §6.

## 11 · Benchmarks

**`3S1-DATA-03`.** The benchmarks answer "what do sponsors usually pay?" for a
sport, a market, a format and an audience. The answer is in **cents per 1,000
verified views** (effective CPM), because SponsorX sells fixed-price jobs and a
price alone says nothing about whether it was cheap or dear.

**One figure per order.** An order is one campaign, athlete and NIL job, and
the ledger files its money and its views under those keys. From the daily
summaries:

> effective CPM = (booked sell − cancelled sell) × 1,000 ÷ (API-verified + manually verified views)

- **Left out:**
  - orders with nothing left to pay for (cancelled in full);
  - orders with no verified views yet;
  - orders booked more than **12 months** before the refresh.
- **Views that don't count:** self-reported, estimated and attributed views.

**Per segment.** For each segment, the low (p25), middle (median) and high (p75)
across its orders, and how many orders that is (`sampleSize`). The segments are:

| Dimension | Segment |
|---|---|
| `ALL` | every order |
| `SPORT` | the athlete's sport |
| `MARKET` | the US state the booking was filed under |
| `FORMAT` | the NIL job (e.g. `SX-04`) |
| `AUDIENCE` | the athlete's tier |

Sport and tier are taken as they are now. An athlete with no state or no tier
appears under `ALL` and the other dimensions, but not under those two.

**Small samples stay visibly small.** Below **10 orders** (`BENCHMARK_MIN_SAMPLE`;
user, 2026-10-14), a figure is still shown but carries `smallSample: true`. One
odd deal can swing a figure from a few orders, and nobody should price from it as
though it were settled.

**Per tenant, never across tenants.** Each operator's benchmarks come from its
own orders only.

**When it refreshes.** Every night, right after the fact check (§9), the worker
rebuilds each tenant's benchmarks in one transaction. A tenant whose check failed
**keeps yesterday's figures**, so a benchmark is never built from figures known to
be wrong. `npm run benchmarks:refresh -- [--tenant <id>]` does the same by hand
and prints the figures.

- **Code:** `backend/src/domain/benchmarks.ts` (`refreshBenchmarks`,
  `listBenchmarks`), `Benchmark` (migration `20261014090000_benchmark`).
- **Proof:** `backend/tests/benchmarks.test.ts` uses orders and views written
  through the ledger, with every figure worked out by hand. It covers cancelled
  and unverified orders, the 12-month window, two tenants, a refresh replacing
  the figures, and a failed check keeping yesterday's.
- **Readers:** the model screen (`3S8-FE-02`, `GET /intelligence/models`) and
  the CPM engine (`3S2-BE-02`), when their routes are built. Until then,
  `listBenchmarks` is the read.

## 12 · Feature snapshots

**`3S2-BE-01`.** The pricing engine (`3S2-BE-02`) suggests a price per athlete.
To make that suggestion, and to explain it later ("why $300 for Sam in
March?"), it reads a **snapshot** of everything known about the athlete that
day. There is one snapshot per bookable athlete (`ACTIVE` or `FEATURED`) per UTC
day. It is written once and never changed, so it still says what was known
then.

| Input | What | From |
|---|---|---|
| `audience` | Each platform's followers and average views, with their label (§22); totals; whether any is verified | `AthleteSocial` |
| `engagement` | Verified engagements ÷ verified views | Summaries, last 90 days |
| `delivery` | Deliverables due, published, verified and sent back. Of those due by today, how many were published on or before their due day. Orders cancelled. | Summaries; due and published facts per deliverable (a due fact since reversed doesn't count) |
| `demand` | Orders booked for the athlete, and their net value. Orders booked for athletes of the same sport and state. | Summaries, last 90 days |
| `seasonality` | Bookings for the sport in this calendar month last year ÷ the average month of the last 365 days. Null, with the reason, until there is a year of bookings for the sport. | Summaries |
| `geography` | State and city; orders booked in that state | Athlete; summaries, last 90 days |
| `scarcity` | Bookable athletes with the same sport, state and tier | Athletes |
| `benchmarks` | The segment's price ranges (all orders, the sport, the state, the tier) as of that night | §11 |

"Recent" means **90 days** (`FEATURE_WINDOW_DAYS`; user, 2026-10-14): one
season. A figure that can't be known yet is `null` with the reason, never a
guess. Each snapshot carries `features-v1`; a new shape is a new version,
never an edit of old snapshots.

**When it is taken.** Every night, after the benchmarks (§11), the worker takes
the day's snapshots. A tenant whose fact check failed takes none that day, and a
lookup for that day returns the day before. `npm run features:snapshot --
[--tenant <id>]` does the same by hand; a snapshot already taken that day stands.

**Retrieval.** `getFeatureSnapshot(tenant, athlete, date)` returns that day's
snapshot, or the latest before it. `listFeatureSnapshots` returns a range.

- **Code:** `backend/src/domain/feature-snapshots.ts`, `FeatureSnapshot`
  (migration `20261014120000_feature_snapshot`).
- **Proof:** `backend/tests/feature-snapshots.test.ts` writes orders,
  deliverables and views through the ledger, and works out every value by
  hand. It also covers a re-run the same day, retrieval by date, two tenants,
  and a failed check taking none.
- **Caveats:**
  - Until real campaigns run, snapshots mostly hold self-reported audience figures.
  - Storage grows by one row per bookable athlete per day, roughly 0.5–1 GB a year per 1,000 athletes. Thinning old snapshots can wait.

