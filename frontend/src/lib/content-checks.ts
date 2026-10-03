/* --------------------------------------------------------------------------
   P5-BE-09 / P4-FE-08 — the automatic content checks, as the screens read
   them. Pure: no fetch, no clock (the caller passes `now`).

   The API runs the checks when a draft is submitted (content-check-rules.ts
   in the backend) and is the only judge. What lives here is presentation:
   the waiting badge, the hint under the caption box, the file picker's
   accepted types, and a live preview of the disclosure check so the athlete
   can see "missing #ad" before they press submit. The preview uses the same
   rule as the API — ignoring case, the disclosure as a whole token — but a
   preview it stays: the submission's own checks are what count.
   -------------------------------------------------------------------------- */

export type ContentCheck = { key: string; ok: boolean; text: string };

/** The file types the checks allow by default (nothing defines others). */
export const CREATIVE_ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime";
export const CREATIVE_TYPES_WORDS = "JPG, PNG or WebP image, or MP4 or MOV video";
export const CAPTION_MAX = 2200;

/** A draft waiting this long on its reviewer has had its one reminder. */
export const REVIEW_REMINDER_HOURS = 48;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORDISH = /[\p{L}\p{N}_]/u;

/** Is the disclosure in the caption? Case-insensitive, as a whole token. */
export function captionHas(caption: string, disclosure: string): boolean {
  const d = disclosure.trim();
  if (!d) return true;
  const before = WORDISH.test(d[0]!) ? "(?<![\\p{L}\\p{N}_])" : "";
  const after = WORDISH.test(d[d.length - 1]!) ? "(?![\\p{L}\\p{N}_])" : "";
  const body = d.split(/\s+/).map(escape).join("\\s+");
  return new RegExp(`${before}${body}${after}`, "iu").test(caption);
}

/** The required disclosures the caption doesn't carry yet. */
export function missingDisclosures(caption: string, required: readonly string[]): string[] {
  return required.map((d) => d.trim()).filter((d) => d && !captionHas(caption, d));
}

const list = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** The line under the caption box. */
export function disclosureHint(required: readonly string[]): string {
  return required.length
    ? `Your caption must include ${list(required)} — the offer requires it.`
    : "No disclosure is required by this offer.";
}

/** Whole hours since `sinceIso`, or null without a valid time. */
export function waitedHours(sinceIso: string | null | undefined, now: Date): number | null {
  const t = sinceIso ? Date.parse(sinceIso) : NaN;
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 3_600_000));
}

/** "waiting 5 hours", "waiting 1 day", "waiting 2 days". */
export function waitingWords(hours: number): string {
  if (hours < 1) return "waiting under an hour";
  if (hours < 24) return `waiting ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(hours / 24);
  return `waiting ${days} ${days === 1 ? "day" : "days"}`;
}

/** The badge for a draft's wait on its reviewer — warning past the reminder line. */
export function waitingBadge(sinceIso: string | null | undefined, now: Date): { label: string; late: boolean } | null {
  const h = waitedHours(sinceIso, now);
  if (h === null) return null;
  return { label: waitingWords(h), late: h > REVIEW_REMINDER_HOURS };
}

/** Read checks defensively — an absent field is "never checked", not "passed". */
export function passedChecks(checks: readonly ContentCheck[] | null | undefined): ContentCheck[] {
  return (checks ?? []).filter((c) => c.ok);
}
