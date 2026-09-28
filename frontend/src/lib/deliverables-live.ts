/* --------------------------------------------------------------------------
   P5-FE-02 / -03 — the athlete's deliverables, as GET /deliverables answers,
   plus the pure calendar arithmetic the island draws from. No fetch, no
   clock of its own: `today` is always passed in, so tests pin the dates.

   Dates are handled in UTC day keys ("2026-10-14"). A due date is a day, not
   an instant — rendering it in the viewer's zone would move a deliverable
   due "Oct 14" to Oct 13 for anyone west of UTC.
   -------------------------------------------------------------------------- */

export type DeliverableState =
  | "NOT_STARTED"
  | "DRAFT_SUBMITTED"
  | "BTG_REVIEW"
  | "SPONSOR_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "VERIFIED";

export type ApiDeliverable = {
  id: string;
  title: string;
  dueDate: string;
  state: DeliverableState;
  publishedUrl: string | null;
  publishedAt: string | null;
  orderId: string;
  jobId: string;
  jobName: string;
  appearance: boolean;
  athlete: { id: string; displayName: string };
  campaign: { id: string; name: string; sponsorName: string };
  latestAsset: { version: number; uploadedAt: string } | null;
  assetCount: number;
  revision: { reason: string; at: string } | null;
};

export type ApiDeliverableDetail = ApiDeliverable & {
  assets: { version: number; uploadedAt: string }[];
};

/** What the athlete does next, in their words. */
export type NextStep = {
  label: string;
  tone: "primary" | "warn" | "accent" | "neutral" | "danger";
  /** Whose move it is. */
  on: "you" | "btg" | "sponsor" | "done";
};

export function nextStep(d: Pick<ApiDeliverable, "state" | "revision" | "appearance">): NextStep {
  if (d.revision) return { label: "Revision requested", tone: "danger", on: "you" };
  switch (d.state) {
    case "NOT_STARTED":
      return d.appearance
        ? { label: "Upload proof of appearance", tone: "primary", on: "you" }
        : { label: "Upload your draft", tone: "primary", on: "you" };
    case "DRAFT_SUBMITTED":
      return { label: "Submitted — waiting for BTG", tone: "neutral", on: "btg" };
    case "BTG_REVIEW":
      return { label: "BTG is reviewing", tone: "neutral", on: "btg" };
    case "SPONSOR_REVIEW":
      return { label: "Sponsor is reviewing", tone: "neutral", on: "sponsor" };
    case "APPROVED":
      return { label: "Approved — publish it", tone: "accent", on: "you" };
    case "PUBLISHED":
      return { label: "Published — BTG verifying", tone: "neutral", on: "btg" };
    case "VERIFIED":
      return { label: "Verified", tone: "accent", on: "done" };
  }
}

export const TABS = [
  { key: "todo", label: "To do" },
  { key: "review", label: "In review" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
] as const;
export type TabKey = (typeof TABS)[number]["key"];

export function tabOf(d: Pick<ApiDeliverable, "state" | "revision" | "appearance">): Exclude<TabKey, "all"> {
  const s = nextStep(d);
  if (s.on === "you") return "todo";
  if (s.on === "done" || d.state === "PUBLISHED") return "done";
  return "review";
}

/** "2026-10-14" — the UTC calendar day of an ISO instant. */
export function dayKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toISOString().slice(0, 10);
}

/** Whole days from today to the due day; negative when overdue. */
export function daysUntil(dueIso: string, today: Date): number {
  const a = Date.parse(dayKey(dueIso));
  const b = Date.parse(dayKey(today));
  return Math.round((a - b) / 86_400_000);
}

export function dueLabel(dueIso: string, today: Date): string {
  const n = daysUntil(dueIso, today);
  if (n === 0) return "due today";
  if (n === 1) return "due tomorrow";
  if (n > 1) return `due in ${n} days`;
  return n === -1 ? "1 day overdue" : `${-n} days overdue`;
}

/** Overdue matters only while it's still the athlete's move. */
export function isOverdue(d: Pick<ApiDeliverable, "state" | "revision" | "appearance" | "dueDate">, today: Date): boolean {
  return nextStep(d).on === "you" && daysUntil(d.dueDate, today) < 0;
}

/** "2026-10" for the month containing `iso`. */
export function monthKey(iso: string | Date): string {
  return dayKey(iso).slice(0, 7);
}

export function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export function monthTitle(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The month as weeks of day keys, Monday first, padded with the neighbouring
 * months' days so every row has seven cells (`inMonth` false for padding).
 */
export function monthGrid(key: string): { day: string; inMonth: boolean }[][] {
  const [y, m] = key.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(Date.UTC(y, m - 1, 1 - offset));
  const weeks: { day: string; inMonth: boolean }[][] = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getTime() + (w * 7 + i) * 86_400_000);
      row.push({ day: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === m - 1 });
    }
    /* Drop a trailing week that is entirely next month. */
    if (w > 3 && !row.some((c) => c.inMonth)) break;
    weeks.push(row);
  }
  return weeks;
}

export function byDay<T extends { dueDate: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = dayKey(r.dueDate);
    out.set(k, [...(out.get(k) ?? []), r]);
  }
  return out;
}

/** The fixture deliverables as live-shaped rows, dated around `today` so
 *  the demo calendar always has something this month. */
export function fixtureDeliverables(
  rows: { id: string; campaign: string; sponsor: string; title: string; state: DeliverableState; revisionRequested: boolean }[],
  today: Date,
): ApiDeliverable[] {
  const offsets = [-2, 1, 3, 6, 9, 13, 17, 22];
  return rows.map((r, i) => ({
    id: r.id,
    title: r.title,
    dueDate: new Date(Date.parse(dayKey(today)) + (offsets[i % offsets.length] * 86_400_000)).toISOString(),
    state: r.state,
    publishedUrl: null,
    publishedAt: null,
    orderId: `ord_${r.id}`,
    jobId: "SX-03",
    jobName: "Athlete Reel",
    appearance: false,
    athlete: { id: "fixture", displayName: "You" },
    campaign: { id: r.campaign, name: r.campaign, sponsorName: r.sponsor },
    latestAsset: null,
    assetCount: 0,
    revision: r.revisionRequested ? { reason: "Show the product in the first three seconds.", at: today.toISOString() } : null,
  }));
}
