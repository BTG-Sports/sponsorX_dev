/* --------------------------------------------------------------------------
   P4-FE-07 — the admin Briefs queue, from GET /briefs.

   A sponsor's brief arrives as DRAFT and only QUALIFIED or APPROVED ones open
   in the Matching Studio, but nothing on any screen moved a brief on (found
   by the staging walkthrough). These are the pure pieces of that queue: the
   row a brief becomes, the state tabs and their counts, the filters, and the
   "waiting for matching" summary the Campaigns page links from.

   Everything shown is a field the API returns. The sponsor's preferred tier
   and message to BTG are folded into `objective` by the brief form
   (lib/brief-request.ts), so they appear in the objective text, not as their
   own fields.
   -------------------------------------------------------------------------- */

import { BRAND_CATEGORIES, categoryLabel, type BrandCategory } from "./brand-categories";
import type { PageInfo } from "@/lib/list-query";

export type BriefState = "DRAFT" | "QUALIFIED" | "APPROVED" | "CAMPAIGN_CREATED" | "CLOSED";

export type ApiBrief = {
  id: string;
  objective: string;
  state: BriefState;
  /** cents */
  budget: number;
  startDate: string;
  endDate: string;
  sports: string[];
  stateCodes: string[];
  categories: string[];
  createdAt: string;
  sponsorName: string;
  closeReason?: string | null;
  package: {
    code: string;
    name: string;
    athleteCountMin: number;
    athleteCountMax: number;
    /** whole dollars */
    priceLow?: number;
    priceHigh?: number;
  } | null;
  campaign: { id: string; name: string; state: string } | null;
  /** P4-BE-07 — BTG's readiness checklist, computed by the API on read.
   *  Absent for a caller who doesn't see it. Nothing moves a brief because
   *  it is ready: BTG still qualifies by hand. */
  readiness?: { ready: boolean; checks: ReadinessCheck[] };
  /** P4-BE-11 — approved by the system, every safety check having passed. */
  autoApproved?: boolean;
  /** P4-BE-11 — BTG only: when and why the brief was held for BTG. Kept
   *  after BTG takes it on, as the record of why it waited. */
  heldAt?: string | null;
  heldReasons?: string[];
};

/** One line of the readiness checklist: objective, dates, budget, sponsor,
 *  eligible, conflicts (information only — always ok). */
export type ReadinessCheck = { key: string; ok: boolean; text: string; count?: number };

export const STATE_COPY: Record<BriefState, string> = {
  DRAFT: "Draft",
  QUALIFIED: "Qualified",
  APPROVED: "Approved",
  CAMPAIGN_CREATED: "Campaign created",
  CLOSED: "Closed",
};

export const STATE_TONE: Record<BriefState, "warn" | "primary" | "accent" | "neutral"> = {
  DRAFT: "warn",
  QUALIFIED: "primary",
  APPROVED: "accent",
  CAMPAIGN_CREATED: "neutral",
  CLOSED: "neutral",
};

/** "held" — P4-FE-09: DRAFT briefs held for BTG (P4-BE-11), the desk's
 *  default tab. Every other brief was approved automatically or has been
 *  taken on by hand, so this is what BTG has to look at. It replaces
 *  P4-FE-08's "Ready for review": a ready brief is now approved on its own. */
export type TabKey = "held" | "all" | BriefState;

/** P1-FE-31 — GET /briefs?page=: one tab's page with every tab's count and
 *  the sports any brief in scope targets (the filter's options). */
export type ApiBriefPage = { briefs: ApiBrief[]; page: PageInfo; counts: Record<TabKey, number>; /** Only with ?facets=sports. */ facets?: { sports: string[] } };

/** The API query for a desk tab: held = ?held=true, all = nothing, else ?state=. */
export function briefTabQuery(tab: TabKey): Record<string, string> {
  return tab === "held" ? { held: "true" } : tab === "all" ? {} : { state: tab };
}
export const TABS: { key: TabKey; label: string }[] = [
  { key: "held", label: "Held for BTG" },
  { key: "all", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "QUALIFIED", label: "Qualified" },
  { key: "APPROVED", label: "Approved" },
  { key: "CAMPAIGN_CREATED", label: "Campaign created" },
  { key: "CLOSED", label: "Closed" },
];

/** What BTG can do next from each state (the API's §21 machine decides). */
export function nextMoves(state: BriefState): { qualify: boolean; approve: boolean; close: boolean; match: boolean } {
  return {
    qualify: state === "DRAFT",
    approve: state === "QUALIFIED",
    close: state === "DRAFT" || state === "QUALIFIED" || state === "APPROVED",
    match: state === "QUALIFIED" || state === "APPROVED",
  };
}

const DAY = 86_400_000;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "4 weeks", "10 days" — from the brief's own window. */
export function duration(startIso: string, endIso: string): string {
  const days = Math.max(1, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / DAY));
  if (days % 7 === 0) return `${days / 7} ${days === 7 ? "week" : "weeks"}`;
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** 75000 → "$750"; 150050 → "$1,500.50". */
export function dollars(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function packagePrice(p: ApiBrief["package"]): string | null {
  if (!p || p.priceLow === undefined) return null;
  const low = `$${p.priceLow.toLocaleString("en-US")}`;
  return p.priceHigh !== undefined && p.priceHigh !== p.priceLow ? `${low}–$${p.priceHigh.toLocaleString("en-US")}` : low;
}

function category(codes: string[]): string {
  const known = codes.filter((c): c is BrandCategory => (BRAND_CATEGORIES as readonly string[]).includes(c));
  return known.length ? known.map(categoryLabel).join(", ") : "Not given";
}

export type BriefRow = {
  id: string;
  state: BriefState;
  stateLabel: string;
  tone: (typeof STATE_TONE)[BriefState];
  sponsor: string;
  mono: string;
  packageName: string;
  packagePrice: string | null;
  budget: string;
  start: string;
  end: string;
  duration: string;
  sports: string;
  geography: string;
  category: string;
  submitted: string;
  objective: string;
  closeReason: string | null;
  campaign: ApiBrief["campaign"];
  /** P4-BE-07 — the checklist, or null where the API sent none. */
  readiness: { ready: boolean; checks: ReadinessCheck[] } | null;
  ready: boolean;
  /** P4-BE-11 — held for BTG now: DRAFT, with the reasons in words. */
  held: boolean;
  heldReasons: string[];
  autoApproved: boolean;
  /** For the sport filter and search. */
  sportList: string[];
  haystack: string;
};

export function toBriefRow(b: ApiBrief): BriefRow {
  const mono = b.sponsorName.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
  const packageName = b.package?.name ?? "Custom brief";
  return {
    id: b.id,
    state: b.state,
    stateLabel: STATE_COPY[b.state],
    tone: STATE_TONE[b.state],
    sponsor: b.sponsorName,
    mono,
    packageName,
    packagePrice: packagePrice(b.package),
    budget: dollars(b.budget),
    start: shortDate(b.startDate),
    end: shortDate(b.endDate),
    duration: duration(b.startDate, b.endDate),
    sports: b.sports.length ? b.sports.join(", ") : "Any sport",
    geography: b.stateCodes.length ? b.stateCodes.join(", ") : "Any geography",
    category: category(b.categories),
    submitted: shortDate(b.createdAt),
    objective: b.objective,
    closeReason: b.closeReason ?? null,
    campaign: b.campaign,
    readiness: b.readiness ?? null,
    ready: b.readiness?.ready === true,
    held: isHeld(b),
    heldReasons: b.heldReasons ?? [],
    autoApproved: b.autoApproved === true,
    sportList: b.sports,
    haystack: `${b.sponsorName} ${packageName}`.toLowerCase(),
  };
}

/** Held for BTG now: still DRAFT, with a hold on it (P4-BE-11). */
export function isHeld(b: Pick<ApiBrief, "state" | "heldAt">): boolean {
  return b.state === "DRAFT" && typeof b.heldAt === "string" && b.heldAt !== "";
}

export function tabCounts(rows: Pick<BriefRow, "state" | "held">[]): Record<TabKey, number> {
  const out = { held: 0, all: rows.length, DRAFT: 0, QUALIFIED: 0, APPROVED: 0, CAMPAIGN_CREATED: 0, CLOSED: 0 } as Record<TabKey, number>;
  for (const r of rows) {
    out[r.state] += 1;
    if (r.held) out.held += 1;
  }
  return out;
}

/** "Approved automatically" — the badge the All view shows (P4-FE-09). */
export function approvalBadge(r: Pick<BriefRow, "autoApproved" | "state">): { label: string; tone: "accent" } | null {
  return r.autoApproved && r.state !== "DRAFT" ? { label: "Approved automatically", tone: "accent" } : null;
}

/** "4 of 5 checks pass" — the deciding checks only (conflicts informs). */
export function readinessSummary(r: BriefRow["readiness"]): { label: string; tone: "accent" | "warn" | "neutral" } | null {
  if (!r) return null;
  const deciding = r.checks.filter((c) => c.key !== "conflicts");
  const passing = deciding.filter((c) => c.ok).length;
  if (r.ready) return { label: "Ready for review", tone: "accent" };
  return { label: `${passing} of ${deciding.length} checks pass`, tone: passing === deciding.length ? "neutral" : "warn" };
}

/** The desk's rows: the newest briefs, plus every held one even if it is
 *  older than that first page — deduplicated, newest first. */
export function mergeBriefs(all: ApiBrief[], held: ApiBrief[]): ApiBrief[] {
  const seen = new Set(all.map((b) => b.id));
  return [...all, ...held.filter((b) => !seen.has(b.id))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Every sport any brief targets, for the filter. */
export function sportOptions(rows: Pick<BriefRow, "sportList">[]): string[] {
  return [...new Set(rows.flatMap((r) => r.sportList))].sort();
}

export function filterBriefs<T extends Pick<BriefRow, "state" | "sportList" | "haystack"> & { held?: boolean }>(
  rows: T[],
  f: { tab: TabKey; sport: string; q: string },
): T[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (f.tab === "all" || (f.tab === "held" ? r.held === true : r.state === f.tab)) &&
      (!f.sport || r.sportList.includes(f.sport)) &&
      (!q || r.haystack.includes(q)),
  );
}

/** The Campaigns page's link: shown only when something waits. */
export function waitingSummary(briefs: Pick<ApiBrief, "state">[]): {
  toMatch: number;
  qualified: number;
  approved: number;
  drafts: number;
} | null {
  const qualified = briefs.filter((b) => b.state === "QUALIFIED").length;
  const approved = briefs.filter((b) => b.state === "APPROVED").length;
  const drafts = briefs.filter((b) => b.state === "DRAFT").length;
  if (qualified + approved + drafts === 0) return null;
  return { toMatch: qualified + approved, qualified, approved, drafts };
}

/** Product copy for the API's refusals of a brief move. */
export function explainBriefRefusal(status: number, message?: string): string {
  if (status === 403) return "Your role can't move this brief.";
  if (status === 409) return "Someone moved this brief first — the list has been refreshed.";
  if (status === 422) return message ?? "Say why this brief is being closed.";
  return message ?? "The brief didn't move — try again in a minute.";
}
