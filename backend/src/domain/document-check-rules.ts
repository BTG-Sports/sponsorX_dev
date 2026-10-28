/**
 * Document checks — the rules (P8-BE-09, P8-BE-11). Pure.
 *
 * Found 2026-10-28: a government ID arrived as an almost black, blurred
 * photo, and nothing stopped it — the upload checked the declared type, the
 * size and that the file arrived, and nothing ever opened the file.
 *
 * Two levels, both run on our own server:
 *
 *   A. IS THE FILE USABLE (P8-BE-09) — refused on the spot, in words the
 *      person can act on: the file is what it says (its own first bytes),
 *      it opens, and a photo (or a scanned PDF's first page) is big enough,
 *      not too dark, not washed out, not blank and not blurred. The
 *      measuring is lib/document-inspect.ts; the verdict is here.
 *
 *   B. DOES IT SAY THE RIGHT THING (P8-BE-11) — never refused, only
 *      flagged: the words read off the document are compared with what the
 *      record says — the right name, the right kind of document, not
 *      expired, the athlete's date of birth. A flagged or unread document
 *      holds the automatic approval it belongs to for BTG, with these
 *      findings as the reasons (the Phase 2 rule: automatic when every
 *      check passes, held with the reason when one fails).
 *
 * OCR on a phone photo misreads letters, so the comparison forgives a
 * slip: a word may be one letter off, and the case, accents and
 * punctuation are ignored. It never forgives a missing name.
 */

/* ═════════════════════════ A · the file itself ═════════════════════════ */

/** The types a document upload may be. */
export type DocumentType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

/** What a file's own first bytes say it is, or null. */
export function sniffType(head: Uint8Array): DocumentType | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((b, j) => head[i + j] === b);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  /* A PDF may carry a few bytes of junk before its header; readers accept it within the first kilobyte. */
  const window = Math.min(head.length, 1024);
  for (let i = 0; i + 5 <= window; i++) if (at(i, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  return null;
}

/** The media type alone, lowercased. */
export const mediaTypeOf = (t: string | null | undefined) => (t ?? "").split(";")[0]!.trim().toLowerCase();

/**
 * What the picture measured. `mean` and `spread` are the greyscale
 * brightness (0–255) and its standard deviation; `sharpness` is how strong
 * its strongest edges are (the 99th percentile of an edge filter, a
 * Laplacian, on the picture scaled to at most 1000 px, 0–128) — blur
 * softens every edge.
 */
export type PictureMeasure = { width: number; height: number; mean: number; spread: number; sharpness: number };

/*
 * The limits. Calibrated on tests/fixtures-style pictures (an ID card drawn
 * at 1000 × 630, then darkened, blurred, shrunk and washed out) and on the
 * real near-black upload of 2026-10-28; see tests/document-checks.test.ts.
 * Set to refuse only the clearly unusable: a passing photo may still be
 * poor, and Level B and BTG catch the rest.
 */
export const PICTURE_LIMITS = {
  /** A card photographed from arm's length is far bigger; a thumbnail is not readable. */
  minShortSide: 400,
  minLongSide: 600,
  /** Below this average brightness a person can't make the words out. The 2026-10-28 upload measured 12. */
  darkMean: 50,
  /** Almost nothing on it: one flat colour. */
  blankSpread: 10,
  /** Washed out: almost white and almost flat — glare, or a blown-out exposure. */
  washedMean: 240,
  washedSpread: 18,
  /** Edges too soft to read. A crisp card reaches the top (128), a phone photo about 70, one blurred until OCR only just reads it (3 px) 11,
   *  one blurred past reading (4 px) 6; the 2026-10-28 upload, 6. */
  blurSharpness: 9,
} as const;

export type PictureProblem = "too_small" | "too_dark" | "blank" | "washed_out" | "blurry";

/**
 * The first reason this picture can't be read, or null: size, then dark,
 * washed out, blank, blurred. A scanned PDF's `page` is white paper by
 * nature, so it is never "washed out" — only blank when there's nothing on it.
 */
export function pictureProblem(m: PictureMeasure, what: "photo" | "page" = "photo"): PictureProblem | null {
  const short = Math.min(m.width, m.height), long = Math.max(m.width, m.height);
  if (short < PICTURE_LIMITS.minShortSide || long < PICTURE_LIMITS.minLongSide) return "too_small";
  if (m.mean < PICTURE_LIMITS.darkMean) return "too_dark";
  /* Almost white and flat reads as glare before it reads as blank: retaking it without the light is the fix. */
  if (what === "photo" && m.mean > PICTURE_LIMITS.washedMean && m.spread < PICTURE_LIMITS.washedSpread) return "washed_out";
  if (m.spread < PICTURE_LIMITS.blankSpread) return "blank";
  if (m.sharpness < PICTURE_LIMITS.blurSharpness) return "blurry";
  return null;
}

export type FileProblem = PictureProblem | "not_its_type" | "damaged" | "locked" | "no_pages" | "too_slow";

/** What the person reads when their file is refused. `page` when it was a scanned PDF's page, not a photo. */
export function fileProblemWords(p: FileProblem, what: "photo" | "page" = "photo"): string {
  const it = what === "page" ? "The first page of that PDF" : "That photo";
  switch (p) {
    case "not_its_type": return "That file isn't really the kind of file its name says — it may have been renamed. Upload the original PDF, JPEG or PNG.";
    case "damaged": return "That file is damaged and won't open. Upload it again, or take a new photo.";
    case "locked": return "That PDF is password-protected, so it can't be checked. Upload a copy without the password.";
    case "no_pages": return "That PDF has no pages. Upload the document itself.";
    case "too_slow": return "That file took too long to open. Upload a photo of the document, or a simpler PDF.";
    case "too_small": return `${it} is too small to read. Take the photo closer, or upload a larger file.`;
    case "too_dark": return `${it} is too dark to read. Retake it in good light, with no shadow on it.`;
    case "blank": return `There's nothing readable on ${what === "page" ? "the first page of that PDF" : "that photo"}. Upload the document itself.`;
    case "washed_out": return `${it} is washed out — too much light or glare. Retake it without the flash, away from bright light.`;
    case "blurry": return `${it} is blurred. Hold the camera still, let it focus, and retake it.`;
  }
}

/* ═════════════════════ B · what the document says ══════════════════════ */

/** What kind of document it should read as; null when the kind can't be judged from its words. */
export type ReadKind =
  | "GOVERNMENT_ID" | "SCHOOL_ID" | "BIRTH_CERTIFICATE" | "COURT_ORDER" | "SCHOOL_RECORD"
  | "BUSINESS_REGISTRATION" | "AGREEMENT";

/** Each kind's words: every group must match at least once. */
const KIND_WORDS: Record<ReadKind, RegExp[]> = {
  GOVERNMENT_ID: [/\b(DRIVER|DRIVERS|LICEN[CS]E|IDENTIFICATION|IDENTITY|PASSPORT|ID CARD|IDENTIFICATION CARD|PERMIT|REAL ID|STATE ID|RESIDENT|DL)\b/],
  SCHOOL_ID: [/\b(SCHOOL|STUDENT|ACADEMY|COLLEGE|UNIVERSITY|DISTRICT|ISD|PREP|HIGH|MIDDLE|ELEMENTARY)\b/],
  BIRTH_CERTIFICATE: [/\bBIRTH\b/, /\b(CERTIFICATE|CERTIFICATION|CERTIFIED|RECORD|REGISTRATION|REGISTRAR)\b/],
  COURT_ORDER: [/\bCOURT\b/, /\b(ORDER|ORDERED|GUARDIAN|GUARDIANSHIP|CUSTODY|DECREE|JUDGMENT|JUDGEMENT|LETTERS)\b/],
  SCHOOL_RECORD: [/\b(SCHOOL|STUDENT|DISTRICT|ACADEMY|ENROLLMENT|ENROLMENT|REGISTRATION|PARENT|GUARDIAN)\b/],
  BUSINESS_REGISTRATION: [/\b(REGISTRATION|REGISTERED|CERTIFICATE|ARTICLES|INCORPORATION|INCORPORATED|ORGANIZATION|ORGANISATION|FORMATION|SECRETARY OF STATE|GOOD STANDING|LIMITED LIABILITY|CORPORATION|BUSINESS LICEN[CS]E)\b/],
  AGREEMENT: [/\b(AGREEMENT|CONTRACT)\b/],
};

/** How each kind is named in a finding. */
export const KIND_NAMES: Record<ReadKind, string> = {
  GOVERNMENT_ID: "a government ID",
  SCHOOL_ID: "a school ID",
  BIRTH_CERTIFICATE: "a birth certificate",
  COURT_ORDER: "a court order",
  SCHOOL_RECORD: "a school record",
  BUSINESS_REGISTRATION: "a business registration",
  AGREEMENT: "an agreement",
};

/** A person's name (first and last must both show) or a business's (most of its words must). */
export type ExpectedName = { who: string; name: string; kind: "person" | "business" };

export type ReadExpectation = {
  /** What the document is called in BTG's reasons: "Government ID", "Proof of guardianship". */
  label: string;
  names: readonly ExpectedName[];
  kind: ReadKind | null;
  /** Look for an expiry date and flag one in the past. */
  expires: boolean;
  /** The athlete's date of birth on record, for their own ID. */
  birthDate: Date | null;
};

export type FindingCode = "NO_TEXT" | "NAME_NOT_FOUND" | "KIND_NOT_FOUND" | "EXPIRED" | "BIRTH_DATE_NOT_FOUND";
export type Finding = { code: FindingCode; says: string };
export type ReadState = "CLEAR" | "FLAGGED" | "UNREAD";
export type ReadResult = { state: ReadState; findings: Finding[] };

/** Upper-case letters and digits only, accents dropped, everything else one space. */
export function normalizeWords(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

/** Edit distance, stopping early once it passes `max`. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]!);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length]! <= max;
}

/** One word of a name, in the document's words: exactly, or one letter off for a word of five letters or more. */
function wordFound(word: string, words: readonly string[]): boolean {
  if (words.includes(word)) return true;
  if (word.length < 5) return false;
  return words.some((w) => within(word, w, 1));
}

const NAME_SUFFIXES = new Set(["JR", "SR", "II", "III", "IV"]);
const BUSINESS_FILLER = new Set(["THE", "AND", "OF", "LLC", "L", "INC", "CO", "CORP", "CORPORATION", "COMPANY", "LTD", "LLP", "PLLC", "PC"]);

/** Is this name on the document? */
export function nameFound(expected: ExpectedName, text: string): boolean {
  const words = normalizeWords(text).split(" ");
  const parts = normalizeWords(expected.name).split(" ").filter(Boolean);
  if (expected.kind === "person") {
    const tokens = parts.filter((t) => t.length > 1 && !NAME_SUFFIXES.has(t));
    if (!tokens.length) return true;
    const first = tokens[0]!, last = tokens[tokens.length - 1]!;
    return wordFound(first, words) && wordFound(last, words);
  }
  const tokens = parts.filter((t) => t.length > 1 && !BUSINESS_FILLER.has(t));
  if (!tokens.length) return true;
  const found = tokens.filter((t) => wordFound(t, words)).length;
  return found >= Math.ceil((tokens.length * 2) / 3);
}

export function kindFound(kind: ReadKind, text: string): boolean {
  const t = ` ${normalizeWords(text)} `;
  return KIND_WORDS[kind].every((re) => re.test(t));
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** A calendar date as UTC midnight, or null if it isn't one. */
function dateOf(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 ? date : null;
}

const fullYear = (y: string, now: Date) => {
  if (y.length === 4) return Number(y);
  const n = Number(y), cut = (now.getUTCFullYear() % 100) + 15;
  return n <= cut ? 2000 + n : 1900 + n;
};

/**
 * Every date written on the document, with where it sits. `alt` is the
 * day-and-month swapped reading of an all-number date (03/04/2005 is
 * 4 March outside the US), used only when matching a birth date.
 */
export function datesIn(text: string, now = new Date()): { at: number; date: Date; alt: Date | null }[] {
  const t = text.toUpperCase();
  const out: { at: number; date: Date; alt: Date | null }[] = [];
  for (const m of t.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    const d = dateOf(Number(m[1]), Number(m[2]), Number(m[3]));
    if (d) out.push({ at: m.index!, date: d, alt: null });
  }
  for (const m of t.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g)) {
    const y = fullYear(m[3]!, now), a = Number(m[1]), b = Number(m[2]);
    const us = dateOf(y, a, b), other = dateOf(y, b, a);
    if (us ?? other) out.push({ at: m.index!, date: (us ?? other)!, alt: us && other && a !== b ? other : null });
  }
  for (const m of t.matchAll(/\b(\d{1,2})\s*([A-Z]{3})[A-Z]*\.?,?\s*(\d{4})\b/g)) {
    const d = dateOf(Number(m[3]), MONTHS.indexOf(m[2]!) + 1, Number(m[1]));
    if (d) out.push({ at: m.index!, date: d, alt: null });
  }
  for (const m of t.matchAll(/\b([A-Z]{3})[A-Z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) {
    const d = dateOf(Number(m[3]), MONTHS.indexOf(m[1]!) + 1, Number(m[2]));
    if (d) out.push({ at: m.index!, date: d, alt: null });
  }
  return out.sort((x, y) => x.at - y.at);
}

/** The words that mark an expiry date, within a short reach before it. */
const EXPIRY_LABEL = /(EXP|EXPIRES|EXPIRATION|EXPIRY|VALID UNTIL|VALID THRU|VALID THROUGH|GOOD THROUGH|4B)\W{0,6}$/;

/** The latest date labelled as an expiry, or null when none is labelled. */
export function expiryIn(text: string, now = new Date()): Date | null {
  const t = text.toUpperCase();
  let latest: Date | null = null;
  for (const d of datesIn(text, now)) {
    const before = t.slice(Math.max(0, d.at - 24), d.at).replace(/\s+/g, " ");
    if (EXPIRY_LABEL.test(before) && (!latest || d.date > latest)) latest = d.date;
  }
  return latest;
}

const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

/** "03/14/2005", the way US documents print it. */
export const usDate = (d: Date) =>
  `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;

/** Enough letters and digits to call it read: a real document has far more. */
export const MIN_READ_CHARACTERS = 20;

/** Compare what was read with what the record says. Never refuses: findings only. */
export function readFindings(text: string, expect: ReadExpectation, now = new Date()): ReadResult {
  const characters = normalizeWords(text).replace(/ /g, "").length;
  if (characters < MIN_READ_CHARACTERS) {
    return { state: "UNREAD", findings: [{ code: "NO_TEXT", says: "No words could be read on it — check it by eye" }] };
  }
  const findings: Finding[] = [];
  for (const n of expect.names) {
    if (!nameFound(n, text)) findings.push({ code: "NAME_NOT_FOUND", says: `${n.who} (${n.name.trim()}) isn't named on it` });
  }
  if (expect.kind && !kindFound(expect.kind, text)) {
    findings.push({ code: "KIND_NOT_FOUND", says: `It doesn't read like ${KIND_NAMES[expect.kind]}` });
  }
  if (expect.expires) {
    const expiry = expiryIn(text, now);
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (expiry && expiry < today) findings.push({ code: "EXPIRED", says: `It looks expired: ${usDate(expiry)}` });
  }
  if (expect.birthDate) {
    const dob = expect.birthDate;
    const match = datesIn(text, now).some((d) => sameDay(d.date, dob) || (d.alt !== null && sameDay(d.alt, dob)));
    if (!match) findings.push({ code: "BIRTH_DATE_NOT_FOUND", says: `The date of birth on the account (${usDate(dob)}) isn't on it` });
  }
  return { state: findings.length ? "FLAGGED" : "CLEAR", findings };
}

/** One finding as a hold reason BTG reads beside the application. */
export const holdReason = (label: string, f: Pick<Finding, "says">) => `Document check — ${label}: ${f.says}`;
