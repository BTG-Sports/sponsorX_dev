import ExcelJS from "exceljs";
import type { CampaignRoiReport } from "@/lib/campaign-report-data";
import {
  FMT_INT,
  FMT_MONEY,
  FMT_PCT,
  FMT_PCT0,
  MUTED,
  sectionTitle,
  styleHeader,
  titleBlock,
} from "@/lib/report-xlsx-kit";

/* --------------------------------------------------------------------------
   XLSX renderer for CampaignRoiReport. Numbers land as real numbers with
   Excel formats (money in dollars, shares as fractions) so the client can
   pivot and re-total; the return multiple stays numeric with a ×-suffixed
   format for the same reason.
   -------------------------------------------------------------------------- */

const FMT_MULT = '0.00"×"';

export async function generateCampaignReportXlsx(
  report: CampaignRoiReport,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SponsorX";
  wb.created = new Date();

  /* ---------------------------------------------------------------- Summary */
  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 28 }, { width: 16 }, { width: 62 }];

  titleBlock(
    summary,
    `SponsorX — ${report.meta.title}`,
    [
      `${report.meta.campaign} · Presented by ${report.meta.presentedBy}`,
      report.meta.period,
    ],
    3,
  );

  sectionTitle(summary, "Return on investment");
  styleHeader(summary.addRow(["Metric", "Value", "Source / provenance"]));
  const returns: [string, number | string, string, string | null][] = [
    ["Return", report.returns.multiple, "Attributed revenue ÷ investment", null],
    ["Invested", report.returns.investedCents / 100, "Zoho Books — invoiced", FMT_MONEY],
    [
      "Revenue attributed",
      report.returns.attributedCents / 100,
      "ATTRIBUTED · merchant-validated coupon redemptions (§16)",
      FMT_MONEY,
    ],
    [
      "Est. media value",
      report.returns.mediaValueCents / 100,
      "ESTIMATED · BTG-curated CPM — context, not revenue",
      FMT_MONEY,
    ],
  ];
  for (const [label, value, source, fmt] of returns) {
    const row = summary.addRow([label, value, source]);
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(2).font = { bold: true, size: 10 };
    row.getCell(2).alignment = { horizontal: "right" };
    if (fmt) row.getCell(2).numFmt = fmt;
    row.getCell(3).font = { size: 9, color: { argb: MUTED } };
  }
  summary.addRow([report.returns.breakEvenNote]).font = {
    size: 9,
    color: { argb: MUTED },
  };
  summary.addRow([]);

  sectionTitle(summary, "Delivery");
  styleHeader(summary.addRow(["Metric", "Value"]));
  const delivery: [string, number | string, string | null][] = [
    ["Total views", report.delivery.views, FMT_INT],
    ["Engagements", report.delivery.engagements, FMT_INT],
    [
      "Deliverables",
      `${report.delivery.deliverablesDone}/${report.delivery.deliverablesTotal} · ${report.delivery.onTimePct}% on-time`,
      null,
    ],
    ["Leads", report.delivery.leads, FMT_INT],
  ];
  for (const [label, value, fmt] of delivery) {
    const row = summary.addRow([label, value]);
    row.getCell(2).alignment = { horizontal: "right" };
    if (fmt) row.getCell(2).numFmt = fmt;
  }
  summary.addRow([]);

  sectionTitle(summary, "Efficiency vs category benchmarks");
  styleHeader(summary.addRow(["Metric", "Cost", "vs benchmark"]));
  for (const e of report.efficiency) {
    const row = summary.addRow([
      e.label,
      e.value,
      e.benchDeltaPct === null ? "— (ATTRIBUTED)" : e.benchDeltaPct / 100,
    ]);
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(3).alignment = { horizontal: "right" };
    if (e.benchDeltaPct !== null) row.getCell(3).numFmt = FMT_PCT0;
  }
  summary.addRow(["Benchmarks are BTG-curated category medians (ESTIMATED)."]).font =
    { size: 9, color: { argb: MUTED } };
  summary.addRow([]);

  sectionTitle(summary, "Recommendation");
  const rec = summary.addRow([
    `${report.recommendation.body} (Projected lift is ESTIMATED.)`,
  ]);
  rec.font = { size: 10 };
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

  /* -------------------------------------------------------- Return timeline */
  const timeline = wb.addWorksheet("Return timeline");
  timeline.columns = [{ width: 14 }, { width: 16 }];
  styleHeader(timeline.addRow(["Date", "Return multiple"]));
  timeline.views = [{ state: "frozen", ySplit: 1 }];
  for (const p of report.timeline) {
    const row = timeline.addRow([p.date, p.multiple]);
    row.getCell(2).numFmt = FMT_MULT;
    row.getCell(2).alignment = { horizontal: "right" };
  }
  timeline.addRow([]);
  timeline.addRow([report.returns.breakEvenNote]).font = {
    size: 9,
    color: { argb: MUTED },
  };

  /* ------------------------------------------------------------ Composition */
  const comp = wb.addWorksheet("Composition");
  comp.columns = [{ width: 22 }, { width: 12 }, { width: 12 }, { width: 60 }];

  sectionTitle(comp, "By content format — MetricDaily");
  styleHeader(comp.addRow(["Format", "NIL job", "Views"]));
  for (const f of report.formats.rows) {
    const row = comp.addRow([f.label, f.job, f.views]);
    row.getCell(3).numFmt = FMT_INT;
  }
  comp.addRow([report.formats.insight]).font = { size: 9, color: { argb: MUTED } };
  comp.addRow([]);

  sectionTitle(comp, "By platform — MetricDaily");
  styleHeader(comp.addRow(["Platform", "Views", "Share"]));
  for (const p of report.platforms.rows) {
    const row = comp.addRow([p.label, p.views, p.share]);
    row.getCell(2).numFmt = FMT_INT;
    row.getCell(3).numFmt = FMT_PCT0;
  }
  comp.addRow([report.platforms.insight]).font = { size: 9, color: { argb: MUTED } };
  comp.addRow([]);

  sectionTitle(comp, "Top markets — RewardEvent · geo");
  styleHeader(comp.addRow(["Market", "Share of redemptions"]));
  for (const m of report.markets.rows) {
    const row = comp.addRow([m.label, m.pct / 100]);
    row.getCell(2).numFmt = FMT_PCT0;
    row.getCell(2).alignment = { horizontal: "right" };
  }
  comp.addRow([report.markets.insight]).font = { size: 9, color: { argb: MUTED } };

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
    `${report.funnel.overallPct}% of scans convert · median ${report.funnel.medianRedeemHours}h to redeem · ${report.funnel.leadsPushed.toLocaleString("en-US")} consented leads pushed to Zoho CRM`,
  ]).font = { size: 9, color: { argb: MUTED } };

  /* ------------------------------------------------------------- Top content */
  const content = wb.addWorksheet("Top content");
  content.columns = [
    { width: 8 },
    { width: 28 },
    { width: 22 },
    { width: 10 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
  ];
  styleHeader(
    content.addRow(["Rank", "Content", "Athlete", "Format", "Platform", "Views", "Eng. rate"]),
  );
  for (const c of report.topContent) {
    const row = content.addRow([
      c.rank,
      c.title,
      c.athlete,
      c.format,
      c.platform,
      c.views,
      c.engagementRate / 100,
    ]);
    row.getCell(2).font = { bold: true, size: 10 };
    row.getCell(6).numFmt = FMT_INT;
    row.getCell(7).numFmt = FMT_PCT;
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
