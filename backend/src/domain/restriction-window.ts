/**
 * Restriction windows — whole UTC days. Pure, so the match rules
 * (match-rules.ts) can use them without a database client;
 * restrictions.ts re-exports them for everything else.
 */

/** The first and last millisecond of a date's UTC day — windows are whole days. */
export const dayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const dayEnd = (d: Date) => new Date(dayStart(d).getTime() + 864e5 - 1);

/**
 * Do two windows overlap? Compared by whole UTC days — two bookings on the
 * same day clash whatever their times — and a null end is open on that side.
 */
export function overlaps(a: { startsOn: Date | null; endsOn: Date | null }, b: { startsOn: Date; endsOn: Date }): boolean {
  return (a.startsOn === null || dayStart(a.startsOn) <= dayEnd(b.endsOn)) && (a.endsOn === null || dayEnd(a.endsOn) >= dayStart(b.startsOn));
}
