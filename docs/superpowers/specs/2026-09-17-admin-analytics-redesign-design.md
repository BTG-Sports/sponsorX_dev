# Admin Analytics Redesign — "Guided Story" — Design

**Date:** 2026-09-17
**Page:** `src/app/(app)/admin/analytics/page.tsx`
**Goal:** Redesign the whole page (visuals + content) so the learning curve is
easy for every user, with awwwards-level polish. Chosen direction (from three
mocked options): **Guided Story** — insight first, chart as evidence.

## Context

The current page is the mockup's screen 11 (fan/reward analytics): four stat
cards, one area chart, top locations, top offers — and a yellow warning stub
for §9's screen 11 (athlete performance dashboard). The redesign unifies both
halves into one page with a single mental model, replacing the stub with a
real (fixture-driven) athlete-performance chapter.

## Concept

The page is a **five-chapter story**, read top to bottom. A sticky chapter
rail tracks scroll position via scrollspy, so a first-time user always knows
where they are and what to read next. Every chapter leads with a
plain-English **insight sentence**; the visualization below it is the
evidence. Insight sentences are **computed in code from the same data the
charts render** — never hand-written prose that can drift.

### Chapters

| # | Chapter | Content | Evidence component |
|---|---------|---------|--------------------|
| 1 | What happened | Insight banner (headline takeaway) + 4 KPI tiles with sparklines and deltas + claims-vs-redemptions area chart with "the gap = claimed, never used" annotation | `CountUp`, `Sparkline`, `AreaChart` |
| 2 | The funnel | Four-stage funnel (scan → landing → claim → redeem, §16 event rows) with stage-to-stage conversion %, weakest stage highlighted in accent orange, microcopy defining each stage | `FunnelSteps` (extended if needed) |
| 3 | Where | Top locations ranked bars + share-of-scans insight; keep the "resolved in the worker, fan IP never stored" note | `HBarList` |
| 4 | What fans took | Top offers ranked by **redemptions** (not claims) + concentration insight | `BarStrip` / `HBarList` |
| 5 | Who drove it | Athlete performance leaderboard (§9 screen 11): avatar, name, views, engagement, claims, redemptions, `ScoreRing`; §22 data-quality chips (`verified` = API-sourced, `estimated` = modeled); footnote naming §22's six analytics layers | `ScoreRing`, table/grid |

Chapters 3 and 4 sit side-by-side on `xl`, stacked below that.

## Layout & navigation

- **Header:** title, one-line "how to read this page" subtitle, range pills
  `7d / 30d / 90d` (URL-synced `?range=`, default `30d`).
- **Chapter rail:** sticky left rail on `xl+` (numbered chapters, active one
  highlighted with primary-blue border, scrollspy via IntersectionObserver);
  on smaller screens it collapses to a horizontal pill bar pinned under the
  header. Clicking a chapter smooth-scrolls to it.
- **Range pills:** switching range swaps to per-range fixture variants
  (scaled series + stats) so the interaction is real; insights recompute from
  whichever variant is active. Replaces today's unwired "Last 30 Days"
  button.

## Data & new code

- **`src/lib/analytics-insights.ts`** — pure functions that derive each
  chapter's insight sentence from the fixture data (e.g. unredeemed-claims
  count, weakest funnel stage, top-location share, top-offer concentration,
  best athlete vs roster average). Returns structured
  `{ text, emphasis, tone }` parts so the UI can color the key phrase.
- **Fixtures (`src/lib/fixtures.ts`)** — add `athleteLeaderboard` (5–6 rows
  with views/engagement/claims/redemptions/score/quality) and one
  **per-range dataset** (7d/30d/90d) that carries the funnel stage counts,
  the trend series, and offer counts. Chapter 1's scans/claims/redemptions
  KPIs are **derived from the funnel counts** of the active dataset, so
  chapters 1 and 2 can never show different numbers for the same metric.
  Locations stay share-based (percentages) across ranges. Reuse the existing
  `topLocations`; `rewardFunnel`, `rewardStats`, `redemptionSeries` and
  `topOffers` fold into the per-range datasets.
- **`src/components/analytics-story.tsx`** — the one client island:
  chapter rail scrollspy + range pills. Everything else stays
  server-rendered.
- **`src/components/insight-banner.tsx`** — insight sentence presentation
  (chapter variant + hero variant for chapter 1).

## Provenance & honesty rules (non-negotiable)

- Every stat keeps its `SourceLabel` / `MiniChip` (POSTGRES, ZOHO, platform
  APIs) — per the "stats must be retrievable" project rule.
- The insight banner carries a "computed from the numbers below" hint plus
  the source chip.
- Athlete rows carry §22 data-quality chips; no unlabeled numbers anywhere.

## Motion (the wow layer)

- Chapters fade-and-rise on scroll (existing `Reveal`).
- Headline numbers count up (existing `CountUp`).
- Funnel bars grow with a stagger on first reveal.
- The insight banner's emphasized phrase gets a soft gradient shimmer.
- All motion is disabled under `prefers-reduced-motion` (follow `Reveal`'s
  existing pattern).

## States

Keep the `demoState` contract: `loading` → `SkeletonPage`; `error` → throw;
`empty` → heading + `EmptyState` (unchanged copy). No per-chapter demo
states — the whole page switches, as today.

## Out of scope

- No real data wiring (page stays fixture-driven, like the rest of the app).
- No drill-down subpages; chapter links may point at existing pages
  (e.g. per-campaign roster) but no new routes.
- No changes to other portals' analytics pages.
- No new dependencies.

## Acceptance criteria

1. The athlete-performance stub is gone; chapter 5 renders a real
   leaderboard with §22 quality chips.
2. Chapter rail highlights the correct chapter while scrolling and
   smooth-scrolls on click; collapses to a pill bar below `xl`.
3. `?range=` switches data, labels and insights; back/forward works.
4. Every insight sentence's numbers match the chart below it (same source
   data, derived in `analytics-insights.ts`).
5. Every stat shows a provenance chip.
6. Motion present, and fully disabled under `prefers-reduced-motion`.
7. Loading / empty / error demo states still work.
8. `npm run lint` and `npm run build` pass.
