/**
 * Edition ad artwork, checked on upload, and the trusted-sponsor skip —
 * P9-BE-22 (item 24), the pure half. `edition-artwork.ts` reads the inputs
 * and acts on the verdicts; `artwork-trust.ts` reads the sponsor's record.
 *
 * The programme owner (2026-10-03): Phase 2 makes a step automatic when every
 * safety check passes, and holds it for the right person, with the reason,
 * when one fails. So an ad's file is checked the moment it is recorded:
 *
 *   1. FILE TYPE on an allow-list — PDF, PNG or JPG, the formats a print
 *      and digital ad is supplied in. The type is the one the upload was
 *      presigned for: the artwork grant signs Content-Type into the PUT, so
 *      the stored object has it, and the grant's audit row recorded it
 *      server-side (P5-BE-09's rule). A key with no grant has no type.
 *   2. FILE SIZE — at most ARTWORK_MAX_BYTES. The size is declared when the
 *      upload is presigned and signed into the PUT as Content-Length, so the
 *      stored object is exactly that size; the grant recorded it.
 *   3. DIMENSIONS — SKIPPED, and said so. Nothing records an uploaded ad's
 *      size in pixels: the upload gives none, and the `image.derive` job
 *      works on an athlete's CreativeAsset only (and records no dimensions
 *      either). The reviewer checks the print specs.
 *   4. RESTRICTED WORDS in the text supplied with the artwork. There is no
 *      headline or alt-text field; the only text is the optional title the
 *      uploader gives. With none, the check is skipped and says so. A match
 *      does NOT send the file back: 2S1-BE-18's rule is that a restricted
 *      word never rejects anything by itself, it puts the item in front of
 *      BTG — so a match holds the artwork for BTG's review (never skipped).
 *
 * A failed type or size check sends the upload straight back to whoever
 * supplies it, with the reasons emailed; it never reaches BTG.
 *
 * Pure: no database, no clock.
 */
import { SENSITIVE_CATEGORIES } from "./brand-categories";
import { normalizeContentType } from "./content-check-rules";

export type ArtworkCheckKey = "fileType" | "fileSize" | "dimensions" | "words";
export type ArtworkCheck = { key: ArtworkCheckKey; ok: boolean; text: string };

/** The formats ad artwork is accepted in, with how each is named to a person. */
export const ALLOWED_ARTWORK_TYPES: Readonly<Record<string, string>> = {
  "application/pdf": "PDF",
  "image/png": "PNG image",
  "image/jpeg": "JPG image",
};

export const ALLOWED_ARTWORK_WORDS = "a PDF, or a PNG or JPG image";

/** 50 MB — a print-ready PDF of a full page fits; a video or a mistake doesn't. */
export const ARTWORK_MAX_BYTES = 50 * 1024 * 1024;

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

export type ArtworkCheckInput = {
  /** The type the upload was presigned for; null when the key had no grant. */
  contentType: string | null;
  /** The size the upload was presigned for; null when the key had no grant. */
  bytes: number | null;
  /** The text supplied with the artwork (its title), or null when none was. */
  text: string | null;
  /** Restricted words found in `text` (restricted-words-rules.ts findRestricted). */
  restricted: ReadonlyArray<{ word: string }>;
};

/** Run the checks. Pure. */
export function artworkChecks(input: ArtworkCheckInput): ArtworkCheck[] {
  const out: ArtworkCheck[] = [];

  const type = normalizeContentType(input.contentType);
  if (!type) {
    out.push({ key: "fileType", ok: false, text: `We couldn't tell what kind of file this is — upload it again as ${ALLOWED_ARTWORK_WORDS}` });
  } else if (ALLOWED_ARTWORK_TYPES[type]) {
    out.push({ key: "fileType", ok: true, text: `File type allowed (${ALLOWED_ARTWORK_TYPES[type]})` });
  } else {
    out.push({ key: "fileType", ok: false, text: `The file type (${type}) isn't accepted for ad artwork — upload ${ALLOWED_ARTWORK_WORDS}` });
  }

  const bytes = input.bytes;
  if (bytes === null || !Number.isFinite(bytes)) {
    out.push({ key: "fileSize", ok: false, text: "We couldn't tell how big the file is — upload it again" });
  } else if (bytes <= 0) {
    out.push({ key: "fileSize", ok: false, text: "The file is empty — upload it again" });
  } else if (bytes > ARTWORK_MAX_BYTES) {
    out.push({ key: "fileSize", ok: false, text: `The file is ${mb(bytes)} — the limit is ${mb(ARTWORK_MAX_BYTES)}` });
  } else {
    out.push({ key: "fileSize", ok: true, text: `File size within the limit (${mb(bytes)} of ${mb(ARTWORK_MAX_BYTES)})` });
  }

  out.push({
    key: "dimensions",
    ok: true,
    text: "Size in pixels not checked automatically — nothing records it for ad artwork yet, so the reviewer checks it against the print specs",
  });

  const text = input.text?.trim() ?? "";
  if (!text) {
    out.push({ key: "words", ok: true, text: "No text supplied with the artwork, so there were no words to check — the words in the file itself are read by the reviewer" });
  } else if (input.restricted.length) {
    const words = [...new Set(input.restricted.map((r) => `"${r.word}"`))].join(", ");
    out.push({ key: "words", ok: false, text: `The title uses restricted words (${words}) — BTG reviews it` });
  } else {
    out.push({ key: "words", ok: true, text: "No restricted words in the title" });
  }
  return out;
}

/**
 * What a set of checks means for the upload:
 *   RETURN — a file problem: straight back to its supplier, never to BTG;
 *   HOLD   — restricted words: to BTG's review, never skipped;
 *   PASS   — every check passed: picked up, and maybe skipped (below).
 */
export type ArtworkVerdict = "RETURN" | "HOLD" | "PASS";

const FILE_KEYS: ReadonlySet<ArtworkCheckKey> = new Set(["fileType", "fileSize", "dimensions"]);

export function artworkVerdict(checks: readonly ArtworkCheck[]): ArtworkVerdict {
  if (checks.some((c) => !c.ok && FILE_KEYS.has(c.key))) return "RETURN";
  if (checks.some((c) => !c.ok)) return "HOLD";
  return "PASS";
}

/** The failed checks that send it back, in words — the supplier's to fix. */
export function returnReasons(checks: readonly ArtworkCheck[]): string[] {
  return checks.filter((c) => !c.ok && FILE_KEYS.has(c.key)).map((c) => c.text);
}

/** Read stored checks back defensively (a Json column). */
export function readArtworkChecks(value: unknown): ArtworkCheck[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((c) =>
    c && typeof c === "object" && typeof (c as ArtworkCheck).key === "string" && typeof (c as ArtworkCheck).ok === "boolean" && typeof (c as ArtworkCheck).text === "string"
      ? [{ key: (c as ArtworkCheck).key, ok: (c as ArtworkCheck).ok, text: (c as ArtworkCheck).text }]
      : [],
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   The trusted-sponsor skip
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * How many clean BTG-reviewed artworks make a sponsor trusted. The owner's
 * rule (2026-10-03): a CLEAN record is their last 3 BTG-reviewed ads
 * approved with no BTG revision; any BTG revision among them is a negative
 * record, and BTG reviews. Read as P5-BE-10 reads an athlete's streak —
 * artworks BTG passed after the sponsor's latest BTG revision, that BTG
 * never revised (`artwork-trust.ts`) — so one BTG revision on any of their
 * artwork, a skipped one included, resets the record to 0. Revisions the
 * sponsor asks for on their own ad, and the system's returns from the
 * checks, touch neither clock and never count against them.
 */
export const TRUSTED_ARTWORK_COUNT = 3;

export type SponsorTrust = { trusted: boolean; cleanStreak: number; needed: number };

export function sponsorTrust(clean: number): SponsorTrust {
  const cleanStreak = Math.max(0, Math.min(TRUSTED_ARTWORK_COUNT, Math.floor(clean)));
  return { trusted: cleanStreak >= TRUSTED_ARTWORK_COUNT, cleanStreak, needed: TRUSTED_ARTWORK_COUNT };
}

export type ArtworkSkipInput = {
  /** The sponsor's clean count (artwork-trust.ts sponsorCleanCount). */
  clean: number;
  /** The sponsor's and the campaign brief's categories. */
  sponsorCategories: readonly string[];
  briefCategories: readonly string[];
  /** Categories a school programme of minors does not sell (student.ts). */
  notForStudents: ReadonlySet<string>;
  /** BTG asked for changes on an earlier version of this artwork. */
  btgRevisedBefore: boolean;
  /** The sponsor has an active SPONSOR_ADMIN to review it. */
  sponsorReviewer: boolean;
};

export type ArtworkSkipDecision = { skip: boolean; reason: string };

const words = (cats: string[]) => cats.map((c) => c.toLowerCase().replace(/_/g, " ")).join(" and ");
const norm = (cats: readonly string[]) => [...new Set(cats.filter(Boolean).map((c) => c.trim().toUpperCase()))];

/**
 * Does this passing upload skip BTG's review? The reason, either way.
 *
 * Never for a sensitive category, nor one a student edition does not sell —
 * the sale should already have been refused; this checks again rather than
 * trust it. Never after a BTG revision on this artwork. Never without a
 * sponsor admin to do the review that is left.
 */
export function artworkSkipDecision(i: ArtworkSkipInput): ArtworkSkipDecision {
  const sensitive = (cats: string[]) => cats.filter((c) => (SENSITIVE_CATEGORIES as readonly string[]).includes(c));
  const barred = (cats: string[]) => cats.filter((c) => i.notForStudents.has(c) && !(SENSITIVE_CATEGORIES as readonly string[]).includes(c));
  for (const [who, cats] of [["Sponsor", norm(i.sponsorCategories)], ["Campaign", norm(i.briefCategories)]] as const) {
    const s = sensitive(cats);
    if (s.length) return { skip: false, reason: `${who} is in a sensitive category (${words(s)}) — always reviewed by BTG` };
    const b = barred(cats);
    if (b.length) return { skip: false, reason: `${who} is in a category student editions don't sell (${words(b)}) — always reviewed by BTG` };
  }
  if (i.btgRevisedBefore) return { skip: false, reason: "BTG asked for changes on an earlier version — reviewed by BTG" };
  const t = sponsorTrust(i.clean);
  if (!t.trusted) return { skip: false, reason: `Not trusted yet: ${t.cleanStreak} of ${t.needed} clean ads — reviewed by BTG` };
  if (!i.sponsorReviewer) return { skip: false, reason: "The sponsor has no one to review it — reviewed by BTG" };
  return { skip: true, reason: `Trusted: last ${TRUSTED_ARTWORK_COUNT} ads approved by BTG without changes` };
}
