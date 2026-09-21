# Reward Event Taxonomy — SCAN, LANDING, CLAIM, REDEEM

**Task `P0-DATA-02` · Version 0.1 · 2026-09-15 · §38 deliverable**

§16 requires that scan, landing visit, claim and redemption are stored as
**separate events**. This document defines the exact trigger for each, because
the whole reward funnel measures nothing if they are fuzzy — and a funnel that
double-counts is worse than one that undercounts, since it inflates exactly the
number a sponsor is being sold on.

---

## The four events

### 1 · SCAN
**Trigger:** the QR code's URL is requested, before any page is rendered.

**Recorded:** reward token, athlete, campaign, timestamp, coarse geography
resolved from IP.

**Counts once per request.** A person scanning twice produces two SCANs — that is
correct and deliberate. SCAN measures *exposure of the code*, not people.

**Explicitly not a scan:** a link clicked in a social post. That is a tracking
link (`TrackingLink` / `LinkEvent`), a different funnel, and merging the two
would let link traffic inflate the physical-presence number.

### 2 · LANDING
**Trigger:** the fan landing page is successfully served — a 200 response with
the reward content.

**Counts once per SCAN that results in a rendered page.**

**The gap between SCAN and LANDING is the interesting number**, and it must not
be engineered away: it is bot traffic, prefetchers, expired or already-used
tokens, and — most importantly — venue wifi failing. A large gap is an
operational finding about the venue, not a measurement bug.

### 3 · CLAIM
**Trigger:** the fan submits the claim form and it is accepted — consent given,
details captured, coupon or token issued.

**Recorded:** the fan's consented details, the consent version and timestamp, and
the issued token.

**Counts once per fan per reward.** A second submission with the same identity
returns the existing token and records **no** second CLAIM. This is the one event
where deduplication is mandatory: a CLAIM is a person entering the sponsor's
lead list, and a duplicated lead is a real-world error, not a statistical one.

**A CLAIM is the consent record.** It is not a marketing metric that happens to
carry an email address — it is the legal basis for the sponsor holding that
person's details, and it must be as durable as the token it issues.

### 4 · REDEEM
**Trigger:** the issued token is validated and marked used at the point of
redemption — merchant or staff validation.

**Counts exactly once per token, forever.** Enforced by a partial unique index in
Postgres, not by application logic. A second attempt is rejected as already
redeemed and is **not** recorded as a REDEEM — though the attempt is worth
logging separately, because repeated attempts are how you spot a shared or
screenshotted code.

§16 is explicit that payment-network attribution is not needed in Phase 1;
merchant or staff validation of a unique code is sufficient.

---

## The funnel, and what each step actually tells a sponsor

| Step | Question it answers | Honest name |
|---|---|---|
| SCAN | Did the code get in front of people? | Exposure |
| LANDING | Did the technology work? | Delivery |
| CLAIM | Did anyone want it enough to give their details? | Interest |
| REDEEM | Did anyone walk in and use it? | Outcome |

**Only REDEEM is business outcome.** SCAN and LANDING are operational; CLAIM is
intent. Any report that presents SCAN as a result is overselling, and that is
precisely the credibility risk the provenance labels exist to prevent.

## Rules that follow

- **Every event stands alone.** A REDEEM is never inferred from a CLAIM, and a
  LANDING is never inferred from a SCAN. Each is written when its own trigger
  fires, or not at all.
- **Events are never back-filled.** A missing LANDING stays missing; it is data
  about a failure.
- **Ratios are computed, never stored.** Claim rate is CLAIM ÷ LANDING at read
  time, so a corrected event corrects every derived number.
- **IP is used and discarded.** Geography is resolved at write time; the IP
  address is never persisted (§26).
- **Provenance:** all four are `verified-api` — they are events our own system
  observed. They are the most trustworthy numbers in the entire product, and
  they should be presented as such precisely because so much else in Phase 1 is
  self-reported.

## Confirmation

| | |
|---|---|
| **Taxonomy confirmed** | Yes / with changes below |
| **Confirmed by** | |
| **Date** | |

*References: Blueprint §16, §26, §38; `SponsorX-Metric-Provenance-Taxonomy.md`.
Implements `P0-DATA-02`. Defines the events built in `P6-BE-*` (tracking and
reward funnels).*
