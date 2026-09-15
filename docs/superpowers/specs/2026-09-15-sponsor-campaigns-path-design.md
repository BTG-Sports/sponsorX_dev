# Sponsor campaigns path — List → Detail → Report

**Date:** 2026-09-15
**Status:** Approved, in implementation
**Surface:** Sponsor portal (§9). Frontend-only, fixtures. Part of the pre-PM
frontend completion pass.

## Problem

The sponsor sidebar's **Campaigns** item links directly to a hardcoded
campaign's ROI report (`/sponsor/campaigns/c1/report`). There is no campaigns
list and no per-campaign detail page — clicking "Campaigns" teleports the
sponsor straight into one campaign's terminal report, skipping the journey the
mockups show (`… → campaign dashboard → rewards → analytics → ROI report`).

The only file under `sponsor/campaigns/` is the report itself. This spec adds
the two screens that sit before it.

## Goal

Complete the path a sponsor walks to reach an ROI report:

```
/sponsor/campaigns            (list of the sponsor's campaigns)
  → /sponsor/campaigns/[id]   (owner-framed campaign dashboard)
    → /sponsor/campaigns/[id]/report   (existing ROI report — unchanged)
```

## Data reconciliation (the key decision)

Two fixture families describe campaigns:

- `sponsorCampaigns` (array, c1–c5) + `sponsorCampaignsX` (keyed by id) — the
  sponsor's **portfolio**. Already drives the sponsor dashboard's portfolio
  list and its "5 campaigns" framing. Summary-level fields: name, pkg,
  athletes, deliverables `[done, total]`, spend, state, views, monogram,
  endsIn, pacing.
- `campaignDetailX` (keyed `"c1" | "c3"`) — **rich** per-campaign data used by
  the admin operations dashboard: campaign summary, `series`, `topContent`,
  `roster`, `notice`.

The list **must** show all 5 (source of truth: `sponsorCampaigns`) or it will
contradict the dashboard and the "5 campaigns" header, reading as a bug. Rich
data exists only for c1 and c3, so the detail page is **tiered**:

- **Rich tier (c1, c3):** full dashboard — pacing meter/gauge, performance
  `AreaChart` on `series`, read-only athlete roster, top content, notice banner
  (c3). Reuses `campaign-ui` helpers (`paceFor`, `paceProjection`, `fmtRate`,
  `PACE_COPY`).
- **Lean tier (c2, c4, c5):** honest lighter detail from the summary data that
  exists — state, pkg, athletes, deliverables progress, spend, views, pacing —
  plus the report CTA. No chart/roster because no fixture backs them. Different
  campaign states legitimately carrying different depth is realistic.

No new fixtures are added.

## Screens

### 1. `/sponsor/campaigns` — campaigns list

`src/app/(app)/sponsor/campaigns/page.tsx`

- Owner-framed header: "Campaigns", "{N} campaigns · pick one to see delivery,
  roster and your ROI report." **No "New campaign" launcher** — Phase 1 is a
  managed marketplace; sponsors submit briefs, BTG staff creates campaigns.
- One card per `sponsorCampaigns` entry: monogram (`sponsorCampaignsX.monogram`),
  name, state badge, "Pacing behind" warn badge when `pacing === "BEHIND"`, a
  deliverables progress meter (`done/total`), and a stat row
  (views · spend · athletes). Card links to `/sponsor/campaigns/[id]`.
- Standard `demoState`: `?demo=loading` → `SkeletonPage`; `?demo=empty` →
  owner-framed `EmptyState` ("No campaigns yet — your dashboard fills in once
  BTG matches your first brief", action → marketplace); `?demo=error` → throw.

### 2. `/sponsor/campaigns/[id]` — campaign detail (owner-framed)

`src/app/(app)/sponsor/campaigns/[id]/page.tsx`

- Resolve base from `sponsorCampaigns.find(id)` + `sponsorCampaignsX[id]`.
  Unknown id → `EmptyState` (not found).
- Header: monogram, name, state badge, "Presented by {sponsor.name} · {endsIn}",
  and a prominent **"View ROI report →"** CTA →
  `/sponsor/campaigns/[id]/report?from=sponsor-campaign`. For `STAFFING`
  (no delivery yet) the CTA is replaced by a muted "Report available once
  delivery begins" line — honest, cheap.
- Rich tier (c1/c3): pacing gauge/meter, notice banner (sponsor-reworded — see
  below), performance `AreaChart`, read-only roster (athlete · delivered/planned
  · views · flag), top content `HBarList`.
- Lean tier (c2/c4/c5): summary stat tiles (views, deliverables, spend,
  athletes, pacing) + the report CTA.
- `demoState` handled as on the list.

**Notice reword.** `campaignDetailX.c3.notice` is written for an operator
("re-match the declined slot or adjust the order"). The sponsor sees status +
reassurance instead: *"One athlete slot needs a replacement and one is
under-delivering — your BTG campaign manager is on it."* No admin action verbs,
no inert other-side CTAs (portal rule).

### 3. Navigation + back-links

- `sponsor/layout.tsx`: **Campaigns** `href` `/sponsor/campaigns/c1/report` →
  `/sponsor/campaigns`.
- `back.ts`: add `sponsor-campaigns` → `{ /sponsor/campaigns, "Back to
  Campaigns" }` (used by the detail page's back-link).
- Report back-link: the report page resolves `from=sponsor-campaign`
  **inline** using its own `id` (`/sponsor/campaigns/${id}`, "Back to campaign")
  since the static `TARGETS` map can't express an id-dynamic target. Existing
  `from=campaign` (admin origin) is untouched.
- List back-link: `resolveBack(from, "sponsor")` → dashboard fallback.

## Out of scope (deferred)

- The ROI report renders c1's `roiReport`/`roiGauge` fixtures regardless of
  `id`; wiring it to real campaign lifecycle state (empty → partial → full) is
  deferred until real campaign state exists. So a c3/c4 report shows c1's
  numbers for now — acceptable for the demo.
- No backend, no new fixtures, no interactive roster actions.

## Components reused

`PortalShell`, `Card`, `Badge`, `Meter`, `SectionHeading`, `Monogram`/`initials`,
`compact`, `AreaChart`/`HBarList`, `RadialGauge`, `EmptyState`/`SkeletonPage`,
`BackLink`/`resolveBack`, `demoState`, `campaign-ui` helpers.
