import { fileSizeWords } from "@/lib/direct-upload";

/* --------------------------------------------------------------------------
   P9-FE-15 — an edition's cover image and its press PDF (P9-BE-27).

     POST /editions/:id/cover/uploads      {contentType, bytes} → {url, key, contentType}
     PUT  /editions/:id/cover              {r2Key, fileName}    record it (replaces the one before)
     GET  /editions/:id/cover              → {url, type}        a signed read, for the preview
     POST /editions/:id/press-pdf/uploads  the same, for the printer's PDF
     PUT  /editions/:id/press-pdf
     GET  /editions/:id/press-pdf          → {url, fileName, bytes}   BTG's signed read, a download
     GET  /editions/:id                    carries `cover` and `pressPdf`

   The cover is a JPG, PNG or WebP up to 50 MB and is shown in the reader
   once the edition is published. The press PDF is a PDF up to 2 GB and never
   goes public. The API decides (and checks what arrived, when it is
   recorded); these are the same rules said before anything is sent, in the
   API's own words, and the lines the page shows.
   -------------------------------------------------------------------------- */

/** GET /editions/:id — `cover`, or null when there is none. */
export type ApiEditionCover = { type: string; bytes: number | null; uploadedAt: string | null };
/** GET /editions/:id — `pressPdf`, or null when there is none. */
export type ApiEditionPressPdf = { fileName: string | null; bytes: number; uploadedAt: string | null };

export type EditionFileKind = "cover" | "press-pdf";

export const COVER_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];
export const COVER_ACCEPT = COVER_TYPES.join(",");
/** 50 MB, binary — the API's MAX_WEB_PHOTO_BYTES. */
export const COVER_MAX_BYTES = 50 * 1024 * 1024;
export const PRESS_PDF_ACCEPT = "application/pdf,.pdf";
/** 2 GB, decimal — the API's cap for any file. */
export const PRESS_PDF_MAX_BYTES = 2_000_000_000;

export const EDITION_FILE_WORDS: Record<EditionFileKind, { name: string; rule: string; where: string }> = {
  cover: {
    name: "cover",
    rule: "JPG, PNG or WebP, up to 50 MB",
    where: "Shown in the reader and the edition list once the edition is published.",
  },
  "press-pdf": {
    name: "press PDF",
    rule: "PDF, up to 2 GB",
    where: "Private: only BTG opens it, on a short signed link, and each open is recorded.",
  },
};

/** The type to declare for the grant. A PDF the browser didn't name is still
 *  a PDF by its extension; anything else is declared as the browser names it. */
export function declaredType(which: EditionFileKind, file: { type: string; name: string }): string {
  if (which === "press-pdf" && !file.type && /\.pdf$/i.test(file.name)) return "application/pdf";
  return file.type;
}

/** Why this file can't be the cover / the press PDF, or null — the API's own
 *  refusals, said before anything is sent. */
export function editionFileProblem(which: EditionFileKind, file: { type: string; size: number; name: string }): string | null {
  if (!file.size) return "That file is empty — choose another.";
  const type = declaredType(which, file).split(";")[0]!.trim().toLowerCase();
  if (which === "cover") {
    if (!COVER_TYPES.includes(type)) return "Upload the cover as a JPG, PNG or WebP.";
    if (file.size > COVER_MAX_BYTES) return "Keep the cover under 50 MB.";
    return null;
  }
  if (type !== "application/pdf") return "Upload the press file as a PDF.";
  if (file.size > PRESS_PDF_MAX_BYTES) return "Keep the press PDF under 2 GB.";
  return null;
}

const day = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

const PICTURE: Record<string, string> = { "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WebP" };

/** "PNG · 1.2 MB · uploaded Nov 19" — or null when the edition has no cover. */
export function coverLine(cover: ApiEditionCover | null | undefined): string | null {
  if (!cover) return null;
  const up = day(cover.uploadedAt);
  return [PICTURE[cover.type] ?? "Picture", cover.bytes ? fileSizeWords(cover.bytes) : null, up ? `uploaded ${up}` : null].filter(Boolean).join(" · ");
}

/** "fall-2026-press.pdf · 48 MB · uploaded Nov 19" — or null when there is none. */
export function pressPdfLine(pdf: ApiEditionPressPdf | null | undefined): string | null {
  if (!pdf) return null;
  const up = day(pdf.uploadedAt);
  return [pdf.fileName ?? "Press PDF", fileSizeWords(pdf.bytes), up ? `uploaded ${up}` : null].filter(Boolean).join(" · ");
}

/** A cancelled edition takes no file (the API answers 409); every other state can add or replace. */
export function takesEditionFiles(state: string): boolean {
  return state !== "CANCELLED";
}

/** What the press PDF is for, given whether the edition is printed. */
export function pressPdfNeed(printDate: string | null | undefined, has: boolean): string {
  if (has) return "The printer's file.";
  return printDate ? "Needed before the edition goes to print." : "Only needed if the edition is printed.";
}
