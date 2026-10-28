/**
 * Open a document upload and measure it — P8-BE-09 (is it usable) and the
 * input to P8-BE-11 (what it says).
 *
 * Runs at the confirm step on the bytes that actually arrived in the
 * private bucket. The verdicts are domain/document-check-rules.ts; this
 * file only opens and measures:
 *
 *   - a photo (JPEG, PNG, WebP) through sharp: its size, its brightness,
 *     how much is on it, and how sharp its edges are;
 *   - a PDF through pdf.js: that it opens without a password and has pages,
 *     and its own words. A PDF with no words of its own is a scan, so its
 *     first pages are drawn as pictures (@napi-rs/canvas) and the first is
 *     measured like a photo.
 *
 * The pictures it hands back (a photo, or a scan's pages) are what the
 * document reader runs OCR on (lib/ocr.ts). Nothing here is stored.
 *
 * pdf.js reads untrusted files, so it runs with no font loading and a time
 * limit (pdf.js 6 never evaluates code from a file); sharp refuses a picture of more than 50 million pixels.
 */
import sharp from "sharp";

import {
  fileProblemWords, mediaTypeOf, pictureProblem, sniffType,
  type FileProblem, type PictureMeasure,
} from "../domain/document-check-rules";

export type InspectedDocument = {
  /** A PDF's own words (empty for a photo or a scan). */
  text: string;
  /** Pictures to read with OCR: the photo itself, or a scan's first pages. */
  pictures: Buffer[];
  measure: PictureMeasure | null;
};

export type Inspection =
  | { ok: true; document: InspectedDocument }
  | { ok: false; problem: FileProblem; reason: string };

/** A scan's pages drawn for OCR; the first is also measured. */
const SCAN_PAGES = 2;
/** A PDF's own words, from at most this many pages. */
const TEXT_PAGES = 3;
/** Words enough to call a PDF a real text document rather than a scan. */
const TEXT_LAYER_CHARACTERS = 40;
const INSPECT_TIMEOUT_MS = 20_000;
const MAX_PIXELS = 50_000_000;

const refuse = (problem: FileProblem, what: "photo" | "page" = "photo"): Inspection => ({ ok: false, problem, reason: fileProblemWords(problem, what) });

/** Size, brightness, spread and sharpness — the numbers pictureProblem() judges. */
export async function measurePicture(bytes: Buffer): Promise<PictureMeasure> {
  const meta = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata();
  const turned = (meta.orientation ?? 1) >= 5;
  const width = (turned ? meta.height : meta.width) ?? 0;
  const height = (turned ? meta.width : meta.height) ?? 0;
  const grey = sharp(bytes, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .flatten({ background: "#ffffff" })
    .greyscale()
    .resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true });
  /* sharp's stats() describes its INPUT, not its output: each step is
     written out as raw pixels first, then measured. */
  const flat = await grey.raw().toBuffer({ resolveWithObject: true });
  const shape = { raw: { width: flat.info.width, height: flat.info.height, channels: 1 as const } };
  const edges = await sharp(flat.data, shape)
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], scale: 1, offset: 128 })
    .raw().toBuffer();
  const stats = await sharp(flat.data, shape).stats();
  return { width, height, mean: stats.channels[0]!.mean, spread: stats.channels[0]!.stdev, sharpness: strongestEdges(edges) };
}

/**
 * How strong the strongest edges are: the edge filter's 99th percentile.
 * Not its average — a card photographed on a plain table is mostly table,
 * and the table would drown a sharp card. Blur softens every edge, so even
 * the strongest fall.
 */
function strongestEdges(edges: Buffer): number {
  const counts = new Array<number>(129).fill(0);
  for (const v of edges) counts[Math.abs(v - 128)]!++;
  let seen = 0;
  const target = edges.length * 0.99;
  for (let m = 0; m < counts.length; m++) {
    seen += counts[m]!;
    if (seen >= target) return m;
  }
  return 128;
}

async function inspectPicture(bytes: Buffer, what: "photo" | "page"): Promise<Inspection> {
  let measure: PictureMeasure;
  try {
    measure = await measurePicture(bytes);
  } catch {
    return refuse("damaged");
  }
  const problem = pictureProblem(measure);
  if (problem) return refuse(problem, what);
  return { ok: true, document: { text: "", pictures: [bytes], measure } };
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjs: Promise<PdfJs> | null = null;
/** pdf.js is large: loaded on the first PDF, never at boot. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs;
}

async function inspectPdf(bytes: Buffer): Promise<Inspection> {
  const lib = await loadPdfJs();
  const task = lib.getDocument({
    data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false,
    stopAtErrors: false, verbosity: 0,
  });
  let pdf: Awaited<typeof task.promise>;
  try {
    pdf = await task.promise;
  } catch (error) {
    await task.destroy().catch(() => {});
    return refuse((error as { name?: string }).name === "PasswordException" ? "locked" : "damaged");
  }
  try {
    if (pdf.numPages < 1) return refuse("no_pages");
    const words: string[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, TEXT_PAGES); n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      words.push(content.items.map((i) => ("str" in i ? i.str : "")).join(" "));
    }
    const text = words.join("\n");
    if (text.replace(/\s+/g, "").length >= TEXT_LAYER_CHARACTERS) {
      return { ok: true, document: { text, pictures: [], measure: null } };
    }
    /* A scan: draw its first pages, judge the first like a photo, and hand them all to OCR. */
    const pictures: Buffer[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, SCAN_PAGES); n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(4, 1600 / Math.max(base.width, base.height)) });
      const factory = pdf.canvasFactory as { create(width: number, height: number): { canvas: { toBuffer(type: "image/png"): Buffer }; context: unknown } };
      const { canvas, context } = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: context, canvas, viewport } as unknown as Parameters<typeof page.render>[0]).promise;
      pictures.push(canvas.toBuffer("image/png"));
    }
    const first = await inspectPicture(pictures[0]!, "page");
    if (!first.ok) return first;
    return { ok: true, document: { text, pictures, measure: first.document.measure } };
  } catch {
    return refuse("damaged");
  } finally {
    await task.destroy().catch(() => {});
  }
}

/**
 * Open a document and say whether it is usable. `declaredType` is what the
 * upload grant was signed for; the file's own first bytes must agree.
 */
export async function inspectDocument(bytes: Buffer, declaredType: string): Promise<Inspection> {
  const declared = mediaTypeOf(declaredType);
  const sniffed = sniffType(bytes.subarray(0, 1024));
  if (!sniffed || sniffed !== declared) return refuse(bytes.length === 0 ? "damaged" : "not_its_type");
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<Inspection>((resolve) => {
    timer = setTimeout(() => resolve(refuse("too_slow")), INSPECT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([sniffed === "application/pdf" ? inspectPdf(bytes) : inspectPicture(bytes, "photo"), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
