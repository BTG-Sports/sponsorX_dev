/* --------------------------------------------------------------------------
   POL-FE-56 (app review B5) — BTG sets NEXT up from the screens: a new
   publication (a school's masthead, or the regional edition), a new
   edition on it, its dates and threshold changed while PLANNING or
   SELLING, and Cancel. Before this the only edition had closed its sales
   and nothing on screen could make another — and a school with no
   publication never appeared on /next/apply.

     GET   /publications                 mastheads + the schools (BTG)
     POST  /publications                 {name, propertyId|null}
     POST  /publications/:id/editions    {label, closeDate, publishTarget, thresholdCents, salesOpenAt?}
     PATCH /editions/:id                 any of those, PLANNING or SELLING
     POST  /editions/:id/transition      {to: CANCELLED}
   -------------------------------------------------------------------------- */

export type ApiPublications = {
  publications: { id: string; name: string; propertyId: string | null; schoolName: string | null }[];
  schools: { id: string; name: string }[];
};

/** Who sets NEXT up: BTG admins (publication and edition write). */
export const SETUP_ROLES = ["SUPER_ADMIN", "BTG_ADMIN"] as const;
export const maySetUpNext = (roles: readonly string[]) => roles.some((r) => (SETUP_ROLES as readonly string[]).includes(r));

/** Editions whose dates and threshold may still change. */
export const EDITABLE_STATES = ["PLANNING", "SELLING"];
/** Editions that may be cancelled (edition-state.ts: PLANNING, SELLING, CLOSED). */
export const CANCELLABLE_STATES = ["PLANNING", "SELLING", "CLOSED"];

export type EditionForm = { label: string; closeDate: string; publishTarget: string; threshold: string; salesOpenAt?: string };

/** "2026-12-01" → noon UTC that day, ISO (a date picker's day, never shifted by a time zone). */
export function dayIso(day: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T12:00:00.000Z` : null;
}

/** "$1,500" → 150000; null unless a whole-or-cents dollar amount ≥ 0. */
export function thresholdCents(raw: string): number | null {
  const t = raw.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** Why the edition form can't be sent, or null. */
export function editionFormProblem(f: EditionForm): string | null {
  if (!f.label.trim()) return "Name the edition, e.g. \"Spring 2027\".";
  const close = dayIso(f.closeDate), publish = dayIso(f.publishTarget);
  if (!close) return "Pick the day ad sales close.";
  if (!publish) return "Pick the day it publishes.";
  if (publish < close) return "Publishing comes after sales close.";
  if (thresholdCents(f.threshold) === null) return "Enter the threshold in dollars — the least the edition must sell to print.";
  if (f.salesOpenAt) {
    const open = dayIso(f.salesOpenAt);
    if (!open) return "Pick the day sales open, or leave it empty to open them by hand.";
    if (open > close) return "Sales open before they close.";
  }
  return null;
}

/** The form as the API's body. */
export function editionBody(f: EditionForm) {
  return {
    label: f.label.trim(),
    closeDate: dayIso(f.closeDate)!,
    publishTarget: dayIso(f.publishTarget)!,
    thresholdCents: thresholdCents(f.threshold)!,
    ...(f.salesOpenAt ? { salesOpenAt: dayIso(f.salesOpenAt) } : {}),
  };
}

/** An ISO date as the date picker's value. */
export const isoDay = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");
