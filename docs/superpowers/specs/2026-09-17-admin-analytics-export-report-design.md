# Admin Analytics "Export report" — PDF + XLSX — Design

**Date:** 2026-09-17
**Page:** `/admin/analytics` (guided story, spec 2026-09-17)
**Pattern:** fourth instance of the established export triplet
(`report-data` model → `report-pdf` + `report-xlsx` renderers → shared
`ExportReport` dropdown island). No new dependencies — jspdf/jspdf-autotable
and exceljs are already in `package.json`, dynamic-imported on click.

## The one structural difference from the other three reports

The other export pages build their report model server-side because their data
is static. This page has a client-side **range switcher** (`7d/30d/90d`), so:

- The **Export report button renders inside `analytics-story.tsx`**, in the
  toolbar row next to the range pills (right-aligned, before the pills).
- The payload is built at render time from the **currently selected range**:
  `buildAnalyticsReport(range)` — the user exports what they are looking at.
- The filename carries the range: fileStem
  `SponsorX-Analytics-Report-<Range-Label>` (spaces → dashes), e.g.
  `SponsorX-Analytics-Report-Last-30-Days`.

## Report model — `src/lib/analytics-report-data.ts`

`AdminAnalyticsReport`, serializable, built from `analyticsRanges[range]`,
`athleteLeaderboard` (scaled by the range's `athleteFactor`, same as the
page), `topLocations`, and the insight functions in
`src/lib/analytics-insights.ts` — the same derivations the page renders, so
the report can never disagree with the screen.

Sections:

| Section | Content | Derived statistics added for the report |
|---|---|---|
| `meta` | title "Fan & Reward Analytics", period label, presentedBy "BTG Sports Group", fileStem, demo-dataset footnote | — |
| `kpis` | scans, claims, redemptions (POSTGRES), revenue attributed (ATTRIBUTED), each with delta | **unredeemed claims** (claims − redemptions) as a fifth, derived KPI |
| `findings` | the five insight sentences (headline, funnel, location, offer, athlete) flattened to plain strings (`pre + hot + post`) | — (already derived) |
| `funnel` | stage, count, per-stage definition blurb | **stage→stage conversion, cumulative conversion from scan, absolute drop-off**, overall scan→redeem rate, weakest-stage flag |
| `trend` | series points (label, claims, redemptions) | **redemption rate per point** (redemptions/claims), **gap per point** (claims − redemptions) |
| `locations` | place, share-of-scans % | — (share is the metric) |
| `offers` | offer, redemptions | **share of total redemptions** (count / funnel redeem total) |
| `athletes` | name, sport, data-quality source, views, engagement %, claims, redemptions, score | **claim→redeem conversion per row**, plus a **roster totals row and roster-average conversion** benchmark |
| `methodology` | §22 provenance statements: scan/landing/claim/redeem are §16 event rows (Postgres); revenue is ATTRIBUTED via merchant-validated coupons, never payment-network data; views/engagement carry per-row source labels (VERIFIED_API / SELF_REPORTED / ESTIMATED); locations resolved in the worker, fan IP never stored; demo-dataset note | — |

All money stays in cents in the model (`revenueCents`), matching
`CampaignRoiReport`; renderers format.

## PDF — `src/lib/analytics-report-pdf.ts`

A4 portrait on `report-pdf-kit` (same header band, heading/table/note/footers
helpers and palette as the campaign ROI PDF):

1. Header band — title, period, presented by
2. KPI row rendered as a 5-column table (label / value / delta), unredeemed
   claims in WARN color
3. "Key findings" — the five insight sentences as paragraphs
4. Funnel table (stage, definition, count, stage conv %, from-scan %,
   drop-off) + overall-rate note; weakest stage row tinted WARN
5. Trend table (period, claims, redemptions, rate, unredeemed gap)
6. Reach — locations table then offers table (with share column)
7. Athlete performance table + totals/average row; per-row quality label
8. Methodology paragraphs; standard footers with the demo footnote

## XLSX — `src/lib/analytics-report-xlsx.ts`

Five sheets on `report-xlsx-kit` (`titleBlock`, `sectionTitle`,
`styleHeader`, number formats):

1. **Summary** — title block, KPI table (incl. unredeemed claims), key
   findings list, methodology notes
2. **Funnel** — stage rows with conversion/drop-off columns (FMT_INT,
   FMT_PCT), overall rate row
3. **Trend** — series with rate (FMT_PCT) and gap columns
4. **Reach** — locations table + offers table with share column
5. **Athletes** — leaderboard with conversion column, totals + average row,
   data-quality column as text labels

## Wiring

- `export-report.tsx`: add
  `{ kind: "admin-analytics"; report: AdminAnalyticsReport }` to
  `ExportPayload` and the dynamic-import arm.
- `analytics-story.tsx`: render `<ExportReport payload={{ kind:
  "admin-analytics", report: buildAnalyticsReport(range) }} />` in the
  toolbar row (model rebuild per render is cheap — pure functions over
  fixtures).
- Demo states: the button lives inside the island, which only renders on the
  normal path — loading/empty/error need no changes.

## Out of scope

- No server/worker rendering (P7-BE-06 takes the model over later — same
  contract as the other three reports).
- No chart images inside the PDF (matches existing reports: tables + notes).
- No changes to the other three report models or renderers.

## Acceptance criteria

1. Export button appears beside the range pills; dropdown offers PDF and
   Excel; both download with the range-labelled filename.
2. Switching range changes the exported numbers, period label and filename.
3. Every KPI/table in both formats carries its provenance/data-quality label;
   attributed revenue is never summed with any other value.
4. Funnel conversions, trend rates, offer shares and athlete conversion
   columns are computed from the same dataset the page renders (spot-check:
   30d → 43% claim→redeem, unredeemed 2,430, top offer share 44%).
5. jspdf/exceljs are not in the analytics page's initial JS (dynamic import
   only).
6. `npx tsc --noEmit`, `npm run lint`, `npm run build` pass.
