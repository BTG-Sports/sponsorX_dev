import ExcelJS from "exceljs";
import type { CampaignResultsReport } from "@/lib/campaign-results-report";
import { FMT_INT, FMT_PCT, MUTED, sectionTitle, styleHeader, titleBlock } from "@/lib/report-xlsx-kit";

/* --------------------------------------------------------------------------
   XLSX renderer for CampaignResultsReport. Numbers land as real numbers with
   Excel formats so the sponsor can sort and pivot. The Summary sheet holds
   the headline figures, the fan journey, placements and notes; reach by
   source, athletes and posts each get a sheet. Reach by source stays one row per source — no total row, because
   adding checked reach to self-reported reach would say something untrue.
   -------------------------------------------------------------------------- */

const FMT_MONEY_CENTS = '"$"#,##0.00';

export async function generateCampaignResultsXlsx(report: CampaignResultsReport): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SponsorX";
  wb.created = new Date();
  const h = report.headline;

  /* ---------------------------------------------------------------- Summary */
  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 40 }, { width: 16 }, { width: 70 }];
  titleBlock(
    summary,
    `SponsorX — ${report.meta.title}`,
    [report.meta.campaign, `${report.meta.status} · ${report.meta.period}`, ...(report.meta.objective ? [report.meta.objective] : [])],
    3,
  );

  sectionTitle(summary, "Results so far");
  styleHeader(summary.addRow(["Figure", "Value", "How it's counted"]));
  const rows: [string, number | string, string, string | null][] = [
    ["People reached", h.reached, "Checked by the platform or BTG.", FMT_INT],
    ["Reach from other sources (not added in)", h.otherReach, "Reported by athletes or estimated, shown apart.", FMT_INT],
    ["Likes, comments & shares", h.engagements, "On checked posts.", FMT_INT],
    ["Engagement rate", h.engagementRate ?? "—", "Of people reached.", h.engagementRate === null ? null : FMT_PCT],
    ["Fans who redeemed", h.redeemed, "Fans who scanned your QR code and used your offer.", FMT_INT],
    ["Offers issued", h.issued, "", FMT_INT],
    [
      "What you pay per 1,000 people reached",
      h.costPerThousandCents === null ? "—" : h.costPerThousandCents / 100,
      h.costPerThousandCents === null ? "No checked reach yet." : h.costBasis,
      h.costPerThousandCents === null ? null : FMT_MONEY_CENTS,
    ],
  ];
  for (const [label, value, how, fmt] of rows) {
    const row = summary.addRow([label, value, how]);
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(2).alignment = { horizontal: "right" };
    if (fmt) row.getCell(2).numFmt = fmt;
    row.getCell(3).font = { size: 9, color: { argb: MUTED } };
    row.getCell(3).alignment = { wrapText: true, vertical: "top" };
  }
  summary.addRow([]);

  sectionTitle(summary, "From scan to redeemed");
  styleHeader(summary.addRow(["Step", "Fans"]));
  for (const f of report.funnel) summary.addRow([f.stage, f.fans]).getCell(2).numFmt = FMT_INT;
  summary.addRow([]);

  if (report.placements) {
    sectionTitle(summary, "Edition placements (print and digital kept apart)");
    styleHeader(summary.addRow(["Positions", "Print QR scans", "Digital link clicks"]));
    const p = summary.addRow([report.placements.positions, report.placements.printScans, report.placements.digitalClicks]);
    p.eachCell((c) => {
      c.numFmt = FMT_INT;
    });
    summary.addRow([]);
  }

  if (report.observations.length > 0) {
    sectionTitle(summary, "What stands out");
    for (const o of report.observations) summary.addRow([o]).font = { size: 9 };
    summary.addRow([]);
  }

  sectionTitle(summary, "How these figures are counted");
  for (const n of report.notes) summary.addRow([n]).font = { size: 9, color: { argb: MUTED } };
  summary.addRow([report.meta.footnote]).font = { size: 9, color: { argb: MUTED } };

  /* ---------------------------------------------------------- Reach sources */
  const sources = wb.addWorksheet("Reach by source");
  sources.columns = [{ width: 30 }, { width: 10 }, { width: 16 }, { width: 26 }];
  styleHeader(sources.addRow(["Source", "Checked", "People reached", "Likes, comments & shares"]));
  for (const s of report.sources) {
    const row = sources.addRow([s.label, s.checked ? "Yes" : "No", s.views, s.engagements]);
    row.getCell(3).numFmt = FMT_INT;
    row.getCell(4).numFmt = FMT_INT;
  }

  /* --------------------------------------------------------------- Athletes */
  const athletes = wb.addWorksheet("Athletes");
  athletes.columns = [{ width: 30 }, { width: 22 }, { width: 22 }, { width: 14 }, { width: 16 }];
  styleHeader(athletes.addRow(["Athlete", "Job", "Order", "Posts checked", "Posts planned"]));
  for (const a of report.athletes) athletes.addRow([a.name, a.job, a.order, a.checked, a.total]);
  if (report.bestAthletes && report.bestAthletes.rows.length > 0) {
    athletes.addRow([]);
    sectionTitle(athletes, `Best athletes — checked reach, ${report.bestAthletes.window}`);
    styleHeader(athletes.addRow(["Athlete", "Sport", "No.", "People reached"]));
    for (const b of report.bestAthletes.rows) athletes.addRow([b.name, b.sport ?? "", b.rank, b.reached]).getCell(4).numFmt = FMT_INT;
  }

  /* ------------------------------------------------------------------ Posts */
  const posts = wb.addWorksheet("Posts");
  posts.columns = [{ width: 36 }, { width: 22 }, { width: 14 }, { width: 12 }, { width: 50 }];
  styleHeader(posts.addRow(["Post", "Status", "Published", "Link clicks", "Link"]));
  for (const p of report.posts) {
    const row = posts.addRow([p.title, p.status, p.publishedAt ?? "", p.clicks, p.url ?? ""]);
    row.getCell(4).numFmt = FMT_INT;
    /* Link only a web address — never a javascript: or file: target. */
    if (p.url && /^https?:\/\//i.test(p.url)) row.getCell(5).value = { text: p.url, hyperlink: p.url };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
