/**
 * Closing an account and coming back — the rules, 2S1-BE-13. Pure: no
 * Prisma, no config, so the 30-day arithmetic and the "who may come back by
 * themselves" rule are testable without a database.
 *
 * The agreed rules (programme owner, 2026-10-01):
 *   - a closed or rejected account's ID and verification files are kept for
 *     30 days after it closes, then deleted for good;
 *   - an account its owner closed comes back by itself within those 30 days,
 *     from the reactivation page — files restored, checks re-run;
 *   - a rejected account can only ASK; BTG decides;
 *   - after 30 days, coming back means signing up again.
 */

export const RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

/* The four kinds of account — and, for a Reject before approval, the
   application itself (2S1-BE-13 review fix): ONBOARDING is an organisation's
   PropertyOnboarding that never got a Property, INQUIRY a sponsor request
   declined before an account opened. Their uploaded documents are on the
   same 30-day purge, and they can ask BTG to look again. */
export const CLOSURE_SUBJECTS = ["ATHLETE", "GUARDIAN", "PROPERTY", "SPONSOR", "ONBOARDING", "INQUIRY"] as const;
export type ClosureSubject = (typeof CLOSURE_SUBJECTS)[number];
export type ClosureCause = "SELF" | "REJECTED" | "TERMINATED";
export type ClosureState = "CLOSED" | "REACTIVATED" | "PURGED";

/** The marker a closure leaves on each login it switched off, so coming back
 *  switches on exactly those and never one BTG switched off for another reason. */
export const closureMarker = (closureId: string) => `accountClosure:${closureId}`;

export function retainUntilFrom(closedAt: Date): Date {
  return new Date(closedAt.getTime() + RETENTION_DAYS * DAY_MS);
}

/** What the reactivation page shows, from the closure as recorded. */
export type ReactivationStanding =
  /** Closed by its owner, inside the 30 days: Reactivate is theirs to press. */
  | "CLOSED_SELF"
  /** Rejected by BTG (or ended by the coming-of-age rule): it can only ask. */
  | "CLOSED_BY_BTG"
  /** Already back. */
  | "REACTIVATED"
  /** The 30 days are up (or the files are gone): sign up again. */
  | "EXPIRED";

export function reactivationStanding(
  c: { cause: string; state: string; retainUntil: Date },
  now = new Date(),
): ReactivationStanding {
  if (c.state === "REACTIVATED") return "REACTIVATED";
  if (c.state === "PURGED" || c.retainUntil.getTime() <= now.getTime()) return "EXPIRED";
  return c.cause === "SELF" ? "CLOSED_SELF" : "CLOSED_BY_BTG";
}

/** Whole days left in the retention window, never below zero. */
export function retentionDaysLeft(retainUntil: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((retainUntil.getTime() - now.getTime()) / DAY_MS));
}

/** "Oct 31, 2026" — how emails write the date the files go. */
export function dayWords(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
