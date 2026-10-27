import { jsPDF } from "jspdf";
import type { CampaignResultsReport } from "@/lib/campaign-results-report";
import { formatCount } from "@/lib/format-count";
import { INK, MARGIN, MUTED, PAGE_W, footers, headerBand, heading, note, num, paragraphs, pct, table } from "@/lib/report-pdf-kit";

/* --------------------------------------------------------------------------
   PDF renderer for CampaignResultsReport — a campaign's results page (real,
   or a sample labelled as one) as a document the sponsor can keep.
   Dynamic-imported by the export island, so jspdf stays out of the page
   bundle. Sections follow the screen: the four headline figures, where the
   reach comes from, the fan journey, best athletes, athletes, link clicks by
   post, what stands out, edition placements, then the notes.
   -------------------------------------------------------------------------- */

export function generateCampaignResultsPdf(report: CampaignResultsReport): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const h = report.headline;

  let y = headerBand(doc, {
    title: report.meta.title,
    subtitle: report.meta.campaign,
    sub2: `${report.meta.status} · ${report.meta.period}`,
  });

  if (report.meta.objective) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    const wrapped: string[] = doc.splitTextToSize(report.meta.objective, PAGE_W - MARGIN * 2);
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 11 + 10;
  }

  /* -------------------------------------------------------------- headline */
  y = heading(doc, y, "Results so far");
  y = table(doc, {
    startY: y,
    head: [["Figure", "Value", "How it's counted"]],
    body: [
      [
        "People reached",
        num(h.reached),
        h.otherReach > 0
          ? `Checked by the platform or BTG. ${num(h.otherReach)} more from other sources, not added in.`
          : "Checked by the platform or BTG.",
      ],
      [
        "Likes, comments & shares",
        num(h.engagements),
        h.engagementRate === null ? "On checked posts." : `On checked posts · ${pct(h.engagementRate)} of people reached.`,
      ],
      [
        "Fans who redeemed",
        num(h.redeemed),
        h.issued > 0 ? `Of ${num(h.issued)} offers issued.` : "Fans who scanned your QR code and used your offer.",
      ],
      [
        "What you pay per 1,000 people reached",
        /* Cents, as the screen's tile prints it ("$417.81", not "$418"). */
        h.costPerThousandCents === null ? "—" : formatCount(h.costPerThousandCents, "usd"),
        h.costPerThousandCents === null ? "No checked reach yet." : h.costBasis,
      ],
    ],
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 140 },
      1: { fontStyle: "bold", cellWidth: 80, halign: "right" },
      2: { textColor: MUTED },
    },
  });

  /* --------------------------------------------------------------- sources */
  y = heading(doc, y + 22, "How sure are we? — reach by source", 120);
  if (report.sources.length === 0) {
    y = note(doc, y - 8, "No reach recorded yet. Figures appear once posts are live and checked.");
  } else {
    y = table(doc, {
      startY: y,
      head: [["Source", "Checked", "People reached", "Likes, comments & shares"]],
      body: report.sources.map((s) => [s.label, s.checked ? "Yes" : "No", num(s.views), num(s.engagements)]),
      columnStyles: { 0: { fontStyle: "bold" }, 2: { halign: "right" }, 3: { halign: "right" } },
    });
    y = note(doc, y, "Each source is shown on its own. They are never added together.");
  }

  /* ---------------------------------------------------------------- funnel */
  y = heading(doc, y + 12, "From scan to redeemed", 130);
  y = table(doc, {
    startY: y,
    head: [["Step", "Fans"]],
    body: report.funnel.map((f) => [f.stage, num(f.fans)]),
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" } },
  });

  /* -------------------------------------------------------------- athletes */
  if (report.bestAthletes && report.bestAthletes.rows.length > 0) {
    y = heading(doc, y + 22, `Best athletes — checked reach, ${report.bestAthletes.window}`, 120);
    y = table(doc, {
      startY: y,
      head: [["No.", "Athlete", "Sport", "People reached"]],
      body: report.bestAthletes.rows.map((a) => [String(a.rank), a.name, a.sport ?? "—", num(a.reached)]),
      columnStyles: { 0: { halign: "right", cellWidth: 34 }, 1: { fontStyle: "bold" }, 3: { halign: "right" } },
    });
  }

  y = heading(doc, y + 22, "Athletes", 120);
  if (report.athletes.length === 0) {
    y = note(doc, y - 8, "No athletes staffed yet.");
  } else {
    y = table(doc, {
      startY: y,
      head: [["Athlete", "Job", "Order", "Posts checked"]],
      body: report.athletes.map((a) => [a.name, a.job, a.order, `${a.checked}/${a.total}`]),
      columnStyles: { 0: { fontStyle: "bold" }, 3: { halign: "right" } },
    });
  }

  /* ----------------------------------------------------------------- posts */
  y = heading(doc, y + 22, "Link clicks by post", 120);
  if (report.posts.length === 0) {
    y = note(doc, y - 8, "No posts published yet.");
  } else {
    y = table(doc, {
      startY: y,
      head: [["Post", "Status", "Published", "Clicks", "Link"]],
      body: report.posts.map((p) => [p.title, p.status, p.publishedAt ?? "—", num(p.clicks), p.url ?? "—"]),
      columnStyles: { 0: { fontStyle: "bold" }, 3: { halign: "right" }, 4: { textColor: MUTED, cellWidth: 150 } },
    });
  }

  /* ------------------------------------------------------- what stands out */
  if (report.observations.length > 0) {
    y = heading(doc, y + 22, "What stands out", 100);
    y = paragraphs(doc, y, report.observations, 8);
  }

  if (report.placements) {
    y = heading(doc, y + 12, "Edition placements", 100);
    y = table(doc, {
      startY: y,
      head: [["Positions", "Print QR scans", "Digital link clicks"]],
      body: [[num(report.placements.positions), num(report.placements.printScans), num(report.placements.digitalClicks)]],
      columnStyles: { 0: { halign: "right" }, 1: { halign: "right" }, 2: { halign: "right" } },
    });
    y = note(doc, y, "Print and digital are kept apart.");
  }

  y = heading(doc, y + 12, "How these figures are counted", 120);
  paragraphs(doc, y, report.notes, 7.5);

  footers(doc, `SponsorX · ${report.meta.campaign} · Confidential`, report.meta.footnote);

  return doc.output("blob");
}
