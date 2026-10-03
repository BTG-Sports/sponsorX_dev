import type { PortfolioRow } from "@/components/sponsor-portfolio-list";
import type { CampaignRow } from "@/components/sponsor-campaigns-list";
import type { CampaignStaffing, NextStep, SponsorStaffing, StageChange } from "@/lib/campaign-stage";

/* --------------------------------------------------------------------------
   P4-FE-05 — the sponsor dashboard's live translation: GET /campaigns
   (backend/src/routes/v1/campaigns.ts) → the portfolio rows and the headline
   numbers. Pure: data and a clock in, answers out.

   WHAT IS REAL HERE, AND WHAT ISN'T YET. Campaign state, package, window,
   athletes, delivery progress and the money (contracted sell total, and the
   Zoho Books mirror's invoiced / paid) all come from Postgres. Views,
   engagement, the reward funnel and return are the report's (§9 screen 12,
   P7-FE-03) — a live row carries `views: null` rather than a number nobody
   measured, and the dashboard says where those figures live.

   PACING. "Behind" compares delivery progress against elapsed campaign time
   (the rule the fixture dashboard states): an ACTIVE campaign more than
   BEHIND_SLACK behind the calendar is flagged. A campaign with nothing to
   deliver yet can't be behind.
   -------------------------------------------------------------------------- */

export type ApiCampaign = {
  id: string;
  name: string;
  state: string;
  startDate: string;
  endDate: string;
  sponsorName: string;
  /** The brief this campaign came from, when it came from one. */
  briefId?: string | null;
  package: { code: string; name: string } | null;
  athletes: number;
  deliverables: { done: number; total: number };
  budget?: number;
  contracted?: number;
  invoiced?: number;
  paid?: number;
  /* P4-BE-09 — what happens next, and the latest stage change (optional so
     a page against an older API still renders). `stageHistory` is BTG's
     detail read only. */
  nextStep?: NextStep | null;
  stageChange?: StageChange | null;
  stageHistory?: StageChange[];
  /* P4-BE-12 — automatic staffing. BTG's staff get `autoStaffing` and every
     count with the stop; a sponsor only `signed` against the package's
     range. Null with no package to staff from. */
  autoStaffing?: boolean;
  staffing?: CampaignStaffing | SponsorStaffing | null;
};

/** The roles whose portal is the sponsor's — the gate for every live read. */
export const SPONSOR_ROLES = ["SPONSOR_ADMIN", "SPONSOR_ANALYST"];

export const BEHIND_SLACK = 0.15;
const DAY = 86_400_000;

/** Share of the campaign window that has elapsed, 0..1. */
export function elapsedShare(start: string, end: string, now: Date): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (e <= s) return now.getTime() >= e ? 1 : 0;
  return Math.min(1, Math.max(0, (now.getTime() - s) / (e - s)));
}

export function isBehind(c: ApiCampaign, now: Date): boolean {
  if (c.state !== "ACTIVE" || c.deliverables.total === 0) return false;
  const progress = c.deliverables.done / c.deliverables.total;
  return progress + BEHIND_SLACK < elapsedShare(c.startDate, c.endDate, now);
}

/** "ends in 12 days", "starts in 3 days", "ended Nov 30". */
export function windowLabel(c: ApiCampaign, now: Date): string {
  const start = new Date(c.startDate).getTime();
  const end = new Date(c.endDate).getTime();
  const t = now.getTime();
  if (t < start) {
    const d = Math.ceil((start - t) / DAY);
    return `starts in ${d} ${d === 1 ? "day" : "days"}`;
  }
  if (t <= end) {
    const d = Math.ceil((end - t) / DAY);
    return d <= 1 ? "ends today" : `ends in ${d} days`;
  }
  return `ended ${new Date(c.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

export function monogramOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
}

export function toPortfolioRow(c: ApiCampaign, now: Date): PortfolioRow {
  return {
    id: c.id,
    name: c.name,
    pkg: c.package?.name ?? "Custom",
    athletes: c.athletes,
    endsIn: windowLabel(c, now),
    monogram: monogramOf(c.name),
    views: null,
    spend: c.contracted ?? null,
    done: c.deliverables.done,
    total: c.deliverables.total,
    behind: isBehind(c, now),
    state: c.state,
  };
}

/** The same campaign, as a card on the Campaigns list (P2-FE-01). */
export function toCampaignRow(c: ApiCampaign, now: Date): CampaignRow {
  const { done, total } = c.deliverables;
  return {
    id: c.id,
    name: c.name,
    pkg: c.package?.name ?? "Custom",
    athletes: c.athletes,
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    spend: c.contracted ?? null,
    views: null,
    monogram: monogramOf(c.name),
    endsIn: windowLabel(c, now),
    state: c.state,
    behind: isBehind(c, now),
  };
}

/** The headline numbers, over every campaign returned. Money totals are
 *  null when the API withheld the column — never summed as zero. */
export function portfolioTotals(rows: ApiCampaign[]): {
  campaigns: number;
  active: number;
  athletes: number;
  contracted: number | null;
  invoiced: number | null;
  paid: number | null;
  budget: number | null;
} {
  const sum = (k: "contracted" | "invoiced" | "paid" | "budget") =>
    rows.length > 0 && rows.every((r) => typeof r[k] === "number")
      ? rows.reduce((n, r) => n + (r[k] as number), 0)
      : null;
  return {
    campaigns: rows.length,
    active: rows.filter((r) => r.state === "ACTIVE").length,
    athletes: rows.reduce((n, r) => n + r.athletes, 0),
    contracted: sum("contracted"),
    invoiced: sum("invoiced"),
    paid: sum("paid"),
    budget: sum("budget"),
  };
}
