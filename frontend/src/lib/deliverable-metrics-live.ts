/* --------------------------------------------------------------------------
   POL-FE-62 (app review §2) — reach was always zero and the report had no
   clicks: POST /deliverables/:id/metrics and /tracking-link had no caller.
   BTG records a day's views (VERIFIED_MANUAL — checked by a person) and
   makes a tracking link from the post's drawer.
   -------------------------------------------------------------------------- */

/** "12,400" / "12.4k" → 12400; null unless a whole number ≥ 0. */
export function countOf(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/,/g, "");
  const m = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(t);
  if (!m) return null;
  const n = Math.round(Number(m[1]) * (m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1));
  return Number.isSafeInteger(n) && n <= 2_147_483_647 ? n : null;
}

export function viewsProblem(f: { day: string; views: string; engagements: string }, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.day)) return "Pick the day the figures are for.";
  if (f.day > today) return "Figures are for a day that has happened.";
  if (countOf(f.views) === null) return "Enter the views as a number, e.g. 12,400 or 12.4k.";
  if (f.engagements.trim() && countOf(f.engagements) === null) return "Enter the engagements as a number, or leave it at 0.";
  return null;
}

export function linkProblem(url: string): string | null {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? null : "Use the full web address, starting https://.";
  } catch {
    return "Use the full web address, starting https://.";
  }
}

/** The link fans click: the web app's /t/<code>, which records the click and forwards. */
export const trackingUrl = (origin: string, code: string) => `${origin.replace(/\/+$/, "")}/t/${encodeURIComponent(code)}`;
