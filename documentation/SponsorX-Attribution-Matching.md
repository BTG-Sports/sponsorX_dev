# SponsorX Attribution Matching

**Tasks `3S6-BE-02`, `3S6-BE-03`, `3S6-BE-04` · Version 1.0 · 2026-10-16 · Phase 3, Sprint 6**

Partner stores send their sales through an adapter
([`SponsorX-Attribution-Framework.md`](./SponsorX-Attribution-Framework.md),
3S6-BE-01). This document covers what happens next:
- each sale is stored in one shape;
- it is matched to a campaign, exact keys first;
- a sale that does not match waits in a queue, with the reason.

What each result may be called is
[`SponsorX-Attribution-Claims.md`](./SponsorX-Attribution-Claims.md).

## 1 · One shape for every partner sale (`3S6-BE-02`)

Each sale or refund is one `PartnerSaleAttribution`. The name keeps it apart
from `SalesAttribution`, which credits a NEXT student with an ad sale.

| Field | What it says |
|---|---|
| Source | the partner, its adapter, the delivery it came in |
| The sale | the partner's own id, sale or refund, when, the amount and currency, the exact keys it carried, the US state if given |
| Status | `matched`, `unmatched` (the queue) or `dismissed` |
| How it was matched | class, method, the key that matched, the window in days, the confidence, the model version |
| What it was matched to | the campaign, and the athlete when the key names one |
| Why not | the reason, and for an ambiguous sale how many campaigns it could belong to |

- **Counted once.** The partner's own id is unique per partner. A sale sent
  again is a duplicate, not a second sale.
- **The database holds the claims rule** (CHECK
  `PartnerSaleAttribution_class_check`):
  - **verified** (`VERIFIED_TRANSACTION`) means deterministic, a named key and
    confidence 1, with no model;
  - **modelled** (`MODELLED`) means probabilistic, no key, a confidence below 1
    and a named model version;
  - so **a modelled sale can never be labelled verified**, whatever the code
    does.

## 2 · Matching, exact first (`3S6-BE-03`)

A sale is matched as it arrives.

**1. Exact keys, in this order:**

| Key | Found through | Gives |
|---|---|---|
| `token` | a SponsorX reward token | the reward's campaign and the athlete whose QR it was |
| `click_id` | an athlete's tracking-link code | the deliverable's campaign and athlete |
| `order_id` | a sale this partner already sent and that was matched | that sale's campaign; this is how a refund finds its sale |

- **The window.** A token or click counts only if the sale came **after** the
  fan's last scan or click, and no more than the adapter's lookback after it
  (30 days for the generic webhook).
- **Keys that point at different campaigns** are ambiguous. Nothing is guessed.
- **An exact match** is a verified sale: deterministic, the key named,
  confidence 1.

**2. The modelled fallback.** It is tried only when all three hold:
- no key matched (none given, an unknown token, or no match);
- the adapter declares probabilistic matching (the generic webhook does not);
- the partner says which US state the sale was in.

How it works (model `attribution`, `attr-geo-time@0.1.0`):
- **The candidates** are the campaigns whose rewards were redeemed in that
  state inside the window, at least `minRedemptions` times (3 by default).
- **Exactly one candidate:** a modelled sale, carrying the model version and
  the confidence (0.5 by default, never 1).
- **More than one:** ambiguous, and the sale goes to the queue.
- **The settings** live in the model registry, with safe ranges: confidence
  0.2–0.8, least redemptions 1–20
  ([`SponsorX-Model-Governance.md`](./SponsorX-Model-Governance.md)).

**Refunds** take on whatever their sale was. A refund of a modelled sale is
modelled too, never verified.

## 3 · The queue (`3S6-BE-04`)

**A sale that does not match stays visible,** with one of four reasons:

| Reason | Meaning |
|---|---|
| `no_match` | no key matched anything, and the model found nothing |
| `ambiguous` | the keys, or the model, point at more than one campaign |
| `outside_window` | the key matched, but the sale was before the exposure or after the lookback |
| `unknown_token` | a reward token SponsorX never issued, in this tenant |

- **The nightly retry.** The nightly run (step `attribution`) retries queued
  sales from the last 90 days. That catches a refund that arrived before its
  sale, or a click recorded late.
- **Dismissing.** A BTG admin may dismiss a queued sale, with a reason (10–500
  characters), for example a test order.
  - It is audited (`attribution.dismiss`).
  - The sale stays on the list, marked with who dismissed it and why.
  - The nightly retry leaves it alone.
- **Nobody assigns a sale to a campaign by hand.** A person's pick is neither
  an exact match nor a model's, and every sale must say how it was matched.

## 4 · Where it shows

**The attribution desk:** `GET /intelligence/attribution?campaign&tab=events|unmatched&class&page&size`.
It answers in the shape of the 3S6-FE-01 screen contract.
- **The four totals, never added together.** Verified redemptions; verified
  transactions and modelled sales, each counted as sales less refunds;
  estimated media value.
- **Events.** Each matched sale with its partner, method, key, window,
  confidence, model version, campaign and athlete. A refund's amount is
  negative.
- **Unmatched.** The queue: open sales first, then dismissed ones. Each shows
  which keys it carried, never their values, because a reward token is a fan's
  code.
- **Scope.** The queue is always the whole tenant's, because an unmatched sale
  has no campaign.

**Dismissing:** `POST /intelligence/attribution/unmatched/{saleId}/dismiss { reason }`.

**The sponsor's hub** (3S7-BE-02): "sales matched to you" and "sales likely
from you" now read these sales, for the sponsor's own campaigns in the range.

**Who** (`attribution`, RBAC matrix §36):
- **Read:** BTG admins, campaign managers and Sales.
- **Dismiss:** BTG admins.
- **Switched off per tenant** as the `attribution` feature.

## 5 · Where it lives

- `backend/src/domain/attribution-matching.ts`: the rules, the lookups and the
  nightly retry.
- `backend/src/domain/attribution-intake.ts`: stores and matches each
  delivery's events.
- `backend/src/domain/attribution-desk.ts`: the desk and dismissing.
- **Migration:** `20261016120000_partner_sale_attribution`.
- **Proof:** `backend/tests/attribution-matching.test.ts`. It covers:
  - every key and every reason;
  - the database refusing a modelled sale labelled verified;
  - the modelled fallback;
  - a refund matched by the nightly retry;
  - the desk's four totals;
  - dismissing;
  - who may see and do what;
  - the sponsor's hub.
