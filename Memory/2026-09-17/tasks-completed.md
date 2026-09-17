# 2026-09-17 — tasks completed

## Task — Admin analytics learning-curve redesign, "Guided Story" (P1-FE-14)

**Trigger:** user asked to redesign the whole visual and content of
`/admin/analytics` so the learning curve is easy for all users, with a wow
factor / awwwards-level polish. Direction chosen from three browser mockups
(Command Center / Guided Story / Bento): **Guided Story** — insight sentence
first, chart as evidence.

**Spec:** [docs/superpowers/specs/2026-09-17-admin-analytics-redesign-design.md](../../docs/superpowers/specs/2026-09-17-admin-analytics-redesign-design.md)
**Plan:** [docs/superpowers/plans/2026-09-17-admin-analytics-guided-story.md](../../docs/superpowers/plans/2026-09-17-admin-analytics-guided-story.md)

### What was built

The page is now a **five-chapter story** (What happened → The funnel → Where →
What fans took → Who drove it) with a scrollspy chapter rail (left column on
`xl`, pill bar below), URL-synced `?range=7d|30d|90d` pills, and the old §9
screen-11 "not built" stub replaced by a real athlete-performance leaderboard.

- [analytics-story.tsx](../../src/components/analytics-story.tsx) — the one
  client island: rail scrollspy (passive scroll listener), range pills
  (`history.replaceState`, demo param preserved, default `30d` omitted),
  all five chapters. Chapters wrapper is `key={range}` because `CountUp`
  animates once per mount.
- [analytics-insights.ts](../../src/lib/analytics-insights.ts) — every insight
  sentence is **derived in code from the same dataset the chart renders**
  (headline gap, weakest funnel stage, location share, top-offer share,
  best athlete vs roster average). Returns `{pre, hot, post, tone}` fragments.
- [insight-banner.tsx](../../src/components/insight-banner.tsx) + a one-shot
  `sx-ins-glow` text glow in globals.css (reduced-motion off, gated by the
  existing `[data-reveal]` pause).
- [page.tsx](../../src/app/(app)/admin/analytics/page.tsx) — server page keeps
  only demo states + `?range=` seeding.

### Fixture changes (matters to other pages)

- **Replaced** `rewardStats`, `redemptionSeries`, `topOffers` (only this page
  used them) with `analyticsRanges: Record<RangeKey, AnalyticsDataset>` —
  per-range funnel/series/offers/deltas. KPIs derive from the funnel so
  chapters can never disagree.
- **Added** `athleteLeaderboard` (5 rows; 30d base sums = 30d funnel:
  claims 4,300 / redeemed 1,870; scaled per range by `athleteFactor`).
- **Untouched:** `topLocations`, `rewardFunnel`.
- **Alignment fix:** the old `rewardStats` said 1,250 redeemed while
  `rewardFunnel` (and the new rewards desk's header math) says **1,870** —
  the datasets now follow the 1,870 lineage, and top-offer counts were
  rescaled so they can't sum past total redemptions.

### Verified

Dev server driven via curl: all five chapters SSR with correct derived numbers
(30d gap 2,430; 90d gap 6,620; worst stage 43% claim→redeem; 1.4× top athlete),
`?range=abc` falls back to 30d, `?range=90d` seeds the pills, `demo=empty|loading|error`
intact, `tsc`/lint/build clean. **Not yet eyeballed in a real browser:** scrollspy
highlight, smooth-scroll, count-up/glow motion, mobile pill bar — worth a human
pass.

### Task board

Added **P1-FE-14** (row 53, Order 33.995, Status `Code review`, started
2026-09-17) to `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx`;
extended autofilter, Status validation, conditional formatting and all 15
Dashboard formulas from row 197 → 198. Backup in the session scratchpad.
Google Sheet mirror is the end-of-day manual step.

### Follow-up fixes (same day)

- **Scrollspy**: last chapter now wins at the scrollable page bottom; reading
  line moved to mid-viewport (the near-top line gave tail chapters
  sub-wheel-notch windows); side-by-side chapters 3+4 light **as a pair** —
  their section tops tie, so only one could ever win.
- **Layout**: chapter 3/4 cards equalize to the grid row height (`fill` prop
  on `Chapter`, Card `flex-1`, footnotes pinned to card bottoms).

## Task — Admin analytics "Export report", PDF + XLSX (P1-FE-15)

Fourth instance of the export triplet
([spec](../../docs/superpowers/specs/2026-09-17-admin-analytics-export-report-design.md) ·
[plan](../../docs/superpowers/plans/2026-09-17-admin-analytics-export-report.md)):

- [analytics-report-data.ts](../../src/lib/analytics-report-data.ts) —
  `AdminAnalyticsReport` + `buildAnalyticsReport(range)`. **Built client-side**
  (unlike the other three reports) because the range pills are client state —
  you export the range you're looking at; filename carries the range label.
- [analytics-report-pdf.ts](../../src/lib/analytics-report-pdf.ts) /
  [analytics-report-xlsx.ts](../../src/lib/analytics-report-xlsx.ts) — A4 PDF +
  5-sheet workbook (Summary/Funnel/Trend/Reach/Athletes) on the shared kits.
- Derived statistics beyond the screen: unredeemed-claims KPI, per-stage +
  cumulative funnel conversion and drop-off (weakest stage flagged in WARN),
  per-point redemption rate and gap, offer share of **total** redemptions,
  athlete claim→redeem conversion with a roster totals/average benchmark row.
  The five insight sentences print as "Key findings" — same derivations as the
  page, so report and screen can't disagree.
- `export-report.tsx` gained the `admin-analytics` payload kind (that file —
  previously untracked from the export work — is now committed).
- Task board: **P1-FE-15** row 54, Order 33.996, `Code review`; ranges
  extended 198 → 199, 15 Dashboard formulas updated. Backup in scratchpad.
