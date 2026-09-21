import { jsPDF } from "jspdf";
import type { SponsorReport } from "@/lib/report-data";
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
   PDF renderer for SponsorReport — the client-ready document behind the
   dashboard's "Export report". Loaded only on demand (the export island
   dynamic-imports this module), so jspdf never enters the dashboard bundle.
   -------------------------------------------------------------------------- */

export function generateReportPdf(report: SponsorReport): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  let y = headerBand(doc, {
    title: report.meta.title,
    subtitle: `${report.meta.sponsor} · ${report.meta.period} · ${report.meta.campaignCount} campaigns`,
    sub2: `Prepared for ${report.meta.contact}`,
  });

  /* ------------------------------------------------------ executive summary */
  y = heading(doc, y, "Executive summary");
  y = table(doc, {
    startY: y,
    head: [["Metric", "Value", "Detail", "Source / provenance"]],
    body: report.kpis.map((k) => [k.label, k.value, k.detail, k.provenance]),
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 118 },
      1: { fontStyle: "bold", cellWidth: 66, halign: "right" },
      3: { textColor: MUTED, cellWidth: 132 },
    },
  });

  /* -------------------------------------------------------------- insights */
  y = heading(doc, y + 22, "What moved the numbers", 90);
  y = paragraphs(doc, y, report.insights, 8.5);

  /* --------------------------------------------------------- reward funnel */
  y = heading(doc, y + 14, "Reward funnel — QR scan to redemption", 140);
  y = table(doc, {
    startY: y,
    head: [["Stage", "Fans", "% of scans", "Step conversion"]],
    body: report.funnel.stages.map((s) => [
      s.stage,
      num(s.count),
      pct(s.ofScans, 0),
      s.fromPrev === null ? "—" : pct(s.fromPrev, 0),
    ]),
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });
  y = note(
    doc,
    y,
    `${report.funnel.overallPct}% of scans convert to a redemption · median ${report.funnel.medianRedeemHours}h to redeem · ${num(report.funnel.leadsPushed)} consented leads pushed to CRM`,
  );

  /* ------------------------------------------------------ campaign portfolio */
  y = heading(doc, y + 12, "Campaign portfolio", 160);
  y = table(doc, {
    startY: y,
    head: [
      ["Campaign", "Package", "Athletes", "Deliverables", "Views", "Spend", "Pacing", "Status"],
    ],
    body: report.campaigns.rows.map((c) => [
      c.name,
      c.pkg,
      String(c.athletes),
      `${c.done}/${c.total}`,
      num(c.views),
      money(c.spendCents),
      c.pacing,
      c.state,
    ]),
    foot: [
      [
        "Total",
        "",
        String(report.campaigns.totals.athletes),
        "",
        num(report.campaigns.totals.views),
        money(report.campaigns.totals.spendCents),
        "",
        "",
      ],
    ],
    footStyles: { fillColor: [246, 248, 251], textColor: [31, 36, 48], fontStyle: "bold" },
    columnStyles: {
      0: { fontStyle: "bold" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 6 && data.cell.raw === "Behind") {
        data.cell.styles.textColor = WARN;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  /* ----------------------------------------------------------- top athletes */
  y = heading(doc, y + 22, "Top athletes by delivered views", 120);
  y = table(doc, {
    startY: y,
    head: [["Rank", "Athlete", "Views", "Share of delivered views", "Flag"]],
    body: report.athletes.map((a) => [
      String(a.rank),
      a.name,
      num(a.views),
      pct(a.share),
      a.flag ?? "—",
    ]),
    columnStyles: {
      0: { halign: "right", cellWidth: 40 },
      1: { fontStyle: "bold" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 4 && data.cell.raw !== "—") {
        data.cell.styles.textColor = WARN;
      }
    },
  });

  /* ------------------------------------------------------ daily performance */
  y = heading(doc, y + 22, "Daily performance — cumulative", 200);
  y = table(doc, {
    startY: y,
    head: [["Date", "Views (cumulative)", "Engagements (cumulative)"]],
    body: [
      ...report.daily.rows.map((r) => [r.date, num(r.views), num(r.engagements)]),
      ...report.daily.projection.map((p) => [
        `${p.date} (EST)`,
        num(p.views),
        "—",
      ]),
    ],
    styles: { font: "helvetica", fontSize: 7.5, textColor: [31, 36, 48], cellPadding: 3 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    didParseCell: (data) => {
      if (
        data.section === "body" &&
        data.row.index >= report.daily.rows.length
      ) {
        data.cell.styles.textColor = MUTED;
        data.cell.styles.fontStyle = "italic";
      }
    },
  });
  y = note(
    doc,
    y,
    `${report.daily.breakEvenNote} Rows marked EST are the linear projection of the May run-rate.`,
  );

  /* ------------------------------------------------- data trust + methodology */
  y = heading(doc, y + 12, "Data trust — provenance mix (§22)", 90);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(31, 36, 48);
  doc.text(
    report.trust.map((t) => `${t.label} ${t.pct}%`).join("   ·   "),
    44,
    y,
  );
  y += 16;

  y = heading(doc, y + 6, "Methodology", 120);
  paragraphs(doc, y, report.methodology, 7.5);

  footers(
    doc,
    `SponsorX · Prepared for ${report.meta.sponsor} · Confidential`,
    report.meta.footnote,
  );

  return doc.output("blob");
}
