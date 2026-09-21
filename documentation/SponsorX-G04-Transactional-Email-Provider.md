# Decision G-04 — Transactional Email Provider

**Task `P0-PMO-03` · Version 0.1 · 2026-09-15 · Status: decided, for confirmation**

---

## The decision

**Resend**, accessed only through a single internal interface so the vendor can
be changed later without touching any feature code.

## Why Resend

The candidates were Resend, Postmark and Amazon SES.

| | Resend | Postmark | SES |
|---|---|---|---|
| Time to first working send | minutes | minutes | hours — sandbox removal, identity setup |
| Deliverability reputation | good | best in class | depends entirely on how you configure it |
| Cost at Phase 1 volume | negligible | negligible | negligible |
| Operational burden | low | low | meaningful — bounce/complaint handling is yours |

At Phase 1 volume — roughly 25 athletes and 10 sponsors — none of these will
struggle to deliver the mail. **Cost and deliverability are therefore not the
deciding factors; they are near-identical at this scale.** What differs is setup
and operational burden, and SES is clearly the heaviest for a two-person team.

Between Resend and Postmark the honest answer is that either would do. Resend is
chosen because it is already the stack's recorded default (Addendum A1), its SDK
is already pinned in the implementation guide, and choosing the recorded default
costs nothing to reverse.

**Postmark is the fallback**, not SES: if delivery of transactional mail ever
becomes a problem, Postmark is the one with the stronger reputation for exactly
this traffic.

## The abstraction that makes this reversible

This is the part that matters more than the vendor choice.

**No feature code may import the Resend SDK.** All mail goes through one internal
module exposing a single operation — send a named template to a recipient with a
set of variables — and one adapter behind it that speaks to the vendor.

Three rules keep the door open:

1. **One interface, one adapter.** Swapping providers means writing a second
   adapter, not editing the campaign loop.
2. **Templates are ours, not the vendor's.** If templates live in the vendor's
   dashboard, migrating means rebuilding them by hand under time pressure.
3. **Sends are queued, never inline.** Mail goes out through the worker queue, so
   a provider outage delays notifications instead of failing the request that
   triggered them — the same rule the architecture already applies to Zoho.

## What this does not decide

- **The sending domain.** Every provider needs DNS verification, and BTG has no
  domain yet. That is a prerequisite nobody has scheduled — see the note in the
  domain gap raised alongside Clerk's production instance.
- **Marketing email.** This decision covers transactional mail only: invitations,
  approvals, order notifications, report delivery.
- **SMS** — decided separately and negatively in G-06 (`P0-PMO-04`).

## Confirmation

| | |
|---|---|
| **Decision** | Resend, behind a single send interface |
| **Fallback** | Postmark |
| **Confirmed by** | |
| **Date** | |

*References: Addendum A1; Guide §01 (`resend` pinned at 6.28.0); Blueprint §37.
Implements `P0-PMO-03`. Unblocks `P3-INT-01` (transactional email send
interface).*
