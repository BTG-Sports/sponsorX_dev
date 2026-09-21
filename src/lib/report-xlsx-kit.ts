import type ExcelJS from "exceljs";

/* --------------------------------------------------------------------------
   Shared plumbing for the client-side XLSX exporters — brand colors, number
   formats and the two cell-styling helpers every workbook uses.
   -------------------------------------------------------------------------- */

export const BRAND = "FF1669B3"; // --sx-primary, light theme
export const MUTED = "FF6B7280";
export const WARN = "FFB14D09";

export const FMT_INT = "#,##0";
export const FMT_MONEY = '"$"#,##0';
export const FMT_PCT = "0.0%";
export const FMT_PCT0 = "0%";

export function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { vertical: "middle" };
  });
  row.height = 20;
}

export function sectionTitle(ws: ExcelJS.Worksheet, text: string): ExcelJS.Row {
  const row = ws.addRow([text.toUpperCase()]);
  row.font = { bold: true, size: 10, color: { argb: BRAND } };
  return row;
}

/** Title + subtitle lines at the top of a Summary sheet. */
export function titleBlock(
  ws: ExcelJS.Worksheet,
  title: string,
  subLines: string[],
  mergeCols: number,
) {
  const t = ws.addRow([title]);
  t.font = { bold: true, size: 15 };
  ws.mergeCells(t.number, 1, t.number, mergeCols);
  for (const line of subLines) {
    ws.addRow([line]).font = { size: 10, color: { argb: MUTED } };
  }
  ws.addRow([]);
}
