import { jsPDF } from "jspdf";
import type { AthleteEarningsReport } from "@/lib/earnings-report-data";
import {
  MUTED,
  WARN,
  footers,
  headerBand,
  heading,
  money,
  note,
  paragraphs,
  table,
} from "@/lib/report-pdf-kit";

/* --------------------------------------------------------------------------
   PDF renderer for AthleteEarningsReport — the athlete's own statement.
   Dynamic-imported by the export island. Section order mirrors the screen's
   four questions: how much have I made, what's arriving, where is each
   dollar, is anything stuck.
   -------------------------------------------------------------------------- */

export function generateEarningsReportPdf(report: AthleteEarningsReport): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  let y = headerBand(doc, {
    title: report.meta.title,
    subtitle: `${report.meta.athlete} · ${report.meta.sport} · ${report.meta.tier}`,
    sub2: report.meta.period,
  });

  /* --------------------------------------------------------------- summary */
  y = heading(doc, y, "Your earnings at a glance");
  y = table(doc, {
    startY: y,
    head: [["Metric", "Value", "Detail", "Source"]],
    body: report.summary.map((s) => [s.label, s.value, s.detail, s.provenance]),
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 110 },
      1: { fontStyle: "bold", cellWidth: 66, halign: "right" },
      3: { textColor: MUTED, cellWidth: 105 },
    },
  });

  /* --------------------------------------------------------- money journey */
  y = heading(doc, y + 22, "Where your money is — this cycle", 170);
  y = table(doc, {
    startY: y,
    head: [["Stage", "Amount", "Orders", "What it means"]],
    body: [
      ...report.journey.stages.map((s, i) => [
        `${i + 1} · ${s.title}`,
        money(s.amountCents),
        String(s.orders),
        s.meaning,
      ]),
      ...(report.journey.held
        ? [
            [
              "On hold",
              money(report.journey.held.amountCents),
              String(report.journey.held.orders),
              report.journey.held.note,
            ],
          ]
        : []),
    ],
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 110 },
      1: { halign: "right", cellWidth: 60 },
      2: { halign: "right", cellWidth: 44 },
    },
    didParseCell: (data) => {
      if (
        report.journey.held &&
        data.section === "body" &&
        data.row.index === report.journey.stages.length
      ) {
        data.cell.styles.textColor = WARN;
      }
    },
  });
  y = note(doc, y, report.journey.scopeNote);

  /* ---------------------------------------------------------- monthly trend */
  y = heading(doc, y + 12, "Monthly earnings — 2026", 180);
  y = table(doc, {
    startY: y,
    head: [["Month", "Earnings"]],
    body: report.trend.rows.map((r) => [r.month, money(r.amountCents)]),
    foot: [["Monthly average", money(report.trend.avgCents)]],
    footStyles: { fillColor: [246, 248, 251], textColor: [31, 36, 48], fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });

  /* -------------------------------------------------------- recent activity */
  y = heading(doc, y + 22, "Recent activity — this cycle", 160);
  y = table(doc, {
    startY: y,
    head: [["Campaign", "Job", "Amount", "Status", "Reference", "Updated"]],
    body: report.activity.rows.map((r) => [
      r.campaign,
      `${r.jobId} · ${r.jobName}`,
      money(r.amountCents),
      r.status,
      r.reference ?? "—",
      r.updatedAt,
    ]),
    foot: [["Total", "", money(report.activity.totalCents), "", "", ""]],
    footStyles: { fillColor: [246, 248, 251], textColor: [31, 36, 48], fontStyle: "bold" },
    columnStyles: {
      0: { fontStyle: "bold" },
      2: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        const raw = String(data.cell.raw);
        if (raw === "Held" || raw === "Disputed") {
          data.cell.styles.textColor = WARN;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  /* -------------------------------------------------------- status meanings */
  y = heading(doc, y + 22, "What each status means", 110);
  y = paragraphs(
    doc,
    y,
    report.activity.rows
      .map((r) => r.status)
      .filter((s, i, a) => a.indexOf(s) === i)
      .map((status) => {
        const row = report.activity.rows.find((r) => r.status === status);
        return `${status} — ${row?.statusDetail ?? ""}`;
      }),
    8,
  );

  /* ------------------------------------------------------------------ notes */
  y = heading(doc, y + 10, "Good to know", 120);
  paragraphs(doc, y, report.notes, 7.5);

  footers(
    doc,
    `SponsorX · Earnings statement for ${report.meta.athlete} · Private`,
    report.meta.footnote,
  );

  return doc.output("blob");
}
