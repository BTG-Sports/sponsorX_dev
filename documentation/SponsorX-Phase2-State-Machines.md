# SponsorX Phase 2 — the state machines (2S0-PMO-01)

| | |
|---|---|
| **Task** | `2S0-PMO-01` · Define the marketplace state machines |
| **Date** | 2026-09-28 · rcfworks |
| **Status** | **SIMULATED — for BTG to confirm.** Drafted so Phase 2 building can start (`2S1-BE-01`, `2S1-BE-03`). Onboarding is implemented exactly as written below. The other six are the working design for the tasks that build them, and each is fixed in code only when its task lands. |
| **Acceptance** | All Phase 2 state machines diagrammed and agreed, with the illegal transitions named explicitly |

Each machine lists its **legal moves**. Any move not listed is refused, and the
**illegal moves** that matter most are named. The last section covers how the
machines depend on each other.

## 1 · Property onboarding (`2S1-BE-01`, `2S1-BE-03`)

```
DRAFT ──submit──▶ PENDING_REVIEW ──approve──▶ APPROVED ◀──reinstate── SUSPENDED
  ▲                   │  │                        │                       ▲
  └──(edit)           │  └──reject──▶ REJECTED    └────────suspend────────┘
                      └──request changes──▶ CHANGES_REQUESTED ──resubmit──▶ PENDING_REVIEW
```

| From | Legal moves | Who |
|---|---|---|
| `DRAFT` | → `PENDING_REVIEW` (submit, only when every required field for the organisation type and state is present) | the applicant |
| `CHANGES_REQUESTED` | → `PENDING_REVIEW` (resubmit) | the applicant |
| `PENDING_REVIEW` | → `APPROVED` (automatically when every check passes — `2S1-BE-06` — or by BTG), → `CHANGES_REQUESTED` (with a note), → `REJECTED` (with a note) | the system, or BTG |
| `APPROVED` | → `SUSPENDED` (with a note); → `REJECTED` (Reject after approval, with a reason that is emailed — `2S1-BE-06`) | BTG |
| `SUSPENDED` | → `APPROVED` (reinstate) | BTG |
| `REJECTED` | → `APPROVED` (reinstate) **only** for an organisation that was approved before (it has a Property); an application rejected at review is terminal: a new application starts over | BTG |

**Illegal, named:**
- `DRAFT → APPROVED`: nothing is approved before it is submitted and checked.
- Editing the answers in `PENDING_REVIEW`: the checks (and BTG) must see a
  fixed application. The applicant may still upload the documents it is
  missing and confirm its email (`2S1-BE-06`) — each re-runs the checks.
- `REJECTED → anything` for an application rejected at review: reapplying
  keeps the refusal in the record (and its name is released for others).
- `APPROVED → DRAFT`: an approved organisation is suspended or rejected, never un-submitted.
- `SUSPENDED → REJECTED`: suspension is a pause; reinstate first, then
  reject, so the reason is stated against an organisation that was live.

**Approval grants listing access.** Suspension withdraws it, and reinstatement
restores it. **Reject after approval** (`2S1-BE-06`) switches off the
organisation's logins and listing access, ends its listings (published,
paused and draft ones are archived; one waiting for BTG goes back to draft)
and holds its payouts; **Reinstate** turns the logins and listing access back
on and releases the payouts (ended listings are listed again by the
organisation). Every decision, and every automatic approval, is audited.

## 2 · Listing (`2S3-BE-01`)

`DRAFT → PUBLISHED ⇄ PAUSED → ARCHIVED` when the checks pass on submit, and
`DRAFT → PENDING_APPROVAL → PUBLISHED` when the listing is held for BTG.
`PENDING_APPROVAL → DRAFT` when changes are requested (or the seller edits it),
`PENDING_APPROVAL → ARCHIVED` when BTG rejects it.

**Automatic publishing (2S3-BE-06, 2026-10-02).** On submit, every check BTG's
approval used to run, runs first; a failure is refused outright, as before. A
listing that passes goes straight to `PUBLISHED`, the first one included, and is
marked `publishedAutomatically`. It goes to `PENDING_APPROVAL` instead, with
its reasons, only when flagged:
- restricted words in its title or description;
- a seller BTG should look at: an organisation flagged for a missing document,
  payouts held, an athlete in the coming-of-age pause, or a minor whose
  guardian isn't verified.

Resuming a paused listing takes the same path. A listing BTG paused or ended,
with a reason emailed to the seller, goes back live only when BTG puts it back:
the seller's own resume returns it to BTG.

**Illegal, named:**
- Any listing for a property that isn't `APPROVED`.
- `DRAFT → PUBLISHED` without the checks; the only road is submit.
- `ARCHIVED → anything`.
- Editing price or inventory while `PUBLISHED`. Pause it first, so an open
  cart never changes under a buyer.

## 3 · Reservation (`2S4-BE-02`)

`HELD → CONVERTED | EXPIRED | RELEASED`. A hold lasts 15 minutes.

**Illegal, named:**
- Two `HELD` reservations on the same exclusive inventory.
- `EXPIRED → CONVERTED`: an expired hold can't be paid for.
- Any move out of `CONVERTED`.

## 4 · Order (`2S4-BE-03`, `2S4-BE-05`)

`PENDING_SELLER → PENDING_APPROVAL → APPROVED → AWAITING_PAYMENT → PAID → IN_DELIVERY → FULFILLED → CLOSED`,
with the first two steps only when needed (2S4-BE-09, 2026-10-02).
`CANCELLED` is reachable before `PAID`. `REFUNDED` is reachable from `PAID` or `IN_DELIVERY`.

**Who decides, automatically:**
- `PENDING_SELLER`: a listing that asks for approval is decided by its seller within 48 hours. If the seller doesn't answer, the order is declined (`SELLER_NO_ANSWER`). One seller declining cancels the order.
- `PENDING_APPROVAL`: only an order above the sponsor's spending limit waits for BTG. The limit starts at $5,000 and rises to twice the sponsor's largest completed order, up to $25,000. A refund, or a problem upheld or refunded, stops it rising.
- Otherwise the order is `APPROVED` and moves to `AWAITING_PAYMENT` at once.
- `AWAITING_PAYMENT → PAID`:
  - a card payment, through the provider;
  - a Zoho Books invoice for the order marked paid in full;
  - BTG admin or Finance by hand, with a method and reference.

  All three go through one path.
- `AWAITING_PAYMENT → CANCELLED (UNPAID)`: the sponsor is reminded at 1 and 2 days, and the order is cancelled at 3 days, never while a card payment is in progress.

**Delivery problems** (2S4-BE-11) don't change the order's state; they live on the line. The seller answers within 72 hours and the sponsor within 72 hours. BTG decides only an escalated problem. A manual `FULFILLED` is refused while any line is unsettled.

**Cancelling a paid line** (2S4-BE-12, 2026-10-02) also lives on the line, and only a line still `IN_DELIVERY` (paid, not marked delivered, nothing open on it):
- the **sponsor** cancels for free until the start of the line's first date (UTC) less 3 days — the line goes `IN_DELIVERY → REFUNDED` at once;
- after that, until the first date starts, the sponsor **asks the seller**: a `CANCELLATION` issue, `SELLER_TO_ANSWER` until the first date's start (the earlier of 72 hours or then). `ACCEPT` → `SETTLED`, the line `REFUNDED`. `DECLINE` (a reason) → `ESCALATED` (`SELLER_DECLINED_CANCELLATION`); no answer → `ESCALATED` (`SELLER_DIDNT_ANSWER_CANCELLATION`, the sweep). BTG decides: `REFUND` (`RESOLVED`/`REFUNDED`, the line `REFUNDED`) or `KEEP` (`RESOLVED`/`KEPT`, the line stays `IN_DELIVERY`). While it is open the line can't be marked delivered and the overdue steps wait;
- on or after the first date the sponsor can't cancel — it is Report a problem once delivered;
- the **seller** cancels a line it can't deliver any time while it is `IN_DELIVERY`, an overdue hand-over closing with it (`CLOSED`/`SELLER_CANCELLED`). Two seller cancellations in 90 days and its new listings are held for BTG.

A cancelled line is refunded through the line refund; when it is the last live line the order goes `PAID | IN_DELIVERY → REFUNDED` (`refundCause = CANCELLATION`). A cancellation refund doesn't stop the sponsor's spending limit rising; a problem refund (`PROBLEM`) or BTG's refund of the order (`BTG`) does.

**Refunds to send** (2S4-BE-13): every refund of a paid order writes one `RefundDue`, `OPEN → SENT`. A card the provider can refund is sent at once (the stand-in on staging); otherwise Finance marks it sent with the method, a reference and the day. `SENT` is terminal.

**Illegal, named:**
- `PENDING_SELLER` or `PENDING_APPROVAL → AWAITING_PAYMENT`: no payment before the order is approved.
- `PAID → CANCELLED`: after payment, the way out is a refund.
- `FULFILLED → REFUNDED` while a payout is `PAID`: that's a dispute, not a refund.
- Changing the financial snapshot after `APPROVED`.

## 5 · Payment (`2S5-INT-01`, `2S5-INT-02`)

`CREATED → AUTHORIZED → CAPTURED → (PARTIALLY_REFUNDED →) REFUNDED`, with
`FAILED` reachable before `CAPTURED`. Webhooks are idempotent by provider
event id.

**Illegal, named:**
- `FAILED → CAPTURED`.
- Refunding more than was captured.
- Any state set from the client. Only the provider's webhook moves a payment.

### As built (2S5-INT-02, 2026-10-05)

The payment is the card attempt (`PaymentAttempt`):
`PENDING → PROCESSING → SUCCEEDED → (PARTIALLY_REFUNDED →) REFUNDED`, with
`FAILED` reachable from `PENDING` or `PROCESSING`. `SUCCEEDED` is the
design's `CAPTURED` (the provider authorises and captures in one step);
`refundedCents` never passes `amountCents` (a CHECK). `PENDING → PROCESSING`
is also made by the provider's own page when the sponsor completes it.

**The provider's word.** Every provider webhook is checked over its raw body
(a signed timestamp, five minutes either way: a replay is refused), mapped
onto nine provider-neutral events — `payment.processing | succeeded | failed
| refunded`, `dispute.opened | closed`, `payout.paid | failed | returned` —
and recorded once per (provider, event id) as a `PaymentEvent`, queued for
the worker in the same transaction. A duplicate delivery writes nothing. The
worker applies each event under the order's row lock; it ends:

| Event status | Means |
|---|---|
| `APPLIED` | it moved what it names |
| `IGNORED` | nothing left to do: a late or repeated word (a "processing" after "succeeded", a failure after "succeeded", a second "succeeded") |
| `DEFERRED` | it names something SponsorX hasn't recorded yet; tried again after 30 s, 2, 10, 30, 60 and 180 minutes |
| `HELD` | BTG's, with the reason: "succeeded" after a recorded failure, an amount that isn't the payment's |
| `FAILED` | BTG's: deferred past the last try, or its handler failed six times |

**Illegal, as built:** any move backwards (`SUCCEEDED → PROCESSING`,
`SUCCEEDED → FAILED`), `FAILED → SUCCEEDED` by itself (HELD instead), and
applying one event twice (the event's row lock and its status).

**Outages (2S8-QA-02).** Every call to the provider goes through the adapter
with a timeout (`PAYMENT_PROVIDER_TIMEOUT_MS`), inside the transaction of the
step it belongs to: the provider down (or silent) when a sponsor starts
paying answers 503 `busy` with no attempt recorded; when a payout is handed
over, nothing is recorded as sent and the queue retries it with the same
idempotency key; when a card is refunded, the refund and its reversal stand
and the money waits on Finance's list. A step that fails half-way (the
database refusing a write) leaves nothing written. The stand-in can be told
it is down (`STANDIN_OUTAGE`) to prove it on staging.

### Stripe (2S5-INT-01 / -03, 2026-10-06)

With `PAYMENT_PROVIDER=stripe`, the sponsor pays on a hosted Checkout Session
created for each attempt. These Stripe events move the attempt; nothing else
does:

- `checkout.session.completed` (paid) gives `payment.succeeded`;
- `checkout.session.completed` (unpaid) gives `payment.processing`;
- `async_payment_succeeded` / `_failed` give `payment.succeeded` /
  `payment.failed`;
- `expired` gives `payment.failed`.

`payment_intent.payment_failed` is deliberately not applied, because the
sponsor retries a declined card on the same page. The attempt's `providerRef`
becomes the PaymentIntent (`pi_…`). Refunds and disputes then name the attempt
by that PaymentIntent, and by its metadata where Stripe carries it. Two
neutral events were added:

- `account.updated`, a payee's payout account, ready or not (§6);
- `provider.notice`, always HELD for BTG.

The full mapping is in documentation/SponsorX-Stripe-Integration.md §4.

## 6 · Payout (`2S5-BE-04`, `2S5-BE-05`)

`NOT_ELIGIBLE → ELIGIBLE → REQUESTED → APPROVED → PAID`, with `FAILED → REQUESTED`
(retry) and `HELD` reachable from `ELIGIBLE`, `REQUESTED` or `APPROVED`.

**Illegal, named:**
- `ELIGIBLE → PAID`, which skips approval.
- Any move to `PAID` while the order has an open dispute.
- `HELD → PAID`: a held payout goes back to `REQUESTED` first.

### As built (2S5-BE-05 … -08, 2026-10-02)

The payout row's states are `REQUESTED → APPROVED → SENDING → PAID`, with
`REJECTED` (BTG sends it back) and `FAILED` (the provider couldn't send it).
"Eligible" and "held" are not row states: eligibility is the payee's balance
(paid, delivered, past its holding period), and a hold is the payee's
(`payout-holds.ts`) — a held payee's payout is never requested, approved or
sent.

**Eligibility, all five every time (2S5-BE-04, 2026-10-05).** Money is
released only when the sponsor's payment is in (the payable is available),
the payee's lines are delivered and confirmed, the holding period has
passed, the payout account is READY, and no dispute is open on the order
(nor a provider refund BTG is checking). Each is checked where money moves:
the balance a payee can request, BTG's approval (the fifth check, `dispute`,
on every payout), and the worker's hand-over to the provider — an approved
payout whose account has left READY, or whose order is frozen, waits
`APPROVED` and is sent by the account's next READY or the dispute's
resolution.

**Approved automatically (2S5-BE-06).** `REQUESTED → APPROVED` is made by the
system, in the request's own transaction, when every check passes, the
amount is under $2,000, the payout account did not change in the last 7 days,
and the payee's automatic approvals in the last 7 days (an athlete's Phase 1
earnings included), counting this one, stay under $5,000. It is recorded as
`decidedBy: "system"`, `approvedAutomatically: true`, and audited
`payout.autoApprove` with the checks. Otherwise the payout stays `REQUESTED`
for BTG with its `reviewReasons` in words. A first payout gets no special
review. Requests, automatic approvals and payout-account changes for one
payee are serialised by a per-payee lock, so two at once cannot both pass the
7-day cap.

**Failed, and who it waits on (2S5-BE-07).** `SENDING → FAILED` carries a
failure kind and `waitingOn`:

| Kind | Waits on | Then |
|---|---|---|
| `TEMPORARY` | `SYSTEM_RETRY` | `FAILED → APPROVED` by the system ~1, 6 and 24 hours after each failure (`retryCount` 1–3, `nextRetryAt`); the failure after the third retry waits on `BTG` — "Couldn't be sent after 3 tries" |
| `ACCOUNT` | `PAYEE_ACCOUNT` | the payee is emailed to fix their payout account; the provider's next `READY` for it moves `FAILED → APPROVED` once; failing again, it waits on `BTG` |
| `OTHER` | `BTG` | BTG's retry |

BTG's retry (`FAILED → APPROVED`) works whoever it waits on and resets the
automatic count. A `FAILED` payout the system will send again keeps claiming
its money (it can't be requested again, and its order can't be refunded under
it); one left for `BTG` releases it, and BTG's retry is refused if the money
has since been requested again. Every automatic retry is audited
`payout.autoRetry` as the system and is conditional on the row, so a sweep
run twice retries once; every provider step (`APPROVED → SENDING`,
`SENDING → PAID | FAILED`) is conditional too, so a job delivered twice moves
it once. With no provider connected nothing is sent, so nothing fails.

**Executed and tracked by the provider's word (2S5-BE-05, 2026-10-05).**
"Admin approves" is now the automatic approval above, with BTG approving only
what it holds. `APPROVED → SENDING` is the worker's hand-over through the
provider adapter, sent with `<payout id>:<hand-over number>` as the
provider's idempotency key (`sendAttempts`), so a hand-over retried after a
crash is the same payout to the provider; a provider that throws rolls the
step back and the queue retries it. Everything after that is the provider's
event, through the payment webhook (§5):

| Event | Move |
|---|---|
| `payout.paid` | `SENDING → PAID`: its PAYOUT journals, the payee emailed |
| `payout.failed` | `SENDING → FAILED`, by kind (the table above); one left for `BTG` emails BTG's admins |
| `payout.returned` | `PAID → FAILED` as an `ACCOUNT` failure (`returnedAt`, `returnCount`): its PAYOUT journals mirrored, the payee asked to fix the account, sent again when it is READY; a second return is BTG's |

Out of order: a "paid" or "failed" before SponsorX recorded the hand-over, or
a return before the payment, waits (DEFERRED); a failure after "paid" is
ignored; a word about an earlier hand-over (its reference replaced by a
retry) is ignored; a "paid" for a payout SponsorX had failed is HELD for BTG
and its automatic retry stopped, so it is never paid twice.

**Illegal, as built:**
- `REQUESTED → APPROVED` automatically for a payee on hold, at or over the
  limit, after an account change within 7 days, or at the 7-day cap.
- An automatic retry beyond the third, or a second automatic retry after the
  payee fixed their account.
- A payout sent twice: every move out of `APPROVED`, `SENDING` and `FAILED`
  is conditional on the state it leaves.

**With Stripe (2S5-INT-01 / -03, 2026-10-06).** A hand-over is a **transfer**
to the payee's connected account, using separate charges and transfers. Its
idempotency key is `transfer:<payout id>:<hand-over>`, and the payout id is in
its metadata. These Stripe events map onto the payout events:

- `transfer.created` gives `payout.paid`. The transfer landing in the payee's
  Stripe balance **is** the paid moment.
- `transfer.reversed`, in full, gives `payout.returned`.
- A part reversal is HELD for BTG.

If Stripe refuses a transfer when it is handed over, the payout moves
`APPROVED → SENDING → FAILED` in one step, with Stripe's reason and a failure
kind:

- BTG's balance short gives `TEMPORARY`, and the sweep retries it;
- an account that can't take transfers gives `ACCOUNT`;
- anything else gives `OTHER`.

**Payout accounts (2S5-INT-03).** These are Accounts v2 recipients with the
Express dashboard. Stripe refuses v1 account creation for new platforms.
Onboarding is a hosted Account Link. The account's status
`NOT_SET_UP → NEEDS_INFO ⇄ READY` moves only on Stripe's word, through the
`account.updated` neutral event:

- thin `v2.core.account…` events, for which the worker reads the account;
- or a snapshot `account.updated`.

READY means transfers and payouts are both active and nothing is due from the
payee. A rejected account is HELD for BTG. A payee who had a stand-in account
starts again at Stripe: their status goes back to NOT_SET_UP, and the new
account counts as a change for the 7-day review.

### Phase 1 earning (2S5-BE-08)

`PENDING → ELIGIBLE` (the last deliverable verified) moves straight on to
`ELIGIBLE → APPROVED_FOR_PAYOUT` as the system, in the same transaction, on
the same rule (no payout-account check: Phase 1 money is paid outside
SponsorX). Otherwise it stays `ELIGIBLE` with its reasons for Finance.
`HELD` and `DISPUTED` earnings are never moved by the rule, nor is one
Finance releases by hand. `APPROVED_FOR_PAYOUT → PAID` stays Finance's,
with the transfer's reference.

## 7 · Dispute (`2S5-BE-03`)

`OPEN → UNDER_REVIEW → WON | LOST`. `WON` and `LOST` are terminal.

**Illegal, named:**
- Reopening a closed dispute (a new one is opened instead).
- `OPEN → WON`, which skips review.

### As built (2S5-BE-03, 2026-10-05)

| From | Legal moves | Who |
|---|---|---|
| — | → `OPEN` on the provider's `dispute.opened` (or its `dispute.closed` arriving first) | the provider |
| `OPEN` | → `UNDER_REVIEW` (what was sent to the provider, in a note) | BTG admin or Finance |
| `UNDER_REVIEW` | → `WON` or `LOST`, only to the outcome the provider reported (`providerOutcome`), with a note | a BTG admin |

The provider's `dispute.closed` records `providerOutcome` and tells BTG; it
moves no state. While `OPEN` or `UNDER_REVIEW` the order's money is frozen.
`LOST` reverses the order's books (or the lines named, for a part dispute),
sends back payouts not yet handed to the provider, and records what was
already paid out as owed back; `WON` sends a payout that was waiting on it.

**Illegal, as built:** any move by the system out of `OPEN` or
`UNDER_REVIEW`; resolving before the provider has decided, or to the other
outcome; a refund of the order while it is open, or after it was lost.

## How they depend on each other

| Rule | Machines |
|---|---|
| A property must be `APPROVED` to have a listing, and suspension pauses its published listings | onboarding → listing |
| Only a `PUBLISHED` listing can be reserved | listing → reservation |
| An order is created only from a `CONVERTED` reservation | reservation → order |
| An order is `PAID` only when its payment is `CAPTURED` | payment → order |
| A payout is `ELIGIBLE` only after the order is `FULFILLED` | order → payout |
| **An open dispute holds every payout on its order** (`→ HELD`), and a `LOST` dispute cancels the payout. As built: an approved payout waits `APPROVED` (not sent) and a requested one can't be approved; `LOST` sends back every payout not yet `SENDING` (`→ REJECTED` as the system) | dispute → payout |
| A refund the provider made on its own: the whole payment refunds the order (cancelling payouts not yet sent); anything else is held for BTG, and holds the order's payouts until BTG refunds it or closes it | payment → order, payout |
| A refund reverses in the ledger, never by editing an entry | payment → ledger (`2S0-PMO-02`) |
