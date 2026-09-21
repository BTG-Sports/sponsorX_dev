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
