/**
 * The automatic checks a draft meets before BTG sees it, and the review
 * clocks — P5-BE-09 (BTG admin review item 21).
 *
 * The programme owner (2026-10-03): keep BTG's decisions, automate the
 * busywork around them. "No file", "wrong kind of file" and "the caption is
 * missing #ad" are not judgements — a reviewer who opens a draft only to type
 * one of them back has spent a review on a lookup. So a draft is checked the
 * moment it is submitted; one that fails goes straight back to the athlete
 * with each failure in words, and never reaches BTG's queue.
 *
 * Pure: no database, no clock. `deliverable.ts` reads the inputs and acts on
 * the verdict.
 *
 * WHAT IS CHECKED, AND WHAT IS NOT.
 *   1. A file is attached — at least one creative version exists.
 *   2. Its type is allowed. Neither the deliverable template nor the offer
 *      defines allowed types, so the default applies: images (JPG, PNG,
 *      WebP) and video (MP4, MOV). The type is the one the upload was
 *      presigned for — the signed PUT enforces it — not a file extension.
 *   3. Every disclosure the accepted offer requires (`Offer.disclosures`,
 *      e.g. "#ad") appears in the caption, ignoring case. An order made
 *      without an offer (the Phase 1 invitation path) requires none.
 *   4. Required tags or handles: SKIPPED. Neither the brief nor the offer has
 *      a field for them, and inventing one is not this task's call.
 */

export type ContentCheckKey = "file" | "fileType" | "disclosures";
export type ContentCheck = { key: ContentCheckKey; ok: boolean; text: string };

/** The default allowed creative types, with how each is named to a person. */
export const ALLOWED_CREATIVE_TYPES: Readonly<Record<string, string>> = {
  "image/jpeg": "JPG image",
  "image/png": "PNG image",
  "image/webp": "WebP image",
  "video/mp4": "MP4 video",
  "video/quicktime": "MOV video",
};

/** "JPG, PNG or WebP image, or an MP4 or MOV video" — the athlete's wording. */
export const ALLOWED_TYPES_WORDS = "a JPG, PNG or WebP image, or an MP4 or MOV video";

/** The longest caption accepted — Instagram's own limit. */
export const CAPTION_MAX = 2200;

/** "video/mp4; codecs=avc1" → "video/mp4". */
export function normalizeContentType(type: string | null | undefined): string | null {
  const t = type?.split(";")[0]?.trim().toLowerCase();
  return t ? t : null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORDISH = /[\p{L}\p{N}_]/u;

/**
 * Does the caption carry this disclosure? Case-insensitive, and as a whole
 * token: "#ad" is in "Loving it #AD" and "#ad." but not in "#adidas" — a
 * hashtag that merely starts with the letters is not the disclosure. Any run
 * of spaces or a line break counts as the space in "Paid partnership".
 */
export function captionHas(caption: string, disclosure: string): boolean {
  const d = disclosure.trim();
  if (!d) return true;
  const before = WORDISH.test(d[0]!) ? "(?<![\\p{L}\\p{N}_])" : "";
  const after = WORDISH.test(d[d.length - 1]!) ? "(?![\\p{L}\\p{N}_])" : "";
  const body = d.split(/\s+/).map(escape).join("\\s+");
  return new RegExp(`${before}${body}${after}`, "iu").test(caption);
}

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export type ContentCheckInput = {
  /** The latest creative version, if any. */
  latest: { version: number; contentType: string | null } | null;
  /** What the athlete will post; null or blank when none was given. */
  caption: string | null;
  /** The accepted offer's required disclosures; empty when there is none. */
  requiredDisclosures: readonly string[];
};

/** Run the checks. Pure. */
export function contentChecks(input: ContentCheckInput): ContentCheck[] {
  const out: ContentCheck[] = [];
  const latest = input.latest;

  out.push(
    latest
      ? { key: "file", ok: true, text: `File attached (version ${latest.version})` }
      : { key: "file", ok: false, text: "No file attached" },
  );

  const type = normalizeContentType(latest?.contentType);
  if (!latest) {
    out.push({ key: "fileType", ok: false, text: "No file, so its type can't be checked" });
  } else if (!type) {
    out.push({ key: "fileType", ok: false, text: `We couldn't tell what kind of file this is — upload it again as ${ALLOWED_TYPES_WORDS}` });
  } else if (ALLOWED_CREATIVE_TYPES[type]) {
    out.push({ key: "fileType", ok: true, text: `File type allowed (${ALLOWED_CREATIVE_TYPES[type]})` });
  } else {
    out.push({ key: "fileType", ok: false, text: `The file type (${type}) isn't allowed — upload ${ALLOWED_TYPES_WORDS}` });
  }

  const required = [...new Set(input.requiredDisclosures.map((d) => d.trim()).filter(Boolean))];
  const caption = input.caption?.trim() ?? "";
  if (required.length === 0) {
    out.push({ key: "disclosures", ok: true, text: "No disclosures required by the offer" });
  } else if (!caption) {
    out.push({ key: "disclosures", ok: false, text: `The caption is missing — it must include ${list(required)}` });
  } else {
    const missing = required.filter((d) => !captionHas(caption, d));
    out.push(
      missing.length
        ? { key: "disclosures", ok: false, text: `The caption is missing ${list(missing)}` }
        : { key: "disclosures", ok: true, text: `The caption includes ${list(required)}` },
    );
  }
  return out;
}

export const allPassed = (checks: readonly ContentCheck[]) => checks.every((c) => c.ok);

/** The failed checks, in words — the athlete's revision request. */
export function failedReasons(checks: readonly ContentCheck[]): string[] {
  return checks.filter((c) => !c.ok).map((c) => c.text);
}

/** Read stored checks back defensively (a Json column). */
export function readChecks(value: unknown): ContentCheck[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((c) =>
    c && typeof c === "object" && typeof (c as ContentCheck).key === "string" && typeof (c as ContentCheck).ok === "boolean" && typeof (c as ContentCheck).text === "string"
      ? [{ key: (c as ContentCheck).key, ok: (c as ContentCheck).ok, text: (c as ContentCheck).text }]
      : [],
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Whose move a submitted draft is
   ──────────────────────────────────────────────────────────────────────────── */

export type SentBack =
  | { by: "SYSTEM"; reason: string; at: Date; failed: string[] }
  | { by: "REVIEWER"; reason: string; at: Date };

/**
 * Is a DRAFT_SUBMITTED deliverable back with the athlete — and if so, why?
 *
 *   - SYSTEM: its latest submission failed the checks. It stays back until a
 *     submission passes; an upload alone does not answer it.
 *   - REVIEWER: a person's revision request is newer than the athlete's
 *     answer. The answer is the latest submission — or, for a deliverable
 *     never submitted under the checks (before P5-BE-09), the latest upload,
 *     which is how a revision was answered then.
 *
 * Anything else in DRAFT_SUBMITTED is in BTG's queue.
 */
export function sentBack(d: {
  state: string;
  checksPassed: boolean | null;
  checks: unknown;
  checkedAt: Date | null;
  latestUploadAt: Date | null;
  revision: { reason: string; at: Date } | null | undefined;
}): SentBack | null {
  if (d.state !== "DRAFT_SUBMITTED") return null;
  if (d.checksPassed === false) {
    const failed = failedReasons(readChecks(d.checks) ?? []);
    return { by: "SYSTEM", reason: failed.join("\n"), at: d.checkedAt ?? new Date(0), failed };
  }
  const answeredAt = d.checkedAt ?? d.latestUploadAt;
  if (d.revision && (!answeredAt || answeredAt < d.revision.at)) {
    return { by: "REVIEWER", reason: d.revision.reason, at: d.revision.at };
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
   Review reminders
   ──────────────────────────────────────────────────────────────────────────── */

/** A draft waiting this long on its reviewer gets one reminder to them. */
export const REVIEW_REMINDER_HOURS = 48;

/** Whose review a waiting state is. DRAFT_SUBMITTED (in the queue, not yet
 *  picked up) and BTG_REVIEW are both BTG's: the wait runs from when the
 *  draft reached BTG, not from when someone opened it. */
export function reviewStage(state: string): "BTG" | "SPONSOR" | null {
  if (state === "DRAFT_SUBMITTED" || state === "BTG_REVIEW") return "BTG";
  if (state === "SPONSOR_REVIEW") return "SPONSOR";
  return null;
}

/** Is a reminder due? Strictly more than REVIEW_REMINDER_HOURS. Pure. */
export function reminderDue(waitingSince: Date | null, remindedAt: Date | null, now: Date): boolean {
  if (!waitingSince || remindedAt) return false;
  return now.getTime() - waitingSince.getTime() > REVIEW_REMINDER_HOURS * 3_600_000;
}

/** "2 days", "3 hours" — how long a draft has waited, for an email. */
export function waitedWords(since: Date, now: Date): string {
  const hours = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 3_600_000));
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}
