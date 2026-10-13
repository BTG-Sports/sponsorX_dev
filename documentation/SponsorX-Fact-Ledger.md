# SponsorX Fact Ledger

**Tasks `3S1-BE-01`, `3S1-BE-02` · Version 1.1 · 2026-10-13 · Phase 3, Sprint 1**

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
8. **Only the app writes.** Corrections go through admin actions that record their facts (`3S1-OPS-03` closes the database to other writers).

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
