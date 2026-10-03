/* --------------------------------------------------------------------------
   P5-FE-02 / -03 — the athlete's deliverables, as GET /deliverables answers,
   plus the pure calendar arithmetic the island draws from. No fetch, no
   clock of its own: `today` is always passed in, so tests pin the dates.

   Dates are handled in UTC day keys ("2026-10-14"). A due date is a day, not
   an instant — rendering it in the viewer's zone would move a deliverable
   due "Oct 14" to Oct 13 for anyone west of UTC.
   -------------------------------------------------------------------------- */

import type { PageInfo } from "@/lib/list-query";
import type { ContentCheck } from "@/lib/content-checks";

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
  /** Back with the athlete. `by` SYSTEM: the automatic checks sent it back,
   *  and `failed` lists each failure in words (P5-BE-09). */
  revision: { reason: string; at: string; by?: "SYSTEM" | "REVIEWER"; failed?: string[] } | null;
  /* P5-BE-09 — the latest submission: the caption the athlete will post (and
     the version it went with), the disclosures it must carry, the automatic
     checks (null for a draft submitted before they existed), and — on a
     review desk — when it reached the reviewer it is waiting on. */
  caption?: string | null;
  captionVersion?: number | null;
  requiredDisclosures?: string[];
  checks?: ContentCheck[] | null;
  waitingSince?: string | null;
  /* P5-BE-10 — the latest submission skipped BTG's review and went straight
     to the sponsor; why, in words, is sent to BTG only. */
  btgReviewSkipped?: boolean;
  skipReason?: string | null;
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
  /* P5-BE-09 — the automatic checks sent it back before BTG saw it. */
  if (d.revision?.by === "SYSTEM") return { label: "Fix before review", tone: "danger", on: "you" };
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

/* --------------------------------------------------------------------------
   Server-paged views (2026-09-29). The calendar fetches ONE grid's worth of
   rows (?from&to); the agenda under it is a server page (?page&size&tab and
   a day range); the tiles and tab counts come from GET /deliverables/summary.
   The fixture (demo) mode runs the same shapes through the pure helpers
   below, so the island has one path.
   -------------------------------------------------------------------------- */

/** GET /deliverables/summary. */
export type ApiDeliverableSummary = {
  total: number;
  states: Record<DeliverableState, number>;
  openRevisions: number;
  aging: number;
  overdue: number;
  campaigns: { id: string; name: string }[];
};

/** The athlete page's tiles and tab counts, from the summary. */
export function athleteHeadline(s: ApiDeliverableSummary) {
  const st = s.states;
  const draftWithBtg = Math.max(0, st.DRAFT_SUBMITTED - s.openRevisions);
  const review = draftWithBtg + st.BTG_REVIEW + st.SPONSOR_REVIEW;
  const yourMove = st.NOT_STARTED + st.APPROVED + s.openRevisions;
  return {
    yourMove,
    overdue: s.overdue,
    revisions: s.openRevisions,
    /* nextStep puts PUBLISHED on BTG (verifying), though its tab is Done. */
    inReview: review + st.PUBLISHED,
    tabs: { todo: yourMove, review, done: st.PUBLISHED + st.VERIFIED, all: s.total } as Record<TabKey, number>,
  };
}

/** The summary of an in-memory set — the fixture mode's stand-in. */
export function summarizeRows(rows: ApiDeliverable[], today: Date): ApiDeliverableSummary {
  const states = {
    NOT_STARTED: 0, DRAFT_SUBMITTED: 0, BTG_REVIEW: 0, SPONSOR_REVIEW: 0, APPROVED: 0, PUBLISHED: 0, VERIFIED: 0,
  } as Record<DeliverableState, number>;
  for (const r of rows) states[r.state] += 1;
  const names = new Map(rows.map((r) => [r.campaign.id, r.campaign.name]));
  return {
    total: rows.length,
    states,
    openRevisions: rows.filter((r) => r.revision).length,
    aging: 0,
    overdue: rows.filter((r) => isOverdue(r, today)).length,
    campaigns: [...names].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** `?month=YYYY-MM` if valid, else the month containing `today`. */
export function parseMonth(v: string, today: Date): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return monthKey(today);
  return v;
}

/** `?day=YYYY-MM-DD` if it is a real day, else "". */
export function parseDay(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && dayKey(d) === v ? v : "";
}

/** The day after a day key. */
function nextDay(key: string): string {
  return dayKey(new Date(Date.parse(`${key}T00:00:00Z`) + 86_400_000));
}

/** The month grid's whole range (padding days included), `to` exclusive —
    what the calendar fetches so every visible cell has its dots. */
export function gridRange(month: string): { from: string; to: string } {
  const weeks = monthGrid(month);
  const last = weeks[weeks.length - 1]!;
  return { from: weeks[0]![0]!.day, to: nextDay(last[last.length - 1]!.day) };
}

/** One day as a [from, to) range. */
export function dayRange(day: string): { from: string; to: string } {
  return { from: day, to: nextDay(day) };
}

/** The agenda's API query: page + size, the tab, and a day's range. */
export function agendaQuery(p: { page: number; size: number; tab: TabKey; day: string }): string {
  const u = new URLSearchParams({ page: String(p.page), size: String(p.size) });
  if (p.tab !== "all") u.set("tab", p.tab);
  if (p.day) {
    const r = dayRange(p.day);
    u.set("from", r.from);
    u.set("to", r.to);
  }
  return `?${u}`;
}

/** The agenda over an in-memory set (fixture mode): the API's filter, order
    and clamp, so demo paging behaves like the real thing. */
export function pageAgenda(
  rows: ApiDeliverable[],
  p: { page: number; size: number; tab: TabKey; day: string },
): { rows: ApiDeliverable[]; page: PageInfo } {
  const list = rows
    .filter((r) => (!p.day || dayKey(r.dueDate) === p.day) && (p.tab === "all" || tabOf(r) === p.tab))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(list.length / p.size));
  const page = Math.min(Math.max(1, p.page), pages);
  return {
    rows: list.slice((page - 1) * p.size, page * p.size),
    page: { page, size: p.size, total: list.length, pages },
  };
}

/** Rows due inside [from, to) — the fixture mode's month fetch. */
export function inRange<T extends { dueDate: string }>(rows: T[], r: { from: string; to: string }): T[] {
  return rows.filter((x) => {
    const k = dayKey(x.dueDate);
    return k >= r.from && k < r.to;
  });
}

/** Consecutive rows grouped under their due day (rows already in due order). */
export function groupByDay<T extends { dueDate: string }>(rows: T[]): { day: string; items: T[] }[] {
  const out: { day: string; items: T[] }[] = [];
  for (const r of rows) {
    const k = dayKey(r.dueDate);
    const last = out[out.length - 1];
    if (last?.day === k) last.items.push(r);
    else out.push({ day: k, items: [r] });
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
