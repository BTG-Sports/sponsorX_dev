# NIL Job Catalogue Economics — SX-01 to SX-07

**Task `P0-PMO-09` · Version 0.1 · 2026-09-15 · Status: transcribed from Blueprint §5, awaiting business confirmation**

These numbers seed the `NilJob` table. Once loaded they are what athletes are
offered and what sponsors are quoted, so they need a deliberate yes rather than
an assumed one.

---

## 1 · The catalogue as written in §5

| Code | Job | Athlete base pay | Suggested sponsor sell price | Core deliverable |
|---|---|---|---|---|
| SX-01 | Story Drop | $25–$50 | $75–$125 | 1 story + sponsor tag + CTA |
| SX-02 | Sponsored Post | $50–$100 | $125–$250 | 1 approved feed post / carousel |
| SX-03 | Athlete Reel | $75–$150 | $200–$400 | 15–45 sec vertical video |
| SX-04 | Product Experience | $125–$250 | $350–$650 | 1 Reel + 1 Story + product integration |
| SX-05 | Local Appearance | $150–$300 | $400–$750 | 60–120 minute appearance |
| SX-06 | Content Day | $150–$350 | $500–$1,000+ | Photo / video / interview content session |
| SX-07 | Monthly Ambassador | $300–$750+ | $750–$2,000+ | Multi-deliverable 4-week activation |

§5 carries its own caveat: *these are SponsorX launch assumptions, not universal
NIL market rates.*

## 2 · Tier multipliers (§6)

| Tier | Profile | Multiplier |
|---|---|---|
| Emerging | Smaller but engaged; typically 1K–5K audience | 1.00× |
| Creator | Stronger content and/or 5K–20K audience | 1.25× |
| Premium | 20K–50K, or demonstrated sponsor performance | 1.50× |
| Anchor | Premium BTG relationship or independently valuable | Negotiated |

## 3 · Margin at the midpoints — healthy and consistent

| Code | Mid pay | Mid sell | BTG margin | % |
|---|---|---|---|---|
| SX-01 | $37.50 | $100 | $62.50 | 62.5% |
| SX-02 | $75 | $187.50 | $112.50 | 60.0% |
| SX-03 | $112.50 | $300 | $187.50 | 62.5% |
| SX-04 | $187.50 | $500 | $312.50 | 62.5% |
| SX-05 | $225 | $575 | $350 | 60.9% |
| SX-06 | $250 | $750 | $500 | 66.7% |
| SX-07 | $525 | $1,375 | $850 | 61.8% |

Priced at the middle of both bands the catalogue is coherent: **60–67% gross
margin across all seven jobs.** That consistency is a good sign — it means the
bands were set deliberately rather than one at a time.

## 4 · The finding that needs a decision

**The tier multiplier is applied to athlete pay but nothing protects the sell
floor. At the top of the base band, a Premium athlete costs more than the
cheapest price the job is sold for — on every single job.**

| Code | Base top | × 1.50 Premium | Sell floor | Margin |
|---|---|---|---|---|
| SX-01 | $50 | $75 | $75 | **$0** |
| SX-02 | $100 | $150 | $125 | **−$25** |
| SX-03 | $150 | $225 | $200 | **−$25** |
| SX-04 | $250 | $375 | $350 | **−$25** |
| SX-05 | $300 | $450 | $400 | **−$50** |
| SX-06 | $350 | $525 | $500 | **−$25** |
| SX-07 | $750 | $1,125 | $750 | **−$375** |

It is not only the Premium tier. At **Creator (1.25×)**, SX-02 breaks even at the
sell floor and **SX-07 loses $187.50**.

This is not a mistake in the numbers — each band is reasonable read alone. It is
that the two tables were written independently and multiply against each other.
In practice it means a network manager can, in good faith, assign a strong
athlete to a discounted job and lose money on the campaign, with nothing in the
system objecting.

**SX-07 is the sharpest case**: the base band top ($750) equals the sell floor
($750) before any multiplier at all.

### Three ways to resolve it — business decides

1. **A floor rule.** Sponsor price may never be below athlete cost × a minimum
   margin (say 1.4×). Simple, enforceable in code, and it makes the conflict
   visible at quote time rather than at month end.
2. **Tier-aware sell bands.** A Premium athlete's job carries a higher sell floor.
   Truest to how the pricing actually works, and the most work.
3. **Cap the multiplier per job.** The tier multiplier applies only up to the
   base band's midpoint, not its top.

Recommendation: **option 1 for Phase 1.** It is one rule, it fails loudly, and it
does not require re-pricing the catalogue before launch.

## 5 · Questions for confirmation

1. Are the seven jobs and their two bands correct as written in §5?
2. Which resolution for the margin collision in §4 — floor rule, tier-aware
   bands, or capped multiplier?
3. Is the floor of each sell band a **real** floor, or an opening indication that
   staff may discount below? If staff can discount, the collision in §4 gets
   worse, not better.
4. Are the `+` suffixes on SX-06 and SX-07 open-ended by design, or should they
   carry an upper bound for the rate card?

## Confirmation

| | |
|---|---|
| **Catalogue confirmed as written** | Yes / with changes below |
| **Margin-collision resolution** | |
| **Confirmed by** | |
| **Date** | |

*References: Blueprint §5, §6; Addendum A. Implements `P0-PMO-09`. Seeds the
`NilJob` and `AthleteRate` models (`P2-BE-02`, `P3-BE-10`).*
