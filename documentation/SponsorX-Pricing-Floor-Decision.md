# The Margin Floor Rule and Tier-Derived Sell Floors

**Task `P0-PMO-13` · Version 1.0 · 2026-09-18 · Status: decided**

`P0-PMO-09` and `P0-PMO-10` documented two pricing faults and closed without
answering them, because the answer was commercial rather than technical. This
document is the answer. It settles both, and it is what `P3-BE-11` seeds and
`P3-BE-12` enforces.

---

## 1 · The two faults, in one line each

1. **The tier multiplier scales athlete pay; nothing scales the sell floor.** At
   the top of the base band a Premium athlete costs more than the job's cheapest
   sell price — on all seven jobs. SX-07 is negative before any multiplier,
   because its base-band top ($750) equals its sell floor.
2. **No package names its NIL job codes.** The price is fixed while the athlete
   count is a range, so Athlete Takeover at ~$10,000 delivers anywhere between
   +83% and −31% margin, with nobody doing anything wrong.

## 2 · Decision one — the floor rule

**Sponsor price may never be below athlete cost × 1.4.**

- Athlete cost means the agreed rate for that athlete on that job, after the §6
  tier multiplier — not the band, not the midpoint.
- It is a **hard block**, not a warning. It fails at the moment the price is set,
  not at month end.
- It applies per campaign-order line. A campaign does not average a losing line
  against a profitable one.

**Assumption this rests on:** the floor of each §5 sell band is a *real* floor,
not an opening indication staff may discount below. A discountable floor makes
this rule decorative, and `P0-PMO-09` §5 Q3 raised exactly that risk. If the
business later permits discounting, the discount must clear the same 1.4×, and
this document changes rather than the code.

## 3 · Decision two — sell floors are derived, not negotiated

A 1.4× rule alone makes every published sell floor unreachable for a strong
athlete, which would surface as a confusing error rather than as pricing. So the
rate card carries a floor **per job per tier**, computed as

```
minimum sell price  =  base-band top  ×  tier multiplier  ×  1.4
```

| Code | Job | Old published floor | Emerging (1.0×) | Creator (1.25×) | Premium (1.5×) |
|---|---|---|---|---|---|
| SX-01 | Story Drop | $75 | **$70** | **$88** | **$105** |
| SX-02 | Sponsored Post | $125 | **$140** | **$175** | **$210** |
| SX-03 | Athlete Reel | $200 | **$210** | **$263** | **$315** |
| SX-04 | Product Experience | $350 | **$350** | **$438** | **$525** |
| SX-05 | Local Appearance | $400 | **$420** | **$525** | **$630** |
| SX-06 | Content Day | $500 | **$490** | **$613** | **$735** |
| SX-07 | Monthly Ambassador | $750 | **$1,050** | **$1,313** | **$1,575** |

This is the substance of the workbook's option 2 — tier-aware sell bands —
obtained by formula from option 1 rather than by re-pricing the catalogue by
hand. The §5 sell-band **tops** are unchanged.

**Anchor tier** has a negotiated multiplier, so it has no derived floor. The 1.4×
rule still applies to whatever rate is agreed.

## 4 · Decision three — SX-07's band is corrected

SX-07 is the one job the rule cannot rescue on its own: its base-band top equals
its old sell floor, so it was underwater before any tier was applied.

**SX-07's sell band becomes $1,050 – $2,000.** The pay band is unchanged. Every
other job keeps its published band; only its floor becomes tier-aware.

## 5 · Decision four — package line items

The proposal in `P0-PMO-10` §3 is adopted as written. Each package is now a bill
of materials, not a description:

| Package | Line items | Athletes | Athlete cost | Margin at list |
|---|---|---|---|---|
| Test Drive | 1 × SX-01 each | 3 | $113 | 85% |
| Local Blitz | 1 × SX-02 each | 5–9 | $375–$675 | 75%–55% |
| 10-Athlete Blitz | 1 × SX-02 each | 10 | $750 | 70% |
| Community Campaign | 1 × SX-03 each | 10–15 | $1,125–$1,688 | 78%–66% |
| Athlete Takeover | 1 × SX-04 each | 15–25 | $2,813–$4,688 | 72%–53% |
| Season Partner | 1 × SX-07 each / month | 10–15 | negotiated | negotiated |

All six clear the 1.4× floor at every point in their range; the tightest is Local
Blitz at 2.2× at its worst corner.

Two consequences, both deliberate:

- **The Blitz overlap is resolved by narrowing Local Blitz to $1,500–$2,400 and
  5–9 athletes**, leaving 10-Athlete Blitz as a distinct $2,500 / 10-athlete
  product rather than a price point inside another package's range.
- **"iMC/BTG feature" becomes a non-NIL inventory line** with a record and a zero
  cost line, because §26 exclusivity checks and delivery tracking both need it to
  exist as a thing that was sold. It is no longer an unpriced phrase in a
  description.

Where a package's §7 description implies richer work than its line items (Athlete
Takeover is the clear case), the answer is to raise the price, not to let the
margin absorb it. That stays true after this decision.

## 6 · What enforces this

| Where | What |
|---|---|
| `P3-BE-12` | The runtime block. Refuses any order line below athlete cost × 1.4, naming the job, tier, computed floor and shortfall. |
| `P3-BE-11` | Seeds the six packages with the §5 line items above. |
| `P2-BE-02` | `NilJob` carries the per-tier derived floor; `SponsorPackage` carries line items. |
| Rate card | The §3 table is the published view. It is generated from the formula, never edited by hand. |

**The floor is computed at runtime from the agreed athlete rate.** The §3 table is
the conservative rate-card view, computed against the base-band top. Where an
athlete's agreed rate is below that top, the runtime floor is lower than the
table, and that is correct — the table exists so a salesperson knows the worst
case before quoting.

## 7 · What this does not decide

- Whether staff may discount at all (see §2's assumption).
- The `+` suffixes on SX-06 and SX-07 — still open-ended, still without an upper
  bound for the rate card.
- Season Partner's exclusivity scope, which is a conflict check §26 has to
  enforce and still needs a definition rather than an intent.

---

*References: Blueprint §5, §6, §7, §26. Implements `P0-PMO-13`. Closes the open
findings in `P0-PMO-09` §4 and `P0-PMO-10` §2 and §4. Enforced by `P3-BE-12`;
seeds `P3-BE-11`, `P2-BE-02`. Source analysis:
`Claude outputs/SponsorX-Pricing-Collision.xlsx`.*
