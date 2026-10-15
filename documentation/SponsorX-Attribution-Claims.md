# SponsorX Attribution Claims

**Task `3S0-PMO-01` · Version 1.0 · 2026-10-15 · Phase 3 · For the owner's approval**

What SponsorX may say a campaign caused, and in what words. This is a
language decision, not a technical one. There are four kinds of result, and
**they are never added together, never blended into one "results" figure, and
never described in each other's words.** The sponsor's hub (`3S7-FE-01`), the
sponsor report, Zoho and anything else a sponsor reads all follow this.

The attribution sprint (`3S6`) builds against it. In particular, `3S6-BE-02`'s
rule that "modelled revenue is never labelled verified" is §2's table.

## 1 · The four classes

### Verified redemption (`VERIFIED_REDEMPTION`)
- **What it is:** a fan redeemed the sponsor's reward, and SponsorX recorded it. A `REDEEM` event on the sponsor's reward, through its own QR or link.
- **Evidence:** SponsorX's own record of the redemption. Nothing inferred.
- **Money:** none. A redemption is a count. Its value to the sponsor is theirs to judge.
- **Confidence:** certain, as a record of what happened.

### Verified transaction (`VERIFIED_TRANSACTION`)
- **What it is:** a sale at a partner store that matched the campaign **exactly**, by a reward token, an order id or a partner click id that SponsorX issued (`3S6-BE-03`, deterministic first).
- **Evidence:** the partner's record, matched key for key. The method is "deterministic", and the key is named.
- **Money:** the matched order's amount, as the partner reported it.
- **Confidence:** certain that the match is exact. The amount is the partner's.

### Modelled attribution (`MODELLED`)
- **What it is:** a sale a model links to the campaign **without** an exact match. For example, timing, place and audience overlap (`3S6-BE-03`'s probabilistic fallback).
- **Evidence:** the model's method, its version, its lookback window and its confidence. Always shown with the figure.
- **Money:** may be shown, labelled "likely", with its confidence.
- **Confidence:** below 1, always stated. **Never presented as verified.**

### Estimated media value (`ESTIMATED_MEDIA_VALUE`)
- **What it is:** what the exposure the campaign got would have cost to buy as advertising. Today that is verified views × the tenant's benchmark price per 1,000 (`3S7-BE-02`).
- **Evidence:** the verified views and the benchmark used, named.
- **Money:** shown as money, always labelled an estimate.
- **Confidence:** an estimate by construction. **It is not revenue, sales or return.**

## 2 · The words each may use

| Class | May say | Must never say |
|---|---|---|
| Verified redemption | "fans redeemed", "redemptions", "checked", "recorded by SponsorX" | sales, revenue, return, ROI, "converted" |
| Verified transaction | "sales matched to you", "matched exactly (by code / link / order id)", "checked" | "likely", modelled, or any word that hides which key matched |
| Modelled attribution | "likely", "sales likely from you", "modelled", "estimated by [method], [confidence]%" | verified, checked, confirmed, matched, proven, "caused" |
| Estimated media value | "estimated media value", "what the exposure would have cost to buy", "an estimate" | revenue, sales, earned, return, ROI, "worth" without "estimated" |

**Every class:**
- **Never summed.** No total, average or blend across classes. Four tiles, four figures (`classTiles`, `frontend/src/lib/sponsor-intelligence-live.ts`).
- **No "ROI" or "return on spend"** is computed from modelled attribution or estimated media value.
- **A ratio** (such as cost per result) may only divide spend by a **verified** class.

## 3 · Provenance

Every figure behind a class carries its source (`MetricSource`, `SponsorX-Metric-Provenance-Taxonomy.md`):

| Class | Sources it may rest on |
|---|---|
| Verified redemption | SponsorX's own events |
| Verified transaction | a partner record matched exactly (`ATTRIBUTED` with a deterministic key) |
| Modelled attribution | `ATTRIBUTED` with a probabilistic method, never `VERIFIED_*` |
| Estimated media value | `VERIFIED_API` / `VERIFIED_MANUAL` views only, times a benchmark (`ESTIMATED`) |

**Self-reported figures never feed any class.**

## 4 · Where a class has no data yet

Show **0 or nothing, never a guess.** Until partner-store data exists (`3S6`),
"sales matched" and "sales likely" are 0 (user, 2026-10-15). A segment or
figure with no named source is not shown.

## 5 · Approval

Approving this document unblocks `3S6-BE-01` (the adapter framework). The
legal review of sponsor-facing wording, consent basis and claims is
`3S0-LEG-01`'s, and it follows this document. Per the standing rule, no
development task waits on it.
