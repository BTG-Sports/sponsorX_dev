import ExcelJS from "exceljs";
import type { SponsorReport } from "@/lib/report-data";

/* --------------------------------------------------------------------------
   XLSX renderer for SponsorReport. Same contract as report-pdf: pure function
   of the report model, dynamic-imported by the export island on demand.

   Numbers land as real numbers with Excel number formats (money in dollars,
   shares as fractions with a percent format) so the client can pivot, chart
   and re-total them — an export of preformatted strings is a screenshot,
   not a workbook.
   -------------------------------------------------------------------------- */

import {
  BRAND,
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

export async function generateReportXlsx(report: SponsorReport): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SponsorX";
  wb.created = new Date();

  /* ---------------------------------------------------------------- Summary */
  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { width: 30 },
    { width: 16 },
    { width: 56 },
    { width: 34 },
  ];

  titleBlock(
    summary,
    `SponsorX — ${report.meta.title}`,
    [
      `${report.meta.sponsor} · ${report.meta.period} · ${report.meta.campaignCount} campaigns`,
      `Prepared for ${report.meta.contact}`,
    ],
    4,
  );

  sectionTitle(summary, "Executive summary");
  styleHeader(summary.addRow(["Metric", "Value", "Detail", "Source / provenance"]));
  for (const k of report.kpis) {
    const row = summary.addRow([k.label, k.value, k.detail, k.provenance]);
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(2).font = { bold: true, size: 10 };
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(3).font = { size: 10 };
    row.getCell(4).font = { size: 9, color: { argb: MUTED } };
  }
  summary.addRow([]);

  sectionTitle(summary, "What moved the numbers");
  for (const text of report.insights) {
    summary.addRow([`•  ${text}`]).font = { size: 10 };
  }
  summary.addRow([]);

  sectionTitle(summary, "Data trust — provenance mix (§22)");
  styleHeader(summary.addRow(["Provenance", "Share"]));
  for (const t of report.trust) {
    const row = summary.addRow([t.label, t.pct / 100]);
    row.getCell(2).numFmt = FMT_PCT0;
    row.getCell(2).alignment = { horizontal: "right" };
  }
  summary.addRow([]);

  sectionTitle(summary, "Methodology");
  for (const text of report.methodology) {
    const row = summary.addRow([`•  ${text}`]);
    row.font = { size: 9, color: { argb: MUTED } };
  }
  summary.addRow([]);
  summary.addRow([report.meta.footnote]).font = {
    size: 8,
    italic: true,
    color: { argb: MUTED },
  };

  /* ------------------------------------------------------- Daily performance */
  const daily = wb.addWorksheet("Daily performance");
  daily.columns = [{ width: 16 }, { width: 20 }, { width: 24 }, { width: 14 }];
  styleHeader(
    daily.addRow(["Date", "Views (cumulative)", "Engagements (cumulative)", "Basis"]),
  );
  daily.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of report.daily.rows) {
    const row = daily.addRow([r.date, r.views, r.engagements, "Actual"]);
    row.getCell(2).numFmt = FMT_INT;
    row.getCell(3).numFmt = FMT_INT;
  }
  for (const p of report.daily.projection) {
    const row = daily.addRow([p.date, p.views, null, "ESTIMATED"]);
    row.getCell(2).numFmt = FMT_INT;
    row.font = { italic: true, color: { argb: MUTED } };
  }
  daily.addRow([]);
  daily.addRow([report.daily.breakEvenNote]).font = {
    size: 9,
    color: { argb: MUTED },
  };

  /* ------------------------------------------------------ Campaign portfolio */
  const campaigns = wb.addWorksheet("Campaign portfolio");
  campaigns.columns = [
    { width: 24 },
    { width: 20 },
    { width: 10 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
    { width: 16 },
  ];
  styleHeader(
    campaigns.addRow([
      "Campaign",
      "Package",
      "Athletes",
      "Deliverables",
      "Views",
      "Spend",
      "Pacing",
      "Status",
      "Timeline",
    ]),
  );
  campaigns.views = [{ state: "frozen", ySplit: 1 }];
  for (const c of report.campaigns.rows) {
    const row = campaigns.addRow([
      c.name,
      c.pkg,
      c.athletes,
      `${c.done}/${c.total}`,
      c.views,
      c.spendCents / 100,
      c.pacing,
      c.state,
      c.timeline,
    ]);
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(4).alignment = { horizontal: "right" };
    row.getCell(5).numFmt = FMT_INT;
    row.getCell(6).numFmt = FMT_MONEY;
    if (c.pacing === "Behind") {
      row.getCell(7).font = { bold: true, color: { argb: WARN } };
    }
  }
  const totals = campaigns.addRow([
    "Total",
    "",
    report.campaigns.totals.athletes,
    "",
    report.campaigns.totals.views,
    report.campaigns.totals.spendCents / 100,
    "",
    "",
    "",
  ]);
  totals.font = { bold: true };
  totals.getCell(5).numFmt = FMT_INT;
  totals.getCell(6).numFmt = FMT_MONEY;
  totals.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = { top: { style: "thin", color: { argb: BRAND } } };
  });

  /* ----------------------------------------------------------- Reward funnel */
  const funnel = wb.addWorksheet("Reward funnel");
  funnel.columns = [{ width: 14 }, { width: 12 }, { width: 14 }, { width: 18 }];
  styleHeader(funnel.addRow(["Stage", "Fans", "% of scans", "Step conversion"]));
  for (const s of report.funnel.stages) {
    const row = funnel.addRow([
      s.stage,
      s.count,
      s.ofScans,
      s.fromPrev === null ? "—" : s.fromPrev,
    ]);
    row.getCell(2).numFmt = FMT_INT;
    row.getCell(3).numFmt = FMT_PCT0;
    if (s.fromPrev !== null) row.getCell(4).numFmt = FMT_PCT0;
    row.getCell(4).alignment = { horizontal: "right" };
  }
  funnel.addRow([]);
  funnel.addRow([
    `${report.funnel.overallPct}% of scans convert to a redemption · median ${report.funnel.medianRedeemHours}h to redeem · ${report.funnel.leadsPushed.toLocaleString("en-US")} consented leads pushed to CRM`,
  ]).font = { size: 9, color: { argb: MUTED } };

  /* ------------------------------------------------------------ Top athletes */
  const athletes = wb.addWorksheet("Top athletes");
  athletes.columns = [
    { width: 8 },
    { width: 24 },
    { width: 12 },
    { width: 22 },
    { width: 20 },
  ];
  styleHeader(
    athletes.addRow(["Rank", "Athlete", "Views", "Share of delivered views", "Flag"]),
  );
  for (const a of report.athletes) {
    const row = athletes.addRow([a.rank, a.name, a.views, a.share, a.flag ?? "—"]);
    row.getCell(2).font = { bold: true, size: 10 };
    row.getCell(3).numFmt = FMT_INT;
    row.getCell(4).numFmt = FMT_PCT;
    if (a.flag) row.getCell(5).font = { color: { argb: WARN } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
