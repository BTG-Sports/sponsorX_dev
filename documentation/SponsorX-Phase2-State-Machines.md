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

## 6 · Payout (`2S5-BE-04`, `2S5-BE-05`)

`NOT_ELIGIBLE → ELIGIBLE → REQUESTED → APPROVED → PAID`, with `FAILED → REQUESTED`
(retry) and `HELD` reachable from `ELIGIBLE`, `REQUESTED` or `APPROVED`.

**Illegal, named:**
- `ELIGIBLE → PAID`, which skips approval.
- Any move to `PAID` while the order has an open dispute.
- `HELD → PAID`: a held payout goes back to `REQUESTED` first.

## 7 · Dispute (`2S5-BE-03`)

`OPEN → UNDER_REVIEW → WON | LOST`. `WON` and `LOST` are terminal.

**Illegal, named:**
- Reopening a closed dispute (a new one is opened instead).
- `OPEN → WON`, which skips review.

## How they depend on each other

| Rule | Machines |
|---|---|
| A property must be `APPROVED` to have a listing, and suspension pauses its published listings | onboarding → listing |
| Only a `PUBLISHED` listing can be reserved | listing → reservation |
| An order is created only from a `CONVERTED` reservation | reservation → order |
| An order is `PAID` only when its payment is `CAPTURED` | payment → order |
| A payout is `ELIGIBLE` only after the order is `FULFILLED` | order → payout |
| **An open dispute holds every payout on its order** (`→ HELD`), and a `LOST` dispute cancels the payout | dispute → payout |
| A refund reverses in the ledger, never by editing an entry | payment → ledger (`2S0-PMO-02`) |
