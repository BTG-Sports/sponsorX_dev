# The Six Sponsor Packages and Their Inventory

**Task `P0-PMO-10` · Version 0.1 · 2026-09-15 · Status: transcribed from Blueprint §7, awaiting business confirmation**

These seed the `SponsorPackage` catalogue and are what a sponsor sees on the
public packages page. Sponsor prices only — athlete pay never appears on a
sponsor-facing screen.

---

## 1 · The packages as written in §7

| # | Package | Sponsor price | Typical inventory | Purpose |
|---|---|---|---|---|
| 1 | SponsorX Test Drive | $750 | 3 athletes; one activation each; basic report | Low-friction first purchase |
| 2 | Local Blitz | $1,500–$3,000 | 5–10 athletes; short-form content + stories | Local awareness / traffic |
| 3 | 10-Athlete Blitz | ~$2,500 | 10 coordinated activations + QR / reward | Distributed athlete media |
| 4 | Community Campaign | ~$5,000 | 10–15 athletes + premium content + iMC/BTG feature + reward | Mid-level campaign |
| 5 | Athlete Takeover | ~$10,000 | 15–25 athletes + multi-week + media / event components | Major activation |
| 6 | Season Partner | $15K–$30K+ | Recurring athlete content, BTG/iMC, events, rewards, exclusivity | Category ownership / retention |

## 2 · The finding that blocks seeding

**No package says which NIL jobs it contains.** "Short-form content", "premium
content" and "multi-week components" are sales language, not a bill of materials.
Because the package price is fixed while the athlete count is a *range*, the same
package can be delivered at wildly different cost with nobody doing anything
wrong.

Athlete Takeover at ~$10,000 makes the point:

| Delivered as | Athlete cost (mid-band pay) | BTG margin |
|---|---|---|
| 15 athletes × SX-03 Athlete Reel | $1,688 | **83%** |
| 25 athletes × SX-06 Content Day | $6,250 | **37%** |
| 25 athletes × SX-07 Monthly Ambassador | $13,125 | **−31%** |

A 114-point margin swing inside one package, entirely from choices a campaign
manager makes in good faith after the sale. Community Campaign has the same
shape: 15 athletes at Content Day rates is $3,750 against a ~$5,000 price, a 25%
margin before any BTG or iMC cost.

**A package cannot be seeded as a priced product until its inventory is expressed
in job codes and counts.** Until then it is a price with a description attached.

## 3 · Proposed inventory shape

What the record needs, per package — the numbers below are a **proposal to be
confirmed**, built to sit inside the §7 prices at roughly the catalogue's 60%
margin:

```json
{
  "code": "TEST_DRIVE",
  "name": "SponsorX Test Drive",
  "priceUsd": { "min": 750, "max": 750 },
  "athletes": { "min": 3, "max": 3 },
  "lineItems": [
    { "jobCode": "SX-01", "quantityPerAthlete": 1 }
  ],
  "includes": ["basic_report"],
  "exclusivity": false,
  "durationWeeks": 1
}
```

| Package | Proposed line items | Athletes | Est. athlete cost | Margin at list |
|---|---|---|---|---|
| Test Drive | 1 × SX-01 each | 3 | $113 | 85% |
| Local Blitz | 1 × SX-02 each | 5–10 | $375–$750 | 75%–50% |
| 10-Athlete Blitz | 1 × SX-02 each | 10 | $750 | 70% |
| Community Campaign | 1 × SX-03 each | 10–15 | $1,125–$1,688 | 78%–66% |
| Athlete Takeover | 1 × SX-04 each | 15–25 | $2,813–$4,688 | 72%–53% |
| Season Partner | 1 × SX-07 each / month | 10–15 | negotiated | negotiated |

These deliberately pitch the job codes **lower** than the package descriptions
imply, because the descriptions are what produce the negative margins in §2. If
the business wants Takeover to genuinely mean ambassador-grade work, the price
has to rise rather than the margin absorb it.

## 4 · Two structural questions

**The Local Blitz / 10-Athlete Blitz overlap.** At $2,500 with 10 athletes, both
packages apply, and they are described almost identically. A sponsor comparing
them cannot tell what differs, and neither can a salesperson. Either 10-Athlete
Blitz is a fixed-count point inside Local Blitz's range — in which case it is a
preset, not a package — or Local Blitz's range should stop below it.

**"iMC/BTG feature" appears in packages 4, 5 and 6** but is not a NIL job and has
no cost line. If BTG-owned media is part of what a sponsor buys, it is inventory
and needs a record; if it is a goodwill extra, it should not be in the sold
description.

## 5 · Questions for confirmation

1. Are the six names and price bands correct as written?
2. Confirm or correct the proposed line items in §3 — this is the part that
   makes packages real products rather than descriptions.
3. Resolve the Local Blitz / 10-Athlete Blitz overlap.
4. Is "iMC/BTG feature" sold inventory or a goodwill extra?
5. Does Season Partner's exclusivity mean **category** exclusivity, and if so, at
   what geographic scope? Exclusivity is a conflict check the system has to
   enforce (§26), so it needs a definition, not an intent.

## Confirmation

| | |
|---|---|
| **Packages confirmed as written** | Yes / with changes below |
| **Line items confirmed** | |
| **Blitz overlap resolved as** | |
| **Confirmed by** | |
| **Date** | |

*References: Blueprint §7, §5, §26. Implements `P0-PMO-10`. Seeds
`SponsorPackage` (`P3-BE-11`) and the public catalogue (`P3-FE-05`).*
