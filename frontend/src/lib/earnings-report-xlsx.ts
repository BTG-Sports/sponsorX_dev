import ExcelJS from "exceljs";
import type { AthleteEarningsReport } from "@/lib/earnings-report-data";
import {
  BRAND,
  FMT_MONEY,
  MUTED,
  WARN,
  sectionTitle,
  styleHeader,
  titleBlock,
} from "@/lib/report-xlsx-kit";

/* --------------------------------------------------------------------------
   XLSX renderer for AthleteEarningsReport. Money lands as real dollar
   numbers with a currency format so the athlete (or their accountant) can
   re-total the year; the career-vs-cycle framing is printed with the data,
   not left to memory.
   -------------------------------------------------------------------------- */

export async function generateEarningsReportXlsx(
  report: AthleteEarningsReport,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SponsorX";
  wb.created = new Date();

  /* ---------------------------------------------------------------- Summary */
  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 26 }, { width: 14 }, { width: 12 }, { width: 62 }];

  titleBlock(
    summary,
    `SponsorX — ${report.meta.title}`,
    [
      `${report.meta.athlete} · ${report.meta.sport} · ${report.meta.tier}`,
      report.meta.period,
    ],
    4,
  );

  sectionTitle(summary, "Your earnings at a glance — canonical (Postgres)");
  styleHeader(summary.addRow(["Metric", "Value", "", "Detail"]));
  for (const s of report.summary) {
    const row = summary.addRow([s.label, s.value, "", s.detail]);
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(2).font = { bold: true, size: 10 };
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(4).font = { size: 10 };
  }
  summary.addRow([]);

  sectionTitle(summary, "Where your money is — this cycle");
  styleHeader(summary.addRow(["Stage", "Amount", "Orders", "What it means"]));
  report.journey.stages.forEach((s, i) => {
    const row = summary.addRow([
      `${i + 1} · ${s.title}`,
      s.amountCents / 100,
      s.orders,
      s.meaning,
    ]);
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(2).numFmt = FMT_MONEY;
    row.getCell(4).font = { size: 10 };
  });
  if (report.journey.held) {
    const row = summary.addRow([
      "On hold",
      report.journey.held.amountCents / 100,
      report.journey.held.orders,
      report.journey.held.note,
    ]);
    row.getCell(1).font = { bold: true, size: 10, color: { argb: WARN } };
    row.getCell(2).numFmt = FMT_MONEY;
    row.getCell(2).font = { color: { argb: WARN } };
    row.getCell(4).font = { size: 10, color: { argb: WARN } };
  }
  summary.addRow([report.journey.scopeNote]).font = {
    size: 9,
    color: { argb: MUTED },
  };
  summary.addRow([]);

  sectionTitle(summary, "Good to know");
  for (const text of report.notes) {
    summary.addRow([`•  ${text}`]).font = { size: 9, color: { argb: MUTED } };
  }
  summary.addRow([]);
  summary.addRow([report.meta.footnote]).font = {
    size: 8,
    italic: true,
    color: { argb: MUTED },
  };

  /* ---------------------------------------------------------- Monthly trend */
  const trend = wb.addWorksheet("Monthly earnings");
  trend.columns = [{ width: 14 }, { width: 14 }];
  styleHeader(trend.addRow(["Month", "Earnings"]));
  trend.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of report.trend.rows) {
    const row = trend.addRow([r.month, r.amountCents / 100]);
    row.getCell(2).numFmt = FMT_MONEY;
  }
  const avg = trend.addRow(["Monthly average", report.trend.avgCents / 100]);
  avg.font = { bold: true };
  avg.getCell(2).numFmt = FMT_MONEY;
  avg.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = { top: { style: "thin", color: { argb: BRAND } } };
  });

  /* --------------------------------------------------------------- Activity */
  const activity = wb.addWorksheet("Activity");
  activity.columns = [
    { width: 22 },
    { width: 24 },
    { width: 12 },
    { width: 20 },
    { width: 16 },
    { width: 10 },
    { width: 70 },
  ];
  styleHeader(
    activity.addRow([
      "Campaign",
      "Job",
      "Amount",
      "Status",
      "Reference",
      "Updated",
      "What it means",
    ]),
  );
  activity.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of report.activity.rows) {
    const row = activity.addRow([
      r.campaign,
      `${r.jobId} · ${r.jobName}`,
      r.amountCents / 100,
      r.status,
      r.reference ?? "—",
      r.updatedAt,
      r.statusDetail,
    ]);
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(3).numFmt = FMT_MONEY;
    if (r.status === "Held" || r.status === "Disputed") {
      row.getCell(4).font = { bold: true, color: { argb: WARN } };
    }
    row.getCell(7).font = { size: 9, color: { argb: MUTED } };
  }
  const totals = activity.addRow([
    "Total",
    "",
    report.activity.totalCents / 100,
    "",
    "",
    "",
    "",
  ]);
  totals.font = { bold: true };
  totals.getCell(3).numFmt = FMT_MONEY;
  totals.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = { top: { style: "thin", color: { argb: BRAND } } };
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
