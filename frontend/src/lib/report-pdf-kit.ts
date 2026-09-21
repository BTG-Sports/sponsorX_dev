import { jsPDF } from "jspdf";
import autoTable, { type UserOptions } from "jspdf-autotable";

/* --------------------------------------------------------------------------
   Shared plumbing for the client-side PDF exporters (sponsor dashboard,
   campaign ROI). Palette, page geometry, formatting helpers and the small
   layout vocabulary every report shares: brand header band, section heading,
   bulleted paragraphs, themed autotable, page footers.

   Print palette uses the light-theme brand values from globals.css — the
   dark-theme neons fail on white paper.
   -------------------------------------------------------------------------- */

export const PRIMARY: [number, number, number] = [22, 105, 179]; // --sx-primary (light)
export const INK: [number, number, number] = [31, 36, 48];
export const MUTED: [number, number, number] = [107, 114, 128];
export const WARN: [number, number, number] = [177, 77, 9]; // --sx-accent (light)
export const LINE: [number, number, number] = [229, 231, 235];

export const MARGIN = 44;
export const PAGE_W = 595.28; // A4 portrait, pt
export const PAGE_H = 841.89;

export const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
export const num = (n: number) => n.toLocaleString("en-US");
export const pct = (fraction: number, digits = 1) =>
  `${(fraction * 100).toFixed(digits)}%`;

type WithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

export function table(doc: jsPDF, opts: UserOptions): number {
  autoTable(doc, {
    margin: { left: MARGIN, right: MARGIN, bottom: 56 },
    styles: { font: "helvetica", fontSize: 8, textColor: INK, cellPadding: 4 },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    ...opts,
  });
  return (doc as WithAutoTable).lastAutoTable?.finalY ?? MARGIN;
}

/** Section label; starts a new page when fewer than `need` pts remain. */
export function heading(doc: jsPDF, y: number, text: string, need = 120): number {
  if (y + need > PAGE_H - 56) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...PRIMARY);
  doc.text(text.toUpperCase(), MARGIN, y);
  doc.setDrawColor(...LINE);
  doc.line(MARGIN, y + 5, PAGE_W - MARGIN, y + 5);
  return y + 14;
}

export function paragraphs(
  doc: jsPDF,
  y: number,
  lines: string[],
  size = 8,
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(...MUTED);
  for (const line of lines) {
    const wrapped: string[] = doc.splitTextToSize(line, PAGE_W - MARGIN * 2 - 10);
    if (y + wrapped.length * (size + 3) > PAGE_H - 56) {
      doc.addPage();
      y = MARGIN;
      doc.setFontSize(size);
      doc.setTextColor(...MUTED);
    }
    doc.text("•", MARGIN, y);
    doc.text(wrapped, MARGIN + 10, y);
    y += wrapped.length * (size + 3) + 3;
  }
  return y;
}

/** One-line small note under a table, in muted ink. */
export function note(doc: jsPDF, y: number, text: string): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(text, MARGIN, y + 12, { maxWidth: PAGE_W - MARGIN * 2 });
  return y + 22;
}

/** Brand header band on page 1; returns the y where content starts. */
export function headerBand(
  doc: jsPDF,
  opts: { title: string; subtitle: string; sub2: string },
): number {
  const generated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, PAGE_W, 92, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text(opts.title, MARGIN, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(opts.subtitle, MARGIN, 60);
  doc.setFontSize(8.5);
  doc.text(opts.sub2, MARGIN, 75);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("SponsorX", PAGE_W - MARGIN, 42, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Generated ${generated}`, PAGE_W - MARGIN, 60, { align: "right" });
  return 118;
}

/** Rule + confidentiality line + page numbers on every page. Call last. */
export function footers(doc: jsPDF, left: string, footnote: string): void {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.line(MARGIN, PAGE_H - 40, PAGE_W - MARGIN, PAGE_H - 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(left, MARGIN, PAGE_H - 28);
    doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 28, {
      align: "right",
    });
    doc.text(footnote, MARGIN, PAGE_H - 18, { maxWidth: PAGE_W - MARGIN * 2 });
  }
}
