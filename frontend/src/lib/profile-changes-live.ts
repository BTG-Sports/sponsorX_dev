/* --------------------------------------------------------------------------
   P3-BE-16 — post-approval profile edits, as the API answers them.

   Pure: the shapes of GET /athletes/me/profile-changes and
   GET /profile-changes, and the translations both screens render — the
   "now → proposed" rows of the review desk and the athlete's own banner.
   No fetch, no clock; `now` is a parameter where it matters.
   -------------------------------------------------------------------------- */

export type ProfileChangeState = "PENDING" | "APPROVED" | "DECLINED" | "WITHDRAWN";

/** The §11 sections an athlete may propose a change to. */
export type ChangeSection = "identity" | "sport" | "capabilities" | "interests" | "restrictions";

export type ApiProfileChange = {
  id: string;
  athleteId: string;
  sections: ChangeSection[];
  /** Athlete column → proposed value (only what differs at submission). */
  fields: Record<string, unknown>;
  note: string | null;
  state: ProfileChangeState;
  reviewerNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

/** A desk row: the change plus the athlete's current values for its fields. */
export type ApiDeskChange = ApiProfileChange & {
  current: Record<string, unknown>;
  athlete: { id: string; slug: string; displayName: string; legalName: string; state: string };
};

export const SECTION_LABELS: Record<ChangeSection, string> = {
  identity: "Identity",
  sport: "Sport & team",
  capabilities: "Content capabilities",
  interests: "Brand interests",
  restrictions: "Restrictions & conflicts",
};

export const FIELD_LABELS: Record<string, string> = {
  displayName: "Display name",
  city: "City",
  stateCode: "State",
  sport: "Sport",
  position: "Position",
  school: "School / team",
  level: "Level",
  gradYear: "Class of",
  achievements: "Achievements",
  contentCapabilities: "Jobs they'll deliver",
  brandInterests: "Brand interests",
  restrictedCategories: "Never promote",
  restrictionNotes: "Restriction notes",
};

/** "HIGH_SCHOOL" → "High school"; lists join; empty is a dash. */
export function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length === 0 ? "— (none)" : v.map((x) => words(String(x))).join(", ");
  if (typeof v === "string" && /^[A-Z][A-Z_]+$/.test(v)) return words(v);
  return String(v);
}

const words = (s: string) => (s.charAt(0) + s.slice(1).toLowerCase()).replaceAll("_", " ");

export type DiffRow = { field: string; label: string; before: string; after: string; section: ChangeSection | null };

const SECTION_OF: Record<string, ChangeSection> = {
  displayName: "identity", city: "identity", stateCode: "identity",
  sport: "sport", position: "sport", school: "sport", level: "sport", gradYear: "sport", achievements: "sport",
  contentCapabilities: "capabilities", brandInterests: "interests",
  restrictedCategories: "restrictions", restrictionNotes: "restrictions",
};

/** The desk's "now → proposed" table, in §11 order. An unknown field (a
 *  future column) still renders, under its own key, rather than vanishing. */
export function diffRows(change: { fields: Record<string, unknown> }, current: Record<string, unknown>): DiffRow[] {
  const order = Object.keys(FIELD_LABELS);
  return Object.keys(change.fields)
    .sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)))
    .map((field) => ({
      field,
      label: FIELD_LABELS[field] ?? field,
      before: formatValue(current[field]),
      after: formatValue(change.fields[field]),
      section: SECTION_OF[field] ?? null,
    }));
}

/** Does the change touch a restriction — the §26 input the desk flags? */
export function touchesRestrictions(change: { fields: Record<string, unknown> }): boolean {
  return "restrictedCategories" in change.fields;
}

export const STATE_COPY: Record<ProfileChangeState, { label: string; tone: "warn" | "accent" | "danger" | "neutral" }> = {
  PENDING: { label: "Waiting for BTG", tone: "warn" },
  APPROVED: { label: "Approved", tone: "accent" },
  DECLINED: { label: "Declined", tone: "danger" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};

/** The athlete's banner: the open request, else the latest decision. */
export function latestForBanner(changes: ApiProfileChange[]): ApiProfileChange | null {
  return changes.find((c) => c.state === "PENDING") ?? changes.find((c) => c.state === "APPROVED" || c.state === "DECLINED") ?? null;
}

/** Hours since a timestamp — the desk's aging column. */
export function waitHours(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000));
}
