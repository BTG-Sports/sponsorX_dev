import { jsPDF } from "jspdf";
import type { CampaignRoiReport } from "@/lib/campaign-report-data";
import {
  INK,
  MUTED,
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
   PDF renderer for CampaignRoiReport — §9 screen 12 as a client-ready
   document. Dynamic-imported by the export island; jspdf stays out of the
   page bundle. Zone order mirrors the screen: return, composition, funnel /
   efficiency / delivery, top content, recommendation.
   -------------------------------------------------------------------------- */

export function generateCampaignReportPdf(report: CampaignRoiReport): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  let y = headerBand(doc, {
    title: report.meta.title,
    subtitle: `${report.meta.campaign} · Presented by ${report.meta.presentedBy}`,
    sub2: report.meta.period,
  });

  /* ---------------------------------------------------------------- return */
  y = heading(doc, y, "Return on investment");
  y = table(doc, {
    startY: y,
    head: [["Metric", "Value", "Source / provenance"]],
    body: [
      ["Return", report.returns.multiple, "Attributed revenue ÷ investment"],
      ["Invested", money(report.returns.investedCents), "Zoho Books — invoiced"],
      [
        "Revenue attributed",
        money(report.returns.attributedCents),
        "ATTRIBUTED · merchant-validated coupon redemptions (§16)",
      ],
      [
        "Est. media value",
        money(report.returns.mediaValueCents),
        "ESTIMATED · BTG-curated CPM — context, not revenue",
      ],
    ],
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 118 },
      1: { fontStyle: "bold", cellWidth: 80, halign: "right" },
      2: { textColor: MUTED },
    },
  });
  y = note(doc, y, report.returns.breakEvenNote);

  /* ------------------------------------------------------- return timeline */
  y = heading(doc, y + 12, "Return over time", 130);
  y = table(doc, {
    startY: y,
    head: [["Date", "Return multiple"]],
    body: report.timeline.map((p) => [p.date, `${p.multiple.toFixed(2)}×`]),
    columnStyles: { 1: { halign: "right" } },
  });

  /* ------------------------------------------------------------ composition */
  y = heading(doc, y + 22, "Where results came from — by content format", 140);
  y = table(doc, {
    startY: y,
    head: [["Format", "NIL job", "Views"]],
    body: report.formats.rows.map((f) => [f.label, f.job, num(f.views)]),
    columnStyles: { 0: { fontStyle: "bold" }, 2: { halign: "right" } },
  });
  y = note(doc, y, report.formats.insight);

  y = heading(doc, y + 12, "By platform", 130);
  y = table(doc, {
    startY: y,
    head: [["Platform", "Views", "Share"]],
    body: report.platforms.rows.map((p) => [
      p.label,
      num(p.views),
      pct(p.share, 0),
    ]),
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" }, 2: { halign: "right" } },
  });
  y = note(doc, y, report.platforms.insight);

  y = heading(doc, y + 12, "Top markets — reward redemptions", 140);
  y = table(doc, {
    startY: y,
    head: [["Market", "Share of redemptions"]],
    body: report.markets.rows.map((m) => [m.label, `${m.pct}%`]),
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" } },
  });
  y = note(doc, y, report.markets.insight);

  /* ---------------------------------------------------------------- funnel */
  y = heading(doc, y + 12, "Reward funnel — QR scan to redemption", 140);
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
    `${report.funnel.overallPct}% of scans convert · median ${report.funnel.medianRedeemHours}h to redeem · ${num(report.funnel.leadsPushed)} consented leads pushed to Zoho CRM`,
  );

  /* --------------------------------------------------- efficiency + delivery */
  y = heading(doc, y + 12, "Efficiency vs category benchmarks", 140);
  y = table(doc, {
    startY: y,
    head: [["Metric", "Cost", "vs benchmark"]],
    body: report.efficiency.map((e) => [
      e.label,
      e.value,
      e.benchDeltaPct === null ? "— (ATTRIBUTED)" : `${e.benchDeltaPct}%`,
    ]),
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  });
  y = note(doc, y, "Benchmarks are BTG-curated category medians (ESTIMATED).");

  y = heading(doc, y + 12, "Delivery", 140);
  y = table(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: [
      ["Total views", num(report.delivery.views)],
      ["Engagements", num(report.delivery.engagements)],
      [
        "Deliverables",
        `${report.delivery.deliverablesDone}/${report.delivery.deliverablesTotal} · ${report.delivery.onTimePct}% on-time`,
      ],
      ["Leads", num(report.delivery.leads)],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 118 }, 1: { halign: "right" } },
  });
  y = note(doc, y, "On-time from Deliverable due vs published timestamps.");

  /* ------------------------------------------------------------ top content */
  y = heading(doc, y + 12, "Top content", 130);
  y = table(doc, {
    startY: y,
    head: [["Rank", "Content", "Athlete", "Format", "Platform", "Views", "Eng. rate"]],
    body: report.topContent.map((c) => [
      String(c.rank),
      c.title,
      c.athlete,
      c.format,
      c.platform,
      num(c.views),
      `${c.engagementRate}%`,
    ]),
    columnStyles: {
      0: { halign: "right", cellWidth: 34 },
      1: { fontStyle: "bold" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
  });

  /* --------------------------------------------------------- recommendation */
  y = heading(doc, y + 22, "Recommendation", 100);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  const wrapped: string[] = doc.splitTextToSize(
    `${report.recommendation.body} (Projected lift is ESTIMATED.)`,
    595.28 - 44 * 2,
  );
  doc.text(wrapped, 44, y);
  y += wrapped.length * 11 + 8;

  y = heading(doc, y + 6, "Methodology", 130);
  paragraphs(doc, y, report.methodology, 7.5);

  footers(
    doc,
    `SponsorX · ${report.meta.campaign} (${report.meta.campaignId}) · Prepared for ${report.meta.presentedBy} · Confidential`,
    report.meta.footnote,
  );

  return doc.output("blob");
}
