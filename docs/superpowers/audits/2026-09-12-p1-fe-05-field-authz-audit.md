# P1-FE-05 — Field-level authorization audit of every fixture-backed screen

**Date:** 2026-09-12 · **Branch:** `P1-FE-QA-PMO` · **Rule under audit (§26, guide §04):**
no sponsor-facing screen renders `AthleteRate.amount`; no athlete-facing screen
renders `Campaign.budget`. Admin (BTG staff) screens are exempt — staff see both
sides by design.

## Method

Two independent passes, both automated and re-runnable:

1. **Import analysis** — which pages import the sensitive fixtures.
   `AthleteRate.amount` lives in the `rates` fixture; campaign budget lives in
   `sponsorCampaigns[].spend`, `sponsorBudget`, `builderDraft.budget`,
   `roiGauge.invested`. A page that never imports the fixture cannot render it
   *and cannot leak it through the RSC flight payload* — server components only
   serialize data they actually used.
2. **Rendered-HTML check** — fetched every route on the dev server, stripped
   `<script>` blocks (Next's RSC payload uses `"$40"`-style tokens as row
   *references*, which false-positive naive dollar greps), and searched visible
   HTML for the exact `money()` renderings: athlete rates `$40 / $90 / $140 /
   $220 / $280 / $320 / $650` on sponsor-facing routes; budget figures
   `$47,500 / $30,250 / $19,200 / $2,800 / $5,000 / $2,500 / $750` on
   athlete-facing routes (negative-lookahead so `$400`, `$40K` don't match).

## Route-by-route verdict

| Route | Audience | Money shown | Verdict |
|---|---|---|---|
| `/sponsor` | Sponsor | Own spend vs Zoho budget | ✅ no athlete rates |
| `/sponsor/marketplace` | Sponsor | `sellPrice` (sponsor price) only; carries the §13 footnote that `AthleteRate.amount` never reaches the page | ✅ |
| `/sponsor/marketplace/[jobId]` | Sponsor | Sponsor price, implied CPM | ✅ |
| `/sponsor/campaigns/[id]/report` | Sponsor | Own investment, media value | ✅ |
| `/athletes/[slug]` (public profile) | Sponsor-facing | Sponsor prices per §9 screen 5 | ✅ |
| `/packages`, `/` (home), `/map` | Public/sponsor-facing | Package price ranges; "rates" appears only as prose | ✅ |
| `/properties/[slug]` | Sponsor-facing | Property opportunity prices | ✅ |
| `/athlete` | Athlete | Own rate card (explicitly allowed — their own rates), own earnings | ✅ no campaign budget |
| `/athlete?demo=minor` | Athlete | Same + guardian gating | ✅ |
| `/athlete/earnings` | Athlete | Own earnings incl. HELD | ✅ |
| `/athlete/invitations` | Athlete | Own offered compensation (allowed — it is their pay) | ✅ |
| `/athlete/orders/[id]` (inv_1, inv_5 checked) | Athlete | Own compensation; page comment documents the asymmetry | ✅ |
| `/join` | Athlete-facing | No amounts | ✅ |
| `/property` | Property | Own inventory/sell-through; imports no rate or earning fixtures | ✅ |
| `/admin`, `/admin/analytics`, `/admin/applications`, `/admin/approvals`, `/admin/campaigns/new`, `/admin/campaigns/[id]`, `/admin/finance`, `/admin/rewards/new` | BTG staff | Both sides | Exempt by rule |
| `/r/[token]` (fan), `/t/[code]` (redirect), `/login` | Public | No amounts | ✅ |

## Results

- **Zero leaks found. No code changes required.**
- Import analysis: `rates` is imported only by `/athlete` (own rate card).
  Budget-shaped fixtures are imported only by `/sponsor`,
  `/sponsor/campaigns/[id]/report` (sponsor's own budget — allowed) and two
  admin pages (staff — exempt).
- Visible-HTML checks: 16 routes checked (9 sponsor-facing for rate strings,
  7 athlete-facing for budget strings) — all pass.
- P1-FE-04's additions re-checked: `campaignDetailX` carries no amounts;
  `heldNote` and `declineReason` render on athlete surfaces only.

## Known false-positive to save the next auditor time

A naive grep for `$40`/`$220` on any page hits Next's inline RSC flight
payload — those are serialized row-reference tokens, not currency. Strip
`<script>` blocks before string-matching, or trust the import analysis.

## Caveat

This audits **fixtures rendering**, which is all Phase 1 has. The rule becomes
enforceable-by-construction in Stage 2 when `scope.ts` (P2-BE-04) and the §30
authorization test suite (P2-SEC-01) land — this record is the UI-level
baseline they must preserve.
