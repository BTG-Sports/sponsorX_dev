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

`DRAFT → PENDING_APPROVAL → PUBLISHED ⇄ PAUSED → ARCHIVED`, and
`PENDING_APPROVAL → DRAFT` when changes are requested.

**Illegal, named:**
- Any listing for a property that isn't `APPROVED`.
- `DRAFT → PUBLISHED`, which skips BTG's approval.
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

`PENDING_APPROVAL → APPROVED → AWAITING_PAYMENT → PAID → IN_DELIVERY → FULFILLED → CLOSED`.
`CANCELLED` is reachable before `PAID`. `REFUNDED` is reachable from `PAID` or `IN_DELIVERY`.

**Illegal, named:**
- `PENDING_APPROVAL → AWAITING_PAYMENT`: no payment before BTG approves.
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
