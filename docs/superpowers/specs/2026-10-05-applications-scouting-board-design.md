# Applications — "Scouting Board" redesign (P1-ART-16)

**Date:** 2026-10-05 · **Raised by:** programme owner · **Scope:** `/admin/applications`
(Athlete Network Manager workspace, P3-FE-02) — visual only. The desk's logic,
its server paging (2026-09-29), its reads and its review actions are unchanged.

Approved direction: **A · Scouting Board**
(`.superpowers/brainstorm/applications/applications-direction.html`).

## Stage and header

Mission Control stage (P1-ART-14), full bleed, fixed-dark in both themes,
**no outlined word**.

**A dashboard header, not a hero** — the owner rejected the first cut's 64px
headline and dek mid-build ("don't make the design like a landing page or a
hero section, this is a dashboard"):

- a compact title row: live dot, `Athlete applications` (text-xl/2xl),
  `POSTGRES · READ {time}` pill;
- four glass KPI tiles (2 → 4 columns): Waiting, Past 48 hours (with a thin
  overdue / waiting share bar; orange when > 0, green at 0), On file, Decided;
- the board straight under them (no section heading).
- All from `GET /applications/summary`. Demo mode: the same tiles from fixture
  counts, with the existing "Demo data" notice; the fixture funnel and
  review-pace figures are dropped.

## Controls

Tabs as stage pills (radio-like `role="tab"` kept). Search / sport /
attention / sort stay the house controls (tokens re-pinned dark by `.sx-ops`).
Filter chips and the house pager (above and below, 12 / 24 / 60) unchanged.

## The board

`ul` grid: 1 col → 2 (sm) → 3 (xl) → 4 (2xl). Each card is the existing row
`<button>` (its accessible name still contains the athlete's name; the
`Minor` badge text stays exact), restyled:

- sport eyebrow; name; region · followers (self-reported);
- `ScoreRing` 64px or `NoScoreRing`;
- chips: Minor (+ guardian pending / verified), ▲ flags, Info requested;
- state badge for decided cards; for in-review cards a 48-hour bar —
  `waitMeter(hours)` → `{ pct, overdue, label }`: fill = min(h/48, 1);
  overdue → orange bar, orange top edge, "Waiting 3d — past 48h".
- Chamfered glass (`.sx-ops-card`), outline spotlight, lift, and an opt-in
  pointer tilt (`data-tilt`, written by `OpsStage`); staggered rise-in.

## The drawer — "scouting report"

Same component, same text, same buttons and labels (the e2e loop specs
depend on them). Restyle only: the portaled dialog root carries `.sx-ops`
(dark tokens in both themes); panel dark glass with a glowing left edge; score
ring 96px; factor bars glowing gradients that grow in; safeguards as status-
light rows; Approve blue gradient chamfer, Request info outline, Reject red
outline → solid on "Confirm reject — final".

## Build

- `components/applications-desk.tsx`: markup/classes only.
- `app/(app)/admin/applications/(queue)/page.tsx` (+ `loading.tsx`, dark).
- `components/scout-stage.tsx`: `ScoutHeader`, `KpiTile`.
- `components/ops-fx.tsx`: `OpsStage` writes `--rx` / `--ry` on a hovered
  `[data-spot][data-tilt]` card; CSS `.sx-ops-card[data-tilt]`.
- `lib/applications-ui.ts`: `waitMeter` (unit-tested).

## Verification

Unit tests for `waitMeter`; frontend tests and lint; build in a detached
worktree (then the rimraf check); browser walk as BTG_ADMIN — cards, drawer,
start review, dark / light / 390, no overflow; the P3 e2e loop if its fixtures run.
