/* --------------------------------------------------------------------------
   P6-ART-01 — printable QR formats, from the Claude Design canvas
   (claude.ai/artifact/UmkyjWppiZ2PPDoeJ5RnBU). The physical specs every
   template honours, so a printed code actually scans:

     poster   11×17 in   QR 4 in     (minimum 3 in)
     tent     4×12 in flat, folds to two 4×6 faces   QR 1.75 in (minimum 1.5 in)
     sticker  3×3 in     QR 1.25 in  (minimum 1 in)

   Quiet zone ≥ 4 modules on a plain white panel, nothing overlapping it. The
   stored PNG carries a 2-module margin (worker/jobs/generate-qr.mts), so the
   panel adds padding of at least QR ÷ 16 — two more modules for any code up
   to version 6 (41 modules), which a /r/<token> URL never exceeds.
   -------------------------------------------------------------------------- */

export type PrintFormat = "poster" | "tent" | "sticker";
export type PrintTheme = "light" | "dark";

export const FORMATS: Record<PrintFormat, { label: string; w: number; h: number; qr: number; minQr: number }> = {
  poster: { label: "Poster · 11×17 in", w: 11, h: 17, qr: 4, minQr: 3 },
  tent: { label: "Table tent · 4×6 in folded", w: 4, h: 12, qr: 1.75, minQr: 1.5 },
  sticker: { label: "Counter sticker · 3×3 in", w: 3, h: 3, qr: 1.25, minQr: 1 },
};

export function formatOf(v: unknown): PrintFormat {
  return v === "tent" || v === "sticker" ? v : "poster";
}
export function themeOf(v: unknown): PrintTheme {
  return v === "dark" ? "dark" : "light";
}

/** The white panel's padding (inches) that brings the quiet zone to ≥ 4 modules. */
export function quietPad(qrInches: number): number {
  return Math.round((qrInches / 16) * 1000) / 1000;
}

/** The short web address printed under the code, for anyone who can't scan. */
export function fallbackAddress(appUrl: string, token: string): string {
  const host = appUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `${host}/r/${token}`;
}
