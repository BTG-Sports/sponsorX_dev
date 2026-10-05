# SponsorX Phase 2 — the financial ledger (2S0-PMO-02)

| | |
|---|---|
| **Task** | `2S0-PMO-02` · Design the financial ledger model |
| **Date** | 2026-09-28 · rcfworks |
| **Status** | **Signed off by the programme owner, 2026-09-28.** This is the approved design, and it is built (`2S5-BE-01`, `2S4-BE-04`, `2S5-BE-02`, `2S5-SEC-01`, `2S7-DATA-01`). **Every rate below is still a placeholder.** Rates are data (commission rules), not design, so BTG sets the real ones in `/admin/commission` (`2S5-FE-01`) without a deploy. |
| **Acceptance** | Ledger design reviewed and signed off. The sequential rule order is documented, and a worked example reconciles to the cent. |

## 1 · The one rule

**Order revenue becomes ledger entries at contract time. Nothing is ever
recalculated at payout time.**

When BTG approves a marketplace order, or policy approves it
(`2S4-BE-05`), each line's full breakdown is computed once. It is frozen onto
the line as a financial snapshot (`2S4-BE-04`) and posted to the ledger
(`2S5-BE-02`). From then on:

- Rate changes, rule edits and new versions affect only orders contracted
  after them.
- A payout (`2S5-BE-04/05`) draws on entries that already exist. It never
  asks the rules again.

## 2 · The sequential order

For each order line, in whole cents:

| Step | Amount | How it is computed |
|---|---|---|
| 1 | **Gross** | quantity × unit price |
| 2 | **Discounts** | none in Phase 2 yet (the rule kind is reserved), so **Net sale** = gross − discounts |
| 3 | **Platform fee** | net × `PLATFORM_FEE` rate, plus its fixed amount |
| 4 | **Management fee** | net × `MANAGEMENT_FEE` rate |
| 5 | **Processing** | the order's processing (order total × `PROCESSING` rate, plus its fixed amount *once per order*), allocated to lines in proportion to net. The last line takes the remainder. |
| 6 | **Property share** | net − platform − management − processing. Refused if below zero. |
| 7 | **Referral** | property share × `REFERRAL` rate |
| 8 | **Reserve** | property share × `RESERVE` rate, held until the order closes |
| 9 | **Available** | property share − referral − reserve |

- **A roster athlete's item** splits *available* and *reserve* between the
  team and the athlete. The team's cut is the athlete's `teamShareBps`
  (`2S2-BE-04`), or the `TEAM_SHARE` rule when that is not set. The athlete
  takes the remainder.
- **Rounding.** Every percentage rounds half up to the cent, and is taken on
  the amount its step names. Steps 6, 9 and the athlete's cut are
  remainders, so the parts of a line **always sum exactly to its net sale**.
  No cent is created or lost.
- **Buyer fees.** The order's buyer fee (`MARKETPLACE_BUYER_FEE_BPS`, 0 by
  default) is platform revenue, posted on its own line of the journal.

## 3 · Which rule applies

Each fee is a **commission rule** (`2S5-BE-01`). A rule has:

- a kind: `PLATFORM_FEE`, `MANAGEMENT_FEE`, `PROCESSING`, `REFERRAL`,
  `RESERVE` or `TEAM_SHARE`;
- a rate in basis points, and a fixed amount in cents;
- a scope: `GLOBAL`, a property kind, one property, or one sponsor;
- an explicit **priority**;
- an effective window.

For each kind, the rule that applies is **the matching rule with the highest
priority** among those in effect at contract time. A tie goes to the latest
version. No matching rule means the kind contributes 0.

**Rules are versioned, never rewritten.** Editing a rule writes a new version
and closes the old one's window, and Postgres refuses any other change to a
rule row. So an edit cannot reach back into an order already contracted, or
into a payout drawn from one.

## 4 · The ledger

Double-entry. Each posting is a **journal** whose debits equal its credits.
Each entry records its account, its party, a debit **or** a credit (never
both, never zero), its type and its status.

| Account | Party | What it is |
|---|---|---|
| `SPONSOR_RECEIVABLE` | the sponsor | what the sponsor owes for the order |
| `PLATFORM_REVENUE` | BTG | platform fee, and any buyer fee |
| `MANAGEMENT_REVENUE` | BTG | management fee |
| `PROCESSING_PAYABLE` | the payment processor | processing, trued up when the provider settles (`2S5`) |
| `REFERRAL_PAYABLE` | the referrer | referral fee |
| `RESERVE_HELD` | property / athlete | the reserve, until release |
| `PROPERTY_PAYABLE` | the property | what BTG owes the property |
| `ATHLETE_PAYABLE` | the athlete | a roster athlete's cut |

| Journal | When | Entries |
|---|---|---|
| `BOOKING` | the order is contracted | Dr `SPONSOR_RECEIVABLE` net. Cr each party's share by the table above. |
| `RESERVE_RELEASE` | the order is `CLOSED` | Dr `RESERVE_HELD`, Cr `PROPERTY_PAYABLE` / `ATHLETE_PAYABLE` |
| `REVERSAL` | a contracted order is `CANCELLED` or `REFUNDED` — or its payment is disputed and the dispute `LOST` (2S5-BE-03) | the mirror of every entry the order posted (for a line refunded, or a dispute lost on part of the order, that line's entries only) |
| `PAYOUT` | a payout is paid (`2S5-BE-05`) | Dr `PROPERTY_PAYABLE` / `ATHLETE_PAYABLE`, Cr the processor's settlement account |

- **Entries are never updated or deleted.** A correction is a new journal.
- **Status** moves forward only: `PENDING` → `AVAILABLE` → `PAID`.
- **The books are the operator's.** Entries live in BTG's tenant. Each entry
  also names the party's tenant, so a property reads only its own entries.

**The property dashboard reconciles exactly.**

- *Booked revenue* is the property's credits from bookings.
- *Reversed* is the debits from reversals.
- *Paid earnings* is the debits from payouts.
- *Ledger balance* is credits − debits.
- *Pending earnings* is available + reserved.
- These must hold to the cent: **booked − reversed − paid = ledger balance =
  pending**.

## 5 · Worked example (SIMULATED rates)

The placeholder rates are:

- platform fee 15% (1500 bps)
- management fee 5% (500 bps)
- processing 2.9% (290 bps) + 30¢ per order
- referral 2% (200 bps)
- reserve 10% (1000 bps)
- Riley's team share 20% (2000 bps)

One order with three lines, total **$2,799.97**:

- *Courtside banner* ×1 at $1,200.00, the team's own item.
- *Riley's clinic* ×2 at $500.00, a roster athlete's item.
- *Scoreboard shout-out* ×3 at $199.99, the team's own item.

Processing for the order is round(279,997 × 2.9%) + 30 = 8,120 + 30 = **8,150¢**.
It is allocated by net: 3,493 / 2,911 and 1,746 (the remainder).

| ¢ | Banner | Clinic | Shout-out |
|---|---:|---:|---:|
| Net sale | 120,000 | 100,000 | 59,997 |
| Platform fee 15% | 18,000 | 15,000 | 9,000 |
| Management fee 5% | 6,000 | 5,000 | 3,000 |
| Processing (allocated) | 3,493 | 2,911 | 1,746 |
| **Property share** | **92,507** | **77,089** | **46,251** |
| Referral 2% | 1,850 | 1,542 | 925 |
| Reserve 10% | 9,251 | 7,709 | 4,625 |
| **Available** | **81,406** | **67,838** | **40,701** |
| — team (20% of available) | | 13,568 | |
| — athlete (remainder) | | 54,270 | |
| — team reserve (20%) | | 1,542 | |
| — athlete reserve (remainder) | | 6,167 | |
| **Check:** fees + processing + referral + reserve + available | 120,000 ✓ | 100,000 ✓ | 59,997 ✓ |

- **The booking journal** is Dr `SPONSOR_RECEIVABLE` 279,997, with credits
  totalling 279,997.
- **Before the order closes, the team's dashboard shows:**
  - booked 81,406 + 9,251 + 13,568 + 1,542 + 40,701 + 4,625 = **151,093¢**
  - ledger balance 151,093¢, which is pending 151,093¢: available 135,675
    plus reserved 15,418
  - paid 0
- **When the order closes**, the release moves 15,418¢ of the team's reserve
  into its available balance. Booked and the balance are unchanged.

The implementation's test, `tests/phase2-ledger.test.ts`, posts this exact
order and asserts every figure in the table.

## 5a · Refunds and disputes, as built (2S5-BE-03, 2026-10-05)

- **A refund reverses; it never edits.** However it starts — a cancellation,
  a problem, BTG, or the provider refunding the whole payment itself (the
  order is then refunded in SponsorX automatically when every check passes) —
  the order (or the line) posts its `REVERSAL` and the money owed back is a
  `RefundDue`. A refund the provider already made is written `SENT` with the
  provider's reference, so it is never sent twice.
- **A dispute freezes; only a lost one reverses.** While a dispute is open
  nothing of the order's money moves: no payout covering it is approved or
  sent, none of it can be requested, the order can't be refunded. Won, it
  unfreezes and nothing is posted. Lost, the order (or the lines BTG names)
  posts its `REVERSAL` exactly as a refund would — but no `RefundDue`: the
  bank already returned the money. A lost order can never be refunded again.
- **Money already paid out is owed back, not hidden.** `reverseOrder` leaves
  `PAYOUT` entries alone, so after a reversal a payee's payable on that order
  is negative by what was paid out. That is the payee's `owedBackCents`
  (GET /payouts/me), and a lost dispute records the total on itself. Payouts
  not yet handed to the provider are sent back instead, so nothing more is
  paid out of money that went back to the sponsor.
- **The books still reconcile:** booked − reversed − paid = ledger balance =
  pending, with pending negative by what is owed back.
- **Not yet:** the provider's dispute fee, and its fee on a refund — trued up
  with processing when the real provider is connected (2S5-INT-01).

## 6 · Not in this design (named)

- **Payments and payouts.** These are the payment provider's cycle
  (`2S0-PMO-03`, then `2S5-INT-*`, `2S5-BE-03/04/05`). The `PAYOUT` journal
  above is where they will post. Processing is trued up against the
  provider's actual fee when they arrive.
- **Tax.** No tax ids are held, and no tax is computed (§26, Addendum A6).
