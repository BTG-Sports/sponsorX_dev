/**
 * P9-BE-25 — files of ANY format (owner, 2026-11-19: the magazine takes "any
 * format": photos, video, PDFs, InDesign, Photoshop …). Pure rules, no I/O.
 *
 * Any format is accepted into the PRIVATE bucket, signed for the exact type
 * and size the browser declared and checked on arrival like every other
 * private upload. What changes is how a file is handed back: only what a
 * browser shows safely (an image other than SVG, a video, audio, a PDF) may
 * open in place. Everything else — an HTML page, an SVG (it can carry
 * script), a design file, an archive — is served as a download, so a file
 * someone uploaded can never run as a page.
 */

/** 2 GB — a long 4K video fits. Decimal, so the size fits a 32-bit column. */
export const ANY_FILE_MAX_BYTES = 2_000_000_000;

/** What a browser sends when it can't name the type (an .indd, a .psd). */
export const UNKNOWN_FILE_TYPE = "application/octet-stream";

/** `type/subtype` — RFC 6838's restricted names, which every real type fits. */
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

/**
 * The declared type as it will be signed into the PUT: lowercased, without
 * parameters ("video/mp4; codecs=avc1" → "video/mp4"). An empty type is a
 * file the browser couldn't name, and becomes `application/octet-stream`.
 * Null when the declaration isn't a media type at all.
 */
export function anyFileType(declared: string | null | undefined): string | null {
  const t = (declared ?? "").split(";")[0]!.trim().toLowerCase();
  if (!t) return UNKNOWN_FILE_TYPE;
  return MEDIA_TYPE.test(t) ? t : null;
}

/** Whether a browser may open this type in place. Everything else downloads. */
export function opensInPlace(type: string | null | undefined): boolean {
  const t = (type ?? "").split(";")[0]!.trim().toLowerCase();
  if (t === "image/svg+xml") return false;
  return t.startsWith("image/") || t.startsWith("video/") || t.startsWith("audio/") || t === "application/pdf";
}

/** An image or a video — what the public reader can show (P9-BE-26). */
export function isPicture(type: string | null | undefined): boolean {
  const t = (type ?? "").split(";")[0]!.trim().toLowerCase();
  return (t.startsWith("image/") && t !== "image/svg+xml") || t.startsWith("video/");
}

/** A file name safe to keep and to put in a download header. */
export function safeFileName(name: string | null | undefined): string | null {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  const clean = base.normalize("NFKD").replace(/[^A-Za-z0-9._ -]+/g, "-").replace(/\.{2,}/g, ".").replace(/^[-. ]+/, "").trim().slice(-120);
  return clean || null;
}

/**
 * The Content-Disposition a signed read asks storage to send: `attachment`
 * for a type a browser mustn't open in place, with the file's name when it
 * has one; nothing (open in place) otherwise.
 */
export function downloadDisposition(type: string | null | undefined, name?: string | null): string | null {
  if (opensInPlace(type)) return null;
  const file = safeFileName(name);
  return file ? `attachment; filename="${file.replace(/"/g, "")}"` : "attachment";
}
