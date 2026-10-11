/* --------------------------------------------------------------------------
   Calendar days for the house date-range picker (P1-ART-23 review,
   2026-10-12) — the pure half of components/date-range-picker.tsx, so the
   range logic, month grid and labels are unit-tested without rendering.

   A day is an ISO calendar day "YYYY-MM-DD" (no time, no zone): the value a
   URL carries (?availableFrom=2026-10-14) and the one the API is sent as
   midnight UTC. Everything here works in UTC so a day never shifts with the
   viewer's timezone.
   -------------------------------------------------------------------------- */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** A real calendar day "YYYY-MM-DD", or null (2026-02-30 is not one). */
export function parseDay(s: string | null | undefined): string | null {
  if (!s || !DAY_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

/** year, month (0–11), day (1–31) → "YYYY-MM-DD". */
export function dayOf(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" → { year, month (0–11), day }. Assumes a parsed day. */
export function partsOf(day: string): { year: number; month: number; day: number } {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) - 1, day: Number(day.slice(8, 10)) };
}

/** A month in view: year + month (0–11). */
export type MonthView = { year: number; month: number };

/** Move a month view by n months (negative goes back), across years. */
export function addMonths(v: MonthView, n: number): MonthView {
  const i = v.year * 12 + v.month + n;
  return { year: Math.floor(i / 12), month: ((i % 12) + 12) % 12 };
}

/** Compare month views: <0 if a is before b, 0 same month, >0 after. */
export function compareMonths(a: MonthView, b: MonthView): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

/** The month a day sits in. */
export function monthOf(day: string): MonthView {
  const p = partsOf(day);
  return { year: p.year, month: p.month };
}

/** A month's grid: weekday (0 = Sunday) of the 1st, and how many days. */
export function monthGrid(v: MonthView): { startDow: number; daysInMonth: number } {
  return {
    startDow: new Date(Date.UTC(v.year, v.month, 1)).getUTCDay(),
    daysInMonth: new Date(Date.UTC(v.year, v.month + 1, 0)).getUTCDate(),
  };
}

/** A day moved by n days (negative goes back). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The same day-of-month n months on, clamped to that month's last day. */
export function shiftMonths(day: string, n: number): string {
  const p = partsOf(day);
  const v = addMonths({ year: p.year, month: p.month }, n);
  return dayOf(v.year, v.month, Math.min(p.day, monthGrid(v).daysInMonth));
}

/** Day clamped into [min, max] (either bound optional). ISO days sort as strings. */
export function clampDay(day: string, min?: string | null, max?: string | null): string {
  if (min && day < min) return min;
  if (max && day > max) return max;
  return day;
}

/** Is the day pickable under the optional bounds? */
export function inBounds(day: string, min?: string | null, max?: string | null): boolean {
  return (!min || day >= min) && (!max || day <= max);
}

/**
 * A click on `day` given the current range. One click starts a range and,
 * alone, means that single day (`to` null); a second, different day
 * completes it, in either order. A range already complete — or a click on
 * the start day again — starts over. `to === from` counts as single.
 */
export function pickDay(from: string | null, to: string | null, day: string): { from: string; to: string | null } {
  const single = from !== null && (to === null || to === from);
  if (single && day !== from) return day < from! ? { from: day, to: from } : { from: from!, to: day };
  return { from: day, to: null };
}

/** "Oct 14, 2026". */
export function fmtDay(day: string, withYear = true): string {
  const p = partsOf(day);
  return `${MONTH_SHORT[p.month]} ${p.day}${withYear ? `, ${p.year}` : ""}`;
}

/**
 * The trigger's words: the all-label, "Oct 14, 2026", "Oct 14 – Nov 2, 2026"
 * (one year), or "Dec 20, 2026 – Jan 5, 2027" (across years).
 */
export function dayRangeLabel(from: string | null, to: string | null, allLabel = "Any dates"): string {
  if (!from) return allLabel;
  if (!to || to === from) return fmtDay(from);
  return from.slice(0, 4) === to.slice(0, 4) ? `${fmtDay(from, false)} – ${fmtDay(to)}` : `${fmtDay(from)} – ${fmtDay(to)}`;
}

/** Today's UTC calendar day. */
export function todayDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
