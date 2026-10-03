/**
 * The shortlist's rank, and the reasons for it — P4-BE-08 (BTG admin review
 * item 19; programme owner, 2026-10-03).
 *
 * BTG still chooses who is invited and still sends every invitation and
 * offer. What changes is that the shortlist arrives in a sensible order with
 * its reasons attached, so the desk checks a ranking rather than building
 * one. Pure — no database, no clock unless one is passed — so every rule
 * here is a unit test away.
 *
 * FIVE SIGNALS, 100 POINTS (MATCH_WEIGHTS). Each produces a reason with the
 * points it earned, so "why is she third?" is answered by the row itself:
 *
 *   sport   30  plays a sport the brief names — or the brief names none
 *   state   20  based in a state the brief names — or the brief names none
 *   work    20  VERIFIED deliverables on past campaigns, WORK_POINTS_PER_
 *               VERIFIED each (4), so five verified deliverables is full marks
 *   rate    20  the athlete's current rate for the brief's jobs, at the 1.4×
 *               margin floor, against their share of the budget (below)
 *   recent  10  accepted an offer in the last RECENT_DAYS (60) — or half
 *               points inside RECENT_PARTIAL_DAYS (180)
 *
 * An empty sport or state list means "no preference", never "nobody" — the
 * same rule the eligibility query uses — so it scores full points.
 *
 * RATE FIT. The brief's jobs are its package's lines (job × quantity per
 * athlete); the athlete's cost is Σ current rate × quantity, and what the
 * sponsor must pay for it is that cost at the margin floor (lineFloor, 1.4×,
 * the figure the offer and the budget checks use). The share it is measured
 * against is the budget split across the package's maximum roster
 * (athleteCountMax — the slots the matching desk fills). Within the share
 * scores full points; at RATE_ZERO_AT (2×) the share or more, none; linearly
 * between. A brief with no package has no jobs and no roster size: the
 * athlete's cheapest current rate is measured against the whole budget. A
 * package job with no rate on file scores nothing — the desk cannot price
 * that athlete, and a missing rate is not a cheap one.
 *
 * A SIGNAL THE CALLER MAY NOT READ IS ABSENT, NOT ZERO. Rates are §7.1
 * BTG-internal, and past orders are campaign-order data; a caller without
 * them gets no reason for that signal and no points from it. Ranking by a
 * column the caller cannot read would leak it (the shortlist's own score sort
 * makes the same choice).
 */
import { lineFloor } from "./margin-floor";

export const MATCH_WEIGHTS = { sport: 30, state: 20, work: 20, rate: 20, recent: 10 } as const;

/** Points per verified deliverable; capped at MATCH_WEIGHTS.work (five = full). */
export const WORK_POINTS_PER_VERIFIED = 4;
/** "Recently active": an acceptance this recent earns full points… */
export const RECENT_DAYS = 60;
/** …and one this recent earns half. Older, or none, earns nothing. */
export const RECENT_PARTIAL_DAYS = 180;
/** Needing this multiple of the budget share (or more) scores no rate points. */
export const RATE_ZERO_AT = 2;

export type MatchReasonKey = keyof typeof MATCH_WEIGHTS;
export type MatchReason = { key: MatchReasonKey; text: string; points: number };
export type MatchRank = { score: number; reasons: MatchReason[] };

/** What the brief asks for, in the terms scoring needs. */
export type MatchBrief = {
  sports: readonly string[];
  stateCodes: readonly string[];
  /** cents */
  budget: number;
  /** The package's lines; empty when the brief has no package. */
  lines: readonly { jobId: string; quantity: number }[];
  /** How many athletes the budget is split across (the package's maximum
   *  roster); 1 without a package. */
  slots: number;
};

/** What is known about one athlete. An `undefined` signal is one the caller
 *  may not read: it scores nothing and gives no reason. */
export type MatchSignals = {
  sport: string;
  stateCode: string | null;
  /** VERIFIED deliverables on past campaigns. */
  verifiedDeliverables?: number;
  /** Current rate per job, cents. */
  rates?: readonly { jobId: string; amount: number }[];
  /** The latest offer or order the athlete accepted; null for none. */
  lastAcceptedAt?: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const US_STATE_NAMES: Readonly<Record<string, string>> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "Washington, D.C.", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};

const stateName = (code: string) => US_STATE_NAMES[code.toUpperCase()] ?? code;

function sportReason(a: MatchSignals, b: MatchBrief): MatchReason {
  const sports = b.sports.filter(Boolean);
  if (sports.length === 0) return { key: "sport", text: "The brief names no sport", points: MATCH_WEIGHTS.sport };
  return sports.includes(a.sport)
    ? { key: "sport", text: `Plays ${a.sport.toLowerCase()}`, points: MATCH_WEIGHTS.sport }
    : { key: "sport", text: `Plays ${a.sport.toLowerCase()}, not a sport the brief names`, points: 0 };
}

function stateReason(a: MatchSignals, b: MatchBrief): MatchReason {
  const codes = b.stateCodes.filter(Boolean);
  if (codes.length === 0) return { key: "state", text: "The brief names no state", points: MATCH_WEIGHTS.state };
  if (!a.stateCode) return { key: "state", text: "No home state on file", points: 0 };
  return codes.includes(a.stateCode)
    ? { key: "state", text: `Based in ${stateName(a.stateCode)}`, points: MATCH_WEIGHTS.state }
    : { key: "state", text: `Based in ${stateName(a.stateCode)}, outside the brief's states`, points: 0 };
}

function workReason(n: number): MatchReason {
  if (n <= 0) return { key: "work", text: "No verified deliverables on past campaigns yet", points: 0 };
  return {
    key: "work",
    text: `${n} deliverable${n === 1 ? "" : "s"} verified on past campaigns`,
    points: Math.min(MATCH_WEIGHTS.work, n * WORK_POINTS_PER_VERIFIED),
  };
}

function rateReason(rates: readonly { jobId: string; amount: number }[], b: MatchBrief): MatchReason {
  const rate = (jobId: string) => rates.find((r) => r.jobId === jobId)?.amount;
  let cost: number;
  let fits: string;
  if (b.lines.length) {
    const missing = b.lines.find((l) => rate(l.jobId) === undefined);
    if (missing) return { key: "rate", text: `No rate on file for ${missing.jobId}`, points: 0 };
    cost = b.lines.reduce((n, l) => n + rate(l.jobId)! * l.quantity, 0);
    fits = b.lines.length === 1 ? "Rate for this job fits the budget" : "Rates for this package's jobs fit the budget";
  } else {
    if (!rates.length) return { key: "rate", text: "No rate on file", points: 0 };
    cost = Math.min(...rates.map((r) => r.amount));
    fits = "Cheapest rate on file fits the budget";
  }
  const share = Math.floor(b.budget / Math.max(1, b.slots));
  if (!(share > 0)) return { key: "rate", text: "The brief has no budget to measure the rate against", points: 0 };
  const need = lineFloor(cost);
  if (need <= share) return { key: "rate", text: fits, points: MATCH_WEIGHTS.rate };
  const over = need / share;
  if (over >= RATE_ZERO_AT) return { key: "rate", text: `Rate needs at least ${RATE_ZERO_AT}× this athlete's share of the budget`, points: 0 };
  return {
    key: "rate",
    text: `Rate is ${Math.round((over - 1) * 100)}% over this athlete's share of the budget`,
    points: Math.round((MATCH_WEIGHTS.rate * (RATE_ZERO_AT - over)) / (RATE_ZERO_AT - 1)),
  };
}

function recentReason(at: Date | null, now: Date): MatchReason {
  if (!at) return { key: "recent", text: "Has not accepted an offer yet", points: 0 };
  const days = (now.getTime() - at.getTime()) / DAY_MS;
  if (days <= RECENT_DAYS) return { key: "recent", text: `Accepted an offer in the last ${RECENT_DAYS} days`, points: MATCH_WEIGHTS.recent };
  if (days <= RECENT_PARTIAL_DAYS) return { key: "recent", text: "Accepted an offer in the last 6 months", points: Math.round(MATCH_WEIGHTS.recent / 2) };
  return { key: "recent", text: "Last accepted an offer over 6 months ago", points: 0 };
}

const KEY_ORDER: readonly MatchReasonKey[] = ["sport", "state", "work", "rate", "recent"];

/**
 * One athlete against one brief: a 0–100 score and every reason behind it,
 * strongest first (ties in signal order, so the list never reshuffles).
 */
export function scoreAthlete(a: MatchSignals, b: MatchBrief, now: Date = new Date()): MatchRank {
  const reasons: MatchReason[] = [sportReason(a, b), stateReason(a, b)];
  if (a.verifiedDeliverables !== undefined) reasons.push(workReason(a.verifiedDeliverables));
  if (a.rates !== undefined) reasons.push(rateReason(a.rates, b));
  if (a.lastAcceptedAt !== undefined) reasons.push(recentReason(a.lastAcceptedAt, now));
  reasons.sort((x, y) => y.points - x.points || KEY_ORDER.indexOf(x.key) - KEY_ORDER.indexOf(y.key));
  const score = Math.max(0, Math.min(100, reasons.reduce((n, r) => n + r.points, 0)));
  return { score, reasons };
}

/**
 * The shortlist's order: score, high to low; then name, then id. Code-unit
 * comparison rather than a locale's, so the order is the same on every
 * machine and every page slice of it agrees with the next.
 */
export function byMatch(
  x: { score: number; displayName: string; id: string },
  y: { score: number; displayName: string; id: string },
): number {
  if (x.score !== y.score) return y.score - x.score;
  if (x.displayName !== y.displayName) return x.displayName < y.displayName ? -1 : 1;
  return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
}

/** A package's line items (`[{ jobCode, quantityPerAthlete }]`), read
 *  defensively — the column is JSON. The brief read parses them the same way. */
export function packageLines(lineItems: unknown): { jobId: string; quantity: number }[] {
  if (!Array.isArray(lineItems)) return [];
  return (lineItems as { jobCode?: unknown; quantityPerAthlete?: unknown }[])
    .filter((l) => l && typeof l.jobCode === "string")
    .map((l) => ({
      jobId: l.jobCode as string,
      quantity: typeof l.quantityPerAthlete === "number" && l.quantityPerAthlete > 0 ? l.quantityPerAthlete : 1,
    }));
}
