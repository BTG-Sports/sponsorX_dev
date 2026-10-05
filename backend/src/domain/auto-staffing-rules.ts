/**
 * Campaigns that staff themselves, then launch on their start date —
 * P4-BE-12 and P4-BE-13 (BTG admin review, items 19 and 20). Pure, like
 * every other rule file: the facts come in, the answer goes out, and
 * persistence lives in auto-staffing.ts.
 *
 * The programme owner (2026-10-03): Phase 2 overrides Phase 1's "BTG does it
 * by hand". Automatic when every safety check passes; BTG gets only the
 * exceptions, with the reason.
 *
 * STAFFING, COUNTED BY ATHLETE. A package is sold as a number of athletes
 * (athleteCountMin–athleteCountMax), each delivering every job line, so
 * everything here counts distinct athletes:
 *
 *   signed   holds a signed order (ACCEPTED, ACTIVE or COMPLETED)
 *   waiting  not signed, but still being asked: a SENT offer inside its
 *            window, a DRAFT offer or order BTG has not sent, a SENT order,
 *            an open invitation inside its window, or an accepted invitation
 *            BTG has not yet turned into an order
 *   in play  signed + waiting — what the package's maximum is counted against
 *
 * The system offers the next-ranked athlete while in play is below the
 * maximum. It stops — and hands the campaign to BTG, once, with the reason
 * — when the ranked list runs out with in play still below the minimum, or
 * when the next athlete would carry the committed spend past the budget.
 *
 * COMMITTED SPEND is the sponsor price (sellPrice) the campaign already
 * owes or has offered: every order not REJECTED or CANCELLED, and every
 * offer still DRAFT or SENT inside its window. Never above Campaign.budget.
 *
 * LAUNCH DAY is the start of the campaign's startDate in UTC. A campaign in
 * APPROVAL launches on its own from that instant — at once when the day has
 * already passed. APPROVAL waits for nothing else: the code has no sponsor
 * approval or signature step between APPROVAL and ACTIVE (the sponsor signs
 * nothing at campaign level; the athletes' orders are the signatures).
 */

import { packageLines } from "./match-score";

/** How long an athlete has to answer an automatic offer — not the 7-day default. */
export const AUTO_OFFER_WINDOW_DAYS = 3;

/** Rows the ranked shortlist is read to. Past this the list counts as run out. */
export const AUTO_STAFFING_SHORTLIST = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

export type StaffingCounts = {
  /** Athletes ever sent an offer on the campaign (any outcome). */
  sent: number;
  signed: number;
  /** Athletes still being asked (see "waiting" above). */
  outstanding: number;
  /** Athletes who declined an offer, and have nothing else in play. */
  declined: number;
  /** Athletes whose offer ran out unanswered, and have nothing else in play. */
  expired: number;
  /** Athletes automatic staffing skipped, with the reason recorded. */
  skipped: number;
};

export type StaffingStop = { reason: string; at: string };

/** What the campaign reads add (P4-BE-12). */
export type StaffingView = StaffingCounts & {
  needed: { min: number; max: number };
  stop: StaffingStop | null;
};

/** What the tally reads: the campaign's orders, offers, invitations and skips. */
export type StaffingRows = {
  orders: ReadonlyArray<{ athleteId: string; jobId: string; state: string; sellPrice: number }>;
  offers: ReadonlyArray<{ athleteId: string; state: string; expiresAt: Date; sellPrice: number; sentAt: Date | null }>;
  invites: ReadonlyArray<{ athleteId: string; jobId: string; state: string; expiresAt: Date }>;
  skips: ReadonlyArray<{ athleteId: string }>;
};

export type StaffingTally = StaffingCounts & {
  /** Every athlete already approached on the campaign in any way — never offered automatically again. */
  approached: Set<string>;
  /** Sponsor price already owed or offered, cents (COMMITTED SPEND above). */
  committed: number;
};

const SIGNED_ORDER = new Set(["ACCEPTED", "ACTIVE", "COMPLETED"]);
const SETTLED_ORDER = new Set(["REJECTED", "CANCELLED"]);
const OPEN_INVITE = new Set(["INVITED", "VIEWED"]);

/** Count a campaign's staffing by athlete — the one tally the sends and the reads share. */
export function tallyStaffing(r: StaffingRows, now: Date): StaffingTally {
  const live = (d: Date) => d.getTime() > now.getTime();
  const signed = new Set(r.orders.filter((o) => SIGNED_ORDER.has(o.state)).map((o) => o.athleteId));
  const ordered = new Set(r.orders.map((o) => `${o.athleteId}|${o.jobId}`));
  const waiting = new Set<string>();
  for (const o of r.orders) if (o.state === "DRAFT" || o.state === "SENT") waiting.add(o.athleteId);
  for (const o of r.offers) if (o.state === "DRAFT" || (o.state === "SENT" && live(o.expiresAt))) waiting.add(o.athleteId);
  for (const i of r.invites) {
    if (OPEN_INVITE.has(i.state) && live(i.expiresAt)) waiting.add(i.athleteId);
    if (i.state === "ACCEPTED" && !ordered.has(`${i.athleteId}|${i.jobId}`)) waiting.add(i.athleteId);
  }
  for (const a of signed) waiting.delete(a);
  const inPlay = (a: string) => signed.has(a) || waiting.has(a);

  const declined = new Set<string>();
  for (const o of r.offers) if (o.state === "DECLINED" && !inPlay(o.athleteId)) declined.add(o.athleteId);
  for (const o of r.orders) if (o.state === "REJECTED" && !inPlay(o.athleteId)) declined.add(o.athleteId);
  for (const i of r.invites) if (i.state === "DECLINED" && !inPlay(i.athleteId)) declined.add(i.athleteId);
  const expired = new Set<string>();
  for (const o of r.offers) if (o.state === "SENT" && !live(o.expiresAt) && !inPlay(o.athleteId) && !declined.has(o.athleteId)) expired.add(o.athleteId);
  for (const i of r.invites) {
    const lapsed = i.state === "EXPIRED" || (OPEN_INVITE.has(i.state) && !live(i.expiresAt));
    if (lapsed && !inPlay(i.athleteId) && !declined.has(i.athleteId)) expired.add(i.athleteId);
  }

  const committed =
    r.orders.filter((o) => !SETTLED_ORDER.has(o.state)).reduce((n, o) => n + o.sellPrice, 0) +
    r.offers.filter((o) => o.state === "DRAFT" || (o.state === "SENT" && live(o.expiresAt))).reduce((n, o) => n + o.sellPrice, 0);

  return {
    sent: new Set(r.offers.filter((o) => o.sentAt !== null).map((o) => o.athleteId)).size,
    signed: signed.size,
    outstanding: waiting.size,
    declined: declined.size,
    expired: expired.size,
    skipped: new Set(r.skips.map((s) => s.athleteId)).size,
    approached: new Set([...r.orders, ...r.offers, ...r.invites, ...r.skips].map((x) => x.athleteId)),
    committed,
  };
}

/**
 * Does this package staff athletes — job lines, and room for at least one
 * athlete? Automatic staffing is on by default exactly for these. A NEXT
 * (ad-only) package has no lines and no athletes, so a campaign sold from it
 * keeps its own path (DRAFT → APPROVAL); no package at all, BTG staffs by hand.
 */
export function staffsAthletes(pkg: { athleteCountMax: number; lineItems: unknown } | null | undefined): boolean {
  return !!pkg && pkg.athleteCountMax > 0 && packageLines(pkg.lineItems).length > 0;
}

/** How many more athletes the system should ask now. Never negative. */
export function athletesToAsk(f: { signed: number; outstanding: number; max: number }): number {
  return Math.max(0, f.max - f.signed - f.outstanding);
}

/** The list ran out: a stop only while the minimum can no longer be reached. */
export function exhaustedBelowMinimum(f: { signed: number; outstanding: number; min: number }): boolean {
  return f.signed + f.outstanding < f.min;
}

/** Does the next athlete's sponsor price fit what the budget has left? */
export function fitsBudget(committed: number, next: number, budget: number): boolean {
  return committed + next <= budget;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const usd = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/** The stop reasons, in words BTG acts on. */
export const STOP_REASONS = {
  exhausted: (f: { signed: number; outstanding: number; min: number }) =>
    `No eligible athlete is left to offer: ${f.signed} signed and ${f.outstanding} waiting, below the package's minimum of ${f.min}.`,
  budget: (f: { athlete: string; next: number; committed: number; budget: number }) =>
    `The budget can't cover the next athlete: ${f.athlete} at ${usd(f.next)} would take the committed ${usd(f.committed)} past the ${usd(f.budget)} budget.`,
} as const;

/** BTG's line while the system staffs, e.g. "Offers out to 7 athletes — 4 signed, 3 waiting". */
export function staffingLine(s: StaffingCounts): string {
  const out = s.signed + s.outstanding;
  if (out === 0) return "Automatic staffing is lining up the first offers";
  return `Offers out to ${plural(out, "athlete")} — ${s.signed} signed, ${s.outstanding} waiting`;
}

/** The sponsor's line, e.g. "We're staffing your campaign: 4 of 5–9 athletes signed". */
export function sponsorStaffingLine(s: { signed: number; needed: { min: number; max: number } }): string {
  const { min, max } = s.needed;
  const range = min === max ? `${max}` : `${min}–${max}`;
  return `We're staffing your campaign: ${s.signed} of ${range} athletes signed`;
}

/** 00:00 UTC on the campaign's start date — the instant it launches from. */
export function launchDay(startDate: Date): Date {
  return new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
}

/** Is the campaign due to launch at `now`? */
export function launchDue(startDate: Date, now: Date): boolean {
  return launchDay(startDate).getTime() <= now.getTime();
}

/** The first instant after `now`'s UTC day — a campaign starting before it is due. */
export function dueBefore(now: Date): Date {
  return new Date(launchDay(now).getTime() + DAY_MS);
}

/** "Launches on Oct 10", or "Launches in the next few minutes" once the day has come. */
export function launchLine(startDate: Date, now: Date): string {
  if (launchDue(startDate, now)) return "Launches in the next few minutes";
  return `Launches on ${launchDay(startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

/** The answer window for an automatic offer sent at `now`. */
export function autoOfferExpiry(now: Date): Date {
  return new Date(now.getTime() + AUTO_OFFER_WINDOW_DAYS * DAY_MS);
}
