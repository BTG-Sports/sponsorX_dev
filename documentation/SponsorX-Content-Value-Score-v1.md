# Content Value Score v1 — Factors and Weights

**Task `P0-DATA-03` · Version 0.1 · 2026-09-15 · Status: transcribed from Blueprint §14, awaiting confirmation**

The Content Value Score is how BTG ranks athletes for a sponsor brief. **Phase 1
is rules-based and largely manual** — no algorithm, no learning. §14's own note
is explicit: Phase 3 replaces simplistic audience tiers with a real score and
performance-based recommendations.

---

## 1 · The seven factors as written in §14

| # | Factor | Weight | Phase 1 input |
|---|---|---|---|
| 1 | Engagement | 25% | Self-reported / verified engagement and campaign engagement |
| 2 | Content Quality | 20% | BTG reviewer score and sponsor approval history |
| 3 | Audience | 15% | Size, relevance, verified quality when available |
| 4 | Reliability | 15% | On-time delivery, responsiveness, revision rate |
| 5 | Geography | 10% | Fit to sponsor target market |
| 6 | Sport / Brand Fit | 10% | Category / sport relevance |
| 7 | Sponsor Performance | 5% | Clicks, claims, redemptions or other outcomes |

Weights total **100%**.

## 2 · What the weights say about the product

Worth stating plainly, because it is the score's main selling point: **follower
count is 15% and is not the largest factor.** Engagement and content quality
together are 45%. That is the difference between SponsorX and a spreadsheet of
Instagram handles, and it is the right emphasis for local businesses who care
whether a post moves anybody.

**Reliability at 15% is the quietly important one.** It is the only factor that
measures whether the athlete actually does the work, and it is the factor a
sponsor never sees but always feels.

## 3 · The provenance problem, stated honestly

This is the part needing a decision rather than transcription.

| Factor | Where the number comes from in Phase 1 | Provenance |
|---|---|---|
| Engagement | Athlete's own screenshots, or manual check | **self-reported** |
| Content Quality | BTG reviewer's judgement | verified-manual |
| Audience | Athlete-stated, sometimes checked | **self-reported** |
| Reliability | Our own delivery records | verified-api |
| Geography | Athlete-stated location | self-reported |
| Sport / Brand Fit | BTG assignment | verified-manual |
| Sponsor Performance | Our own reward and link events | verified-api |

**Only 20% of the score — Reliability and Sponsor Performance — rests on data the
system itself observed.** 50% is self-reported by the person being scored.

That is not a reason to abandon the score; it is a reason to label it. A single
number presented to a sponsor as though it were measured, when half of it is the
athlete's own account of themselves, is exactly the credibility risk the
provenance taxonomy exists to prevent.

**Rule: wherever the score is displayed, its provenance mix is displayed with it.**
A score is never shown as a bare number to a sponsor.

## 4 · How it is computed in Phase 1

- Each factor is scored **0–100** by the Athlete Network Manager, from the inputs
  above.
- The score is the weighted sum, rounded to a whole number.
- Every score is stored as a **snapshot** with `method: "rules-v1"`, the factor
  values, who set them and when. Scores are never recomputed in place — a new
  assessment is a new snapshot, so an athlete's history stays readable.
- **A missing factor is not zero.** A zero is an assessment; an absence is not.
  If a factor cannot be assessed it is recorded as absent and the score is
  computed over the remaining weights, with the gap shown.

## 5 · Questions for confirmation

1. Are the seven factors and weights correct as written in §14?
2. **Engagement is the largest factor and the least verifiable.** Should a
   self-reported engagement figure be capped, or discounted, until it has been
   verified against a real platform API?
3. A new athlete has no Reliability and no Sponsor Performance history — 20% of
   the score. Do they start at zero, at a neutral midpoint, or is the score
   computed over the remaining 80% until they have a track record? Starting at
   zero makes every new athlete unrankable against an established one.
4. Who may see the score — the sponsor, the athlete themselves, or BTG only? An
   athlete seeing a low score they cannot explain is a retention problem; one who
   cannot see it cannot improve it.

## Confirmation

| | |
|---|---|
| **Factors and weights confirmed** | Yes / with changes below |
| **New-athlete handling** | |
| **Score visibility** | |
| **Confirmed by** | |
| **Date** | |

*References: Blueprint §14, §6, §22; `SponsorX-Metric-Provenance-Taxonomy.md`.
Implements `P0-DATA-03`. Feeds `AthleteScore` (`P3-BE-09`) and the matching
query.*
