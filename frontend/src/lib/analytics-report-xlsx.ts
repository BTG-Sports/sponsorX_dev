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
