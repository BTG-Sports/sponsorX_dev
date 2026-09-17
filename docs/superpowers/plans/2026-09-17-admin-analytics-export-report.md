# Admin Analytics Export Report (PDF + XLSX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Export report" (print-ready PDF + pivotable XLSX) to `/admin/analytics`, exporting the currently selected range, as the fourth instance of the established report triplet.

**Architecture:** `analytics-report-data.ts` builds a serializable `AdminAnalyticsReport` from the same fixtures + insight functions the page renders (so report and screen can never disagree); `analytics-report-pdf.ts` / `analytics-report-xlsx.ts` render it on the shared kits; the shared `ExportReport` island gains an `admin-analytics` payload kind and is mounted inside `analytics-story.tsx` beside the range pills so the export follows the active range.

**Tech Stack:** jspdf + jspdf-autotable (`report-pdf-kit.ts`), exceljs (`report-xlsx-kit.ts`) — already installed, dynamic-imported on click. **No test runner exists**; verification is `npx tsc --noEmit` + `npm run lint` + `npm run build` per task, a `node` math spot-check for the builder, and a live download check at the end.

**Spec:** `docs/superpowers/specs/2026-09-17-admin-analytics-export-report-design.md`

**Kit contracts (verified against source):**
- `report-pdf-kit`: `headerBand(doc,{title,subtitle,sub2})→y` · `heading(doc,y,text,need?)→y` · `table(doc,opts)→finalY` · `note(doc,y,text)→y` · `paragraphs(doc,y,lines,size?)→y` · `footers(doc,left,footnote)` · `money(cents)` `num(n)` `pct(fraction,digits?)` · colors `INK MUTED WARN`
- `report-xlsx-kit`: `titleBlock(ws,title,subLines,mergeCols)` · `sectionTitle(ws,text)` · `styleHeader(row)` · `FMT_INT FMT_MONEY FMT_PCT FMT_PCT0` · `MUTED WARN`
- `ExportReport` island downloads to `${payload.report.meta.fileStem}.${format}` — the model MUST have `meta.fileStem`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/analytics-report-data.ts` | Create | `AdminAnalyticsReport` type + `buildAnalyticsReport(range)` — all derived statistics computed here, renderers only format |
| `src/lib/analytics-report-pdf.ts` | Create | jspdf renderer (A4, kit vocabulary, mirrors chapter order) |
| `src/lib/analytics-report-xlsx.ts` | Create | exceljs renderer — 5 sheets: Summary, Funnel, Trend, Reach, Athletes |
| `src/components/export-report.tsx` | Modify (~lines 4-6, 20-23, 36-63) | Add `admin-analytics` payload kind + dynamic-import arm |
| `src/components/analytics-story.tsx` | Modify (toolbar row) | Mount `<ExportReport>` beside the range pills, payload rebuilt from active range |

---

### Task 1: Report model + builder

**Files:**
- Create: `src/lib/analytics-report-data.ts`

- [ ] **Step 1: Write the module**

```ts
import {
  analyticsRanges,
  athleteLeaderboard,
  topLocations,
  type RangeKey,
} from "@/lib/fixtures";
import {
  athleteInsight,
  funnelInsight,
  headlineInsight,
  locationInsight,
  offerInsight,
  type Insight,
} from "@/lib/analytics-insights";

/* --------------------------------------------------------------------------
   AdminAnalyticsReport — the serializable model behind "Export report" on
   the admin analytics guided story. Same contract as SponsorReport /
   CampaignRoiReport / AthleteEarningsReport: built from the exact fixtures
   and insight derivations the page renders (so the report can never
   disagree with the screen), printed with every §22 provenance label
   intact. Built CLIENT-side (unlike the other three) because the range
   pills are client state — you export the range you are looking at.
   -------------------------------------------------------------------------- */

export type AdminAnalyticsReport = {
  meta: {
    title: string;
    period: string;
    presentedBy: string;
    /** Download filename without extension. */
    fileStem: string;
    footnote: string;
  };
  kpis: {
    label: string;
    value: number;
    /** count → integer; money → value is cents. */
    kind: "count" | "money";
    /** Display delta vs previous period, e.g. "+18.2%"; null for derived rows. */
    delta: string | null;
    source: string;
  }[];
  /** The page's five computed insight sentences, flattened. */
  findings: string[];
  funnel: {
    stages: {
      stage: string;
      blurb: string;
      count: number;
      /** Conversion from the previous stage (fraction); null for Scan. */
      fromPrev: number | null;
      /** Cumulative conversion from Scan (fraction). */
      ofScans: number;
      /** Fans lost vs the previous stage; null for Scan. */
      dropOff: number | null;
    }[];
    /** Scan → Redeem (fraction). */
    overallRate: number;
    /** Stage with the lowest step conversion. */
    weakestStage: string;
  };
  trend: {
    label: string;
    claims: number;
    redemptions: number;
    /** redemptions / claims at this point (fraction). */
    rate: number;
    /** claims − redemptions at this point. */
    gap: number;
  }[];
  locations: { place: string; share: number }[]; // fraction of scans
  offers: {
    offer: string;
    redemptions: number;
    /** Fraction of the funnel's TOTAL redemptions (not of the listed top offers). */
    share: number;
  }[];
  athletes: {
    rows: {
      name: string;
      sport: string;
      /** §22 data-quality label for views/engagement. */
      quality: string;
      views: number;
      engagementPct: number;
      claims: number;
      redemptions: number;
      /** redemptions / claims (fraction). */
      conversion: number;
      score: number;
    }[];
    totals: {
      views: number;
      claims: number;
      redemptions: number;
      /** Roster-average conversion (fraction). */
      conversion: number;
    };
  };
  methodology: string[];
};

const QUALITY: Record<string, string> = {
  VERIFIED_API: "verified",
  SELF_REPORTED: "self-reported",
  ESTIMATED: "estimated",
};

const flat = (i: Insight) => `${i.pre}${i.hot}${i.post}`;

export function buildAnalyticsReport(range: RangeKey): AdminAnalyticsReport {
  const d = analyticsRanges[range];
  const scan = d.funnel[0].value;
  const claims = d.funnel[2].value;
  const redeemed = d.funnel[3].value;

  const athletes = athleteLeaderboard.map((a) => ({
    ...a,
    views: Math.round(a.views * d.athleteFactor),
    claims: Math.round(a.claims * d.athleteFactor),
    redeemed: Math.round(a.redeemed * d.athleteFactor),
  }));
  const totViews = athletes.reduce((s, a) => s + a.views, 0);
  const totClaims = athletes.reduce((s, a) => s + a.claims, 0);
  const totRedeemed = athletes.reduce((s, a) => s + a.redeemed, 0);

  let weakest = 1;
  for (let i = 2; i < d.funnel.length; i++) {
    const rate = d.funnel[i].value / d.funnel[i - 1].value;
    if (rate < d.funnel[weakest].value / d.funnel[weakest - 1].value)
      weakest = i;
  }

  return {
    meta: {
      title: "Fan & Reward Analytics",
      period: d.label,
      presentedBy: "BTG Sports Group",
      fileStem: `SponsorX-Analytics-Report-${d.label.replace(/\s+/g, "-")}`,
      footnote:
        "Demo dataset — figures shaped to §16 RewardEvent rows, platform metric APIs and Zoho Books, provenance-labelled per §22.",
    },
    kpis: [
      { label: "QR scans", value: scan, kind: "count", delta: `+${d.deltas.scans}`, source: "POSTGRES · §16 scan events" },
      { label: "Offers claimed", value: claims, kind: "count", delta: `+${d.deltas.claims}`, source: "POSTGRES · §16 claim events" },
      { label: "Rewards redeemed", value: redeemed, kind: "count", delta: `+${d.deltas.redeemed}`, source: "POSTGRES · §16 redeem events" },
      { label: "Unredeemed claims", value: claims - redeemed, kind: "count", delta: null, source: "Derived — claims − redemptions" },
      { label: "Revenue attributed", value: d.revenue * 100, kind: "money", delta: `+${d.deltas.revenue}`, source: "ATTRIBUTED · merchant-validated coupons (§16)" },
    ],
    findings: [
      headlineInsight(d),
      funnelInsight(d),
      locationInsight(topLocations),
      offerInsight(d),
      athleteInsight(athletes),
    ].map(flat),
    funnel: {
      stages: d.funnel.map((s, i) => ({
        stage: s.stage,
        blurb: s.blurb,
        count: s.value,
        fromPrev: i === 0 ? null : s.value / d.funnel[i - 1].value,
        ofScans: s.value / scan,
        dropOff: i === 0 ? null : d.funnel[i - 1].value - s.value,
      })),
      overallRate: redeemed / scan,
      weakestStage: d.funnel[weakest].stage,
    },
    trend: d.series.map((p) => ({
      label: p.label,
      claims: p.b,
      redemptions: p.a,
      rate: p.a / p.b,
      gap: p.b - p.a,
    })),
    locations: topLocations.map((l) => ({ place: l.place, share: l.pct / 100 })),
    offers: d.offers.map((o) => ({
      offer: o.offer,
      redemptions: o.count,
      share: o.count / redeemed,
    })),
    athletes: {
      rows: athletes.map((a) => ({
        name: a.name,
        sport: a.sport,
        quality: QUALITY[a.source] ?? a.source,
        views: a.views,
        engagementPct: a.engagement,
        claims: a.claims,
        redemptions: a.redeemed,
        conversion: a.redeemed / a.claims,
        score: a.score,
      })),
      totals: {
        views: totViews,
        claims: totClaims,
        redemptions: totRedeemed,
        conversion: totRedeemed / totClaims,
      },
    },
    methodology: [
      "Scan, landing, claim and redeem are separate §16 RewardEvent rows in Postgres — each funnel stage is a count of real events, never an estimate.",
      "Revenue is ATTRIBUTED through merchant-validated coupon redemptions, never payment-network data (§16); it is reported beside the counts and never summed with any other value.",
      "Athlete views and engagement come from platform APIs and carry a per-row data-quality label (verified / self-reported / estimated) per §22; claims and redemptions per athlete are our own event rows.",
      "Locations are resolved in the background worker at city level; the fan's IP address is never stored.",
      "Deltas compare against the previous period of the same length.",
      "Insight sentences are computed from the same dataset the tables print — they are derivations, not editorial copy.",
    ],
  };
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 3: Spot-check the derived statistics (30d)** — no test runner; verify the acceptance-criteria numbers by math:

```bash
node -e "
console.log('unredeemed:', 4300-1870);                    // 2430
console.log('claim->redeem:', (1870/4300*100).toFixed(1)); // 43.5
console.log('overall:', (1870/8200*100).toFixed(1));       // 22.8
console.log('top offer share:', Math.round(820/1870*100)); // 44
console.log('roster conv:', (1870/4300).toFixed(3));       // 0.435 (athlete sums = funnel)
"
```

Expected output: `2430`, `43.5`, `22.8`, `44`, `0.435`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/analytics-report-data.ts
git commit -m "feat(analytics): AdminAnalyticsReport model + builder for export"
```

---

### Task 2: PDF renderer

**Files:**
- Create: `src/lib/analytics-report-pdf.ts`

- [ ] **Step 1: Write the renderer**

```ts
import { jsPDF } from "jspdf";
import type { AdminAnalyticsReport } from "@/lib/analytics-report-data";
import {
  MUTED,
  WARN,
  footers,
  headerBand,
  heading,
  money,
  note,
  num,
  paragraphs,
  pct,
  table,
} from "@/lib/report-pdf-kit";

/* --------------------------------------------------------------------------
   PDF renderer for AdminAnalyticsReport. Dynamic-imported by the export
   island; jspdf stays out of the page bundle. Section order mirrors the
   guided story's chapters: what happened → funnel → trend → reach →
   athletes → methodology.
   -------------------------------------------------------------------------- */

export function generateAnalyticsReportPdf(
  report: AdminAnalyticsReport,
): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  let y = headerBand(doc, {
    title: report.meta.title,
    subtitle: `Presented by ${report.meta.presentedBy}`,
    sub2: report.meta.period,
  });

  /* --------------------------------------------------------- what happened */
  y = heading(doc, y, "What happened");
  y = table(doc, {
    startY: y,
    head: [["Metric", "Value", "vs prev. period", "Source / provenance"]],
    body: report.kpis.map((k) => [
      k.label,
      k.kind === "money" ? money(k.value) : num(k.value),
      k.delta ?? "—",
      k.source,
    ]),
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 110 },
      1: { fontStyle: "bold", cellWidth: 70, halign: "right" },
      2: { cellWidth: 76, halign: "right" },
      3: { textColor: MUTED },
    },
    didParseCell: (data) => {
      if (
        data.section === "body" &&
        report.kpis[data.row.index]?.label === "Unredeemed claims"
      ) {
        data.cell.styles.textColor = WARN;
      }
    },
  });

  y = heading(doc, y + 12, "Key findings", 130);
  y = paragraphs(doc, y, report.findings, 8.5);

  /* ---------------------------------------------------------------- funnel */
  y = heading(doc, y + 8, "The funnel — scan to redemption", 150);
  y = table(doc, {
    startY: y,
    head: [["Stage", "Definition", "Fans", "Step conv.", "From scan", "Drop-off"]],
    body: report.funnel.stages.map((s) => [
      s.stage,
      s.blurb,
      num(s.count),
      s.fromPrev === null ? "—" : pct(s.fromPrev, 0),
      pct(s.ofScans, 0),
      s.dropOff === null ? "—" : `−${num(s.dropOff)}`,
    ]),
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 52 },
      1: { textColor: MUTED },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    didParseCell: (data) => {
      if (
        data.section === "body" &&
        report.funnel.stages[data.row.index]?.stage ===
          report.funnel.weakestStage
      ) {
        data.cell.styles.textColor = WARN;
      }
    },
  });
  y = note(
    doc,
    y,
    `${pct(report.funnel.overallRate, 1)} of scans end in a redemption. Weakest step: ${report.funnel.weakestStage} (flagged).`,
  );

  /* ----------------------------------------------------------------- trend */
  y = heading(doc, y + 12, "Trend — cumulative claims vs redemptions", 150);
  y = table(doc, {
    startY: y,
    head: [["Period", "Claims", "Redemptions", "Redemption rate", "Unredeemed gap"]],
    body: report.trend.map((p) => [
      p.label,
      num(p.claims),
      num(p.redemptions),
      pct(p.rate, 1),
      num(p.gap),
    ]),
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });
  y = note(doc, y, "The gap column is claimed-but-unused reward — the number the headline tracks.");

  /* ----------------------------------------------------------------- reach */
  y = heading(doc, y + 12, "Where — share of scans", 140);
  y = table(doc, {
    startY: y,
    head: [["Location", "Share of scans"]],
    body: report.locations.map((l) => [l.place, pct(l.share, 0)]),
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" } },
  });
  y = note(doc, y, "Resolved in the worker at city level — the fan IP is never stored.");

  y = heading(doc, y + 12, "What fans took — top offers", 140);
  y = table(doc, {
    startY: y,
    head: [["Offer", "Redemptions", "Share of all redemptions"]],
    body: report.offers.map((o) => [
      o.offer,
      num(o.redemptions),
      pct(o.share, 0),
    ]),
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" }, 2: { halign: "right" } },
  });
  y = note(doc, y, "Ranked by redemptions, not claims — what fans actually used.");

  /* -------------------------------------------------------------- athletes */
  y = heading(doc, y + 12, "Who drove it — athlete performance", 170);
  y = table(doc, {
    startY: y,
    head: [["Athlete", "Data quality", "Views", "Eng.", "Claims", "Redeems", "Claim→redeem", "Score"]],
    body: [
      ...report.athletes.rows.map((a) => [
        `${a.name}\n${a.sport}`,
        a.quality,
        num(a.views),
        `${a.engagementPct}%`,
        num(a.claims),
        num(a.redemptions),
        pct(a.conversion, 0),
        String(a.score),
      ]),
      [
        "Roster total / average",
        "—",
        num(report.athletes.totals.views),
        "—",
        num(report.athletes.totals.claims),
        num(report.athletes.totals.redemptions),
        pct(report.athletes.totals.conversion, 0),
        "—",
      ],
    ],
    columnStyles: {
      0: { fontStyle: "bold" },
      1: { textColor: MUTED },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === report.athletes.rows.length) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  y = note(
    doc,
    y,
    "Views & engagement from platform APIs with per-row quality labels (§22); claims & redemptions are our §16 event rows; Score is the §14 Content Value Score.",
  );

  /* ------------------------------------------------------------ methodology */
  y = heading(doc, y + 8, "Methodology", 140);
  paragraphs(doc, y, report.methodology, 7.5);

  footers(
    doc,
    `SponsorX · Fan & Reward Analytics · ${report.meta.period} · Prepared for ${report.meta.presentedBy} · Confidential`,
    report.meta.footnote,
  );

  return doc.output("blob");
}
```

- [ ] **Step 2: Type-check + lint** — `npx tsc --noEmit && npm run lint`. Expected: clean (the pre-existing `t/[code]` warning only). Note: `didParseCell` is a valid `UserOptions` member of jspdf-autotable; if tsc complains about the callback param type, import `type CellHookData` from `jspdf-autotable` and type it explicitly.

- [ ] **Step 3: Commit**

```bash
git add src/lib/analytics-report-pdf.ts
git commit -m "feat(analytics): PDF renderer for the analytics export report"
```

---

### Task 3: XLSX renderer

**Files:**
- Create: `src/lib/analytics-report-xlsx.ts`

- [ ] **Step 1: Write the renderer**

```ts
import ExcelJS from "exceljs";
import type { AdminAnalyticsReport } from "@/lib/analytics-report-data";
import {
  FMT_INT,
  FMT_MONEY,
  FMT_PCT,
  FMT_PCT0,
  MUTED,
  WARN,
  sectionTitle,
  styleHeader,
  titleBlock,
} from "@/lib/report-xlsx-kit";

/* --------------------------------------------------------------------------
   XLSX renderer for AdminAnalyticsReport — five sheets: Summary, Funnel,
   Trend, Reach, Athletes. Numbers land as real numbers with Excel formats
   (shares/conversions as fractions with % formats) so the client can pivot
   and re-total.
   -------------------------------------------------------------------------- */

export async function generateAnalyticsReportXlsx(
  report: AdminAnalyticsReport,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SponsorX";
  wb.created = new Date();

  /* ---------------------------------------------------------------- Summary */
  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 26 }, { width: 14 }, { width: 16 }, { width: 58 }];

  titleBlock(
    summary,
    `SponsorX — ${report.meta.title}`,
    [`Presented by ${report.meta.presentedBy}`, report.meta.period],
    4,
  );

  sectionTitle(summary, "What happened");
  styleHeader(summary.addRow(["Metric", "Value", "vs prev. period", "Source / provenance"]));
  for (const k of report.kpis) {
    const row = summary.addRow([
      k.label,
      k.kind === "money" ? k.value / 100 : k.value,
      k.delta ?? "—",
      k.source,
    ]);
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(2).font = { bold: true, size: 10 };
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(2).numFmt = k.kind === "money" ? FMT_MONEY : FMT_INT;
    row.getCell(3).alignment = { horizontal: "right" };
    row.getCell(4).font = { size: 9, color: { argb: MUTED } };
    if (k.label === "Unredeemed claims") {
      row.getCell(1).font = { bold: true, size: 10, color: { argb: WARN } };
      row.getCell(2).font = { bold: true, size: 10, color: { argb: WARN } };
    }
  }
  summary.addRow([]);

  sectionTitle(summary, "Key findings");
  for (const f of report.findings) {
    summary.addRow([`•  ${f}`]).font = { size: 10 };
  }
  summary.addRow([]);

  sectionTitle(summary, "Methodology");
  for (const text of report.methodology) {
    summary.addRow([`•  ${text}`]).font = { size: 9, color: { argb: MUTED } };
  }
  summary.addRow([]);
  summary.addRow([report.meta.footnote]).font = {
    size: 8,
    italic: true,
    color: { argb: MUTED },
  };

  /* ----------------------------------------------------------------- Funnel */
  const funnel = wb.addWorksheet("Funnel");
  funnel.columns = [
    { width: 12 },
    { width: 26 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
  ];
  styleHeader(
    funnel.addRow(["Stage", "Definition", "Fans", "Step conv.", "From scan", "Drop-off"]),
  );
  funnel.views = [{ state: "frozen", ySplit: 1 }];
  for (const s of report.funnel.stages) {
    const row = funnel.addRow([
      s.stage,
      s.blurb,
      s.count,
      s.fromPrev === null ? "—" : s.fromPrev,
      s.ofScans,
      s.dropOff === null ? "—" : -s.dropOff,
    ]);
    row.getCell(1).font =
      s.stage === report.funnel.weakestStage
        ? { bold: true, size: 10, color: { argb: WARN } }
        : { bold: true, size: 10 };
    row.getCell(2).font = { size: 9, color: { argb: MUTED } };
    row.getCell(3).numFmt = FMT_INT;
    if (s.fromPrev !== null) row.getCell(4).numFmt = FMT_PCT0;
    row.getCell(4).alignment = { horizontal: "right" };
    row.getCell(5).numFmt = FMT_PCT0;
    if (s.dropOff !== null) row.getCell(6).numFmt = FMT_INT;
    row.getCell(6).alignment = { horizontal: "right" };
  }
  funnel.addRow([]);
  funnel.addRow([
    `Overall: ${(report.funnel.overallRate * 100).toFixed(1)}% of scans end in a redemption. Weakest step: ${report.funnel.weakestStage}.`,
  ]).font = { size: 9, color: { argb: MUTED } };

  /* ------------------------------------------------------------------ Trend */
  const trend = wb.addWorksheet("Trend");
  trend.columns = [
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
  ];
  styleHeader(
    trend.addRow(["Period", "Claims", "Redemptions", "Redemption rate", "Unredeemed gap"]),
  );
  trend.views = [{ state: "frozen", ySplit: 1 }];
  for (const p of report.trend) {
    const row = trend.addRow([p.label, p.claims, p.redemptions, p.rate, p.gap]);
    row.getCell(2).numFmt = FMT_INT;
    row.getCell(3).numFmt = FMT_INT;
    row.getCell(4).numFmt = FMT_PCT;
    row.getCell(5).numFmt = FMT_INT;
  }
  trend.addRow([]);
  trend.addRow([
    "Cumulative counts; the gap column is claimed-but-unused reward.",
  ]).font = { size: 9, color: { argb: MUTED } };

  /* ------------------------------------------------------------------ Reach */
  const reach = wb.addWorksheet("Reach");
  reach.columns = [{ width: 26 }, { width: 14 }, { width: 22 }];

  sectionTitle(reach, "Locations — share of scans");
  styleHeader(reach.addRow(["Location", "Share of scans"]));
  for (const l of report.locations) {
    const row = reach.addRow([l.place, l.share]);
    row.getCell(2).numFmt = FMT_PCT0;
    row.getCell(2).alignment = { horizontal: "right" };
  }
  reach.addRow(["Resolved in the worker — the fan IP is never stored."]).font = {
    size: 9,
    color: { argb: MUTED },
  };
  reach.addRow([]);

  sectionTitle(reach, "Top offers — by redemptions");
  styleHeader(reach.addRow(["Offer", "Redemptions", "Share of all redemptions"]));
  for (const o of report.offers) {
    const row = reach.addRow([o.offer, o.redemptions, o.share]);
    row.getCell(2).numFmt = FMT_INT;
    row.getCell(3).numFmt = FMT_PCT0;
    row.getCell(3).alignment = { horizontal: "right" };
  }
  reach.addRow(["Ranked by redemptions, not claims — what fans actually used."]).font =
    { size: 9, color: { argb: MUTED } };

  /* --------------------------------------------------------------- Athletes */
  const ath = wb.addWorksheet("Athletes");
  ath.columns = [
    { width: 22 },
    { width: 24 },
    { width: 14 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 14 },
    { width: 8 },
  ];
  styleHeader(
    ath.addRow([
      "Athlete",
      "Sport / school",
      "Data quality",
      "Views",
      "Eng. %",
      "Claims",
      "Redemptions",
      "Claim→redeem",
      "Score",
    ]),
  );
  ath.views = [{ state: "frozen", ySplit: 1 }];
  for (const a of report.athletes.rows) {
    const row = ath.addRow([
      a.name,
      a.sport,
      a.quality,
      a.views,
      a.engagementPct / 100,
      a.claims,
      a.redemptions,
      a.conversion,
      a.score,
    ]);
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(3).font = { size: 9, color: { argb: MUTED } };
    row.getCell(4).numFmt = FMT_INT;
    row.getCell(5).numFmt = FMT_PCT;
    row.getCell(6).numFmt = FMT_INT;
    row.getCell(7).numFmt = FMT_INT;
    row.getCell(8).numFmt = FMT_PCT0;
  }
  const totals = ath.addRow([
    "Roster total / average",
    "",
    "",
    report.athletes.totals.views,
    "",
    report.athletes.totals.claims,
    report.athletes.totals.redemptions,
    report.athletes.totals.conversion,
    "",
  ]);
  totals.font = { bold: true, size: 10 };
  totals.getCell(4).numFmt = FMT_INT;
  totals.getCell(6).numFmt = FMT_INT;
  totals.getCell(7).numFmt = FMT_INT;
  totals.getCell(8).numFmt = FMT_PCT0;
  ath.addRow([]);
  ath.addRow([
    "Views & engagement from platform APIs with per-row quality labels (§22); claims & redemptions are §16 event rows; Score is the §14 Content Value Score.",
  ]).font = { size: 9, color: { argb: MUTED } };

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
```

- [ ] **Step 2: Type-check + lint** — `npx tsc --noEmit && npm run lint`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/analytics-report-xlsx.ts
git commit -m "feat(analytics): XLSX renderer for the analytics export report"
```

---

### Task 4: Wire the export island + page

**Files:**
- Modify: `src/components/export-report.tsx`
- Modify: `src/components/analytics-story.tsx`

- [ ] **Step 1: Add the payload kind to `export-report.tsx`**

Add the type import (after the existing three type imports at the top):

```ts
import type { AdminAnalyticsReport } from "@/lib/analytics-report-data";
```

Extend the union:

```ts
export type ExportPayload =
  | { kind: "sponsor-dashboard"; report: SponsorReport }
  | { kind: "campaign-roi"; report: CampaignRoiReport }
  | { kind: "athlete-earnings"; report: AthleteEarningsReport }
  | { kind: "admin-analytics"; report: AdminAnalyticsReport };
```

Add the case to `generate()` (before the closing brace of the switch):

```ts
    case "admin-analytics": {
      if (format === "pdf") {
        const { generateAnalyticsReportPdf } = await import("@/lib/analytics-report-pdf");
        return generateAnalyticsReportPdf(payload.report);
      }
      const { generateAnalyticsReportXlsx } = await import("@/lib/analytics-report-xlsx");
      return generateAnalyticsReportXlsx(payload.report);
    }
```

- [ ] **Step 2: Mount the button in `analytics-story.tsx`**

Add imports:

```ts
import { ExportReport } from "@/components/export-report";
import { buildAnalyticsReport } from "@/lib/analytics-report-data";
```

Replace the range-pills container (the `<div className="ml-auto flex gap-1.5" role="group" aria-label="Date range">…</div>` block) with a wrapper holding the export button and the pills:

```tsx
          <div className="ml-auto flex items-center gap-2">
            <ExportReport
              payload={{
                kind: "admin-analytics",
                report: buildAnalyticsReport(range),
              }}
            />
            <div
              className="flex gap-1.5"
              role="group"
              aria-label="Date range"
            >
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  aria-pressed={r === range}
                  title={analyticsRanges[r].label}
                  className={[
                    "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors",
                    r === range
                      ? "border-primary/40 bg-primary/10 text-text"
                      : "border-line bg-surface text-muted hover:text-text",
                  ].join(" ")}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
```

- [ ] **Step 3: Full check** — `npx tsc --noEmit && npm run lint && npm run build`. Expected: all clean. In the build output, the analytics page's first-load JS should NOT grow by jspdf/exceljs size (dynamic import only — compare against the other export pages if unsure).

- [ ] **Step 4: Commit**

```bash
git add src/components/export-report.tsx src/components/analytics-story.tsx
git commit -m "feat(analytics): Export report button — PDF + XLSX from the active range"
```

---

### Task 5: Live verification + bookkeeping

- [ ] **Step 1: Drive it.** With the dev server running, on `/admin/analytics`: Export button appears beside the range pills; download PDF and XLSX on 30d; switch to 7d and download again — filenames read `SponsorX-Analytics-Report-Last-30-Days.*` / `SponsorX-Analytics-Report-Last-7-Days.*` and the numbers change. Open the PDF: five sections + methodology, unredeemed row and weakest funnel stage in orange, footer with page numbers and demo footnote. Open the XLSX: 5 sheets, numbers pivot as real numbers, percent columns formatted.
- [ ] **Step 2: Spot-check accuracy (30d):** unredeemed 2,430; funnel step conversions 78% / 67% / 43%; overall 22.8%; top offer share 44%; athlete totals row equals the funnel's claims/redemptions (4,300 / 1,870) and roster conversion 43%.
- [ ] **Step 3: Task board** (`Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx` — back up to scratchpad first, reuse the scratchpad venv): add row `P1-FE-15`, Order `33.996`, Stage 1 "UI Scaffold on Fixtures", Cat FE, Task "Admin analytics 'Export report' — client-side PDF + XLSX", Status `Code review`, Weight 1, Date Started 2026-09-17, Owner HeckerCreatives. Extend autofilter/validation/conditional-formatting/Dashboard formulas 198 → 199 (same procedure as P1-FE-14).
- [ ] **Step 4: Memory log** — append the task to `memory/2026-09-17/tasks-completed.md`; commit.
- [ ] **Step 5: Graphify** — incremental ingest of the three new libs + two modified components (same subset-stamping procedure as this morning).

---

## Self-review notes

- **Spec coverage:** model+derived stats (Task 1), PDF sections 1-8 (Task 2), 5-sheet workbook (Task 3), payload kind + island mount beside pills + range-labelled filename (Task 4), acceptance spot-checks incl. bundle note (Tasks 4-5). Demo states need no change (button lives in the island — spec's wiring section).
- **Type consistency:** `AdminAnalyticsReport` fields used by both renderers match Task 1's type exactly (`kpis[].kind`, `funnel.stages[].blurb/fromPrev/ofScans/dropOff`, `athletes.totals.conversion`, `meta.fileStem`). `Insight` type import used only for the `flat` helper. Kit imports verified against `report-pdf-kit.ts` / `report-xlsx-kit.ts` source.
- **No placeholders.**
