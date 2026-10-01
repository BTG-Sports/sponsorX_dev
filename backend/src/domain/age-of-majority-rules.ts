/**
 * The age of majority, and who counts as a minor — 2S1-BE-12.
 *
 * Pure, like `guardian-rules.ts`: no Prisma, no config, so the rule that
 * decides whether a sixteen-year-old needs a guardian is testable anywhere.
 *
 * WHERE THE AGE COMES FROM. The athlete's place — their country, and within
 * the US their state — looked up in BTG's editable table (`AgeOfMajority`).
 * The most specific row wins: a region row ("US"/"AL" → 19), then the
 * country row ("US"/"" → 18). A place with neither counts as 18 and is
 * FLAGGED, so BTG can add it: guessing high would lock an adult out, guessing
 * low would let a minor sign alone, and neither should happen silently.
 *
 * A tenant that has never edited its table reads `DEFAULT_AGE_TABLE` below.
 * The migration seeds the same rows into every tenant that existed then, and
 * the first edit materialises them for a tenant that didn't — so "the table"
 * is always one list, never defaults and overrides in two places.
 */

export type AgeRow = { countryCode: string; regionCode: string; age: number };
export type Majority = { age: number; known: boolean };

/** Counted when a place is not in the table — and flagged. */
export const UNKNOWN_PLACE_AGE = 18;
/** The bounds an edit may set. Nowhere uses an age outside them. */
export const MIN_MAJORITY_AGE = 14;
export const MAX_MAJORITY_AGE = 25;

const US_STATES = [
  "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MO", "MT", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

/**
 * The seeded table. US: every state at 18 except Alabama and Nebraska (19)
 * and Mississippi (21); Puerto Rico 21. Canada: 18, with the provinces and
 * territories that use 19. Then common countries at their general age.
 */
export const DEFAULT_AGE_TABLE: readonly AgeRow[] = [
  { countryCode: "US", regionCode: "", age: 18 },
  ...US_STATES.map((s) => ({ countryCode: "US", regionCode: s, age: 18 })),
  { countryCode: "US", regionCode: "AL", age: 19 },
  { countryCode: "US", regionCode: "NE", age: 19 },
  { countryCode: "US", regionCode: "MS", age: 21 },
  { countryCode: "US", regionCode: "PR", age: 21 },
  { countryCode: "PR", regionCode: "", age: 21 },
  { countryCode: "CA", regionCode: "", age: 18 },
  ...["BC", "NB", "NL", "NS", "NT", "NU", "YT"].map((p) => ({ countryCode: "CA", regionCode: p, age: 19 })),
  ...["AB", "MB", "ON", "PE", "QC", "SK"].map((p) => ({ countryCode: "CA", regionCode: p, age: 18 })),
  ...["GB", "IE", "MX", "AU", "NZ", "DE", "FR", "ES", "IT", "JP", "BR", "NG", "PH", "IN", "JM", "DO"].map((c) => ({ countryCode: c, regionCode: "", age: 18 })),
  { countryCode: "KR", regionCode: "", age: 19 },
];

/** "USA", "United States", "us" → "US"; a two-letter code as given; anything else null. */
export function countryCodeFrom(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toUpperCase().replace(/\./g, "");
  if (!v) return null;
  if (["USA", "US", "UNITED STATES", "UNITED STATES OF AMERICA", "AMERICA"].includes(v)) return "US";
  if (["UK", "UNITED KINGDOM", "GREAT BRITAIN", "ENGLAND", "SCOTLAND", "WALES"].includes(v)) return "GB";
  if (v === "CANADA") return "CA";
  if (v === "MEXICO") return "MX";
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

/** The age for a place: its region row, else its country row, else 18 and unknown. */
export function majorityFor(table: readonly AgeRow[], countryCode: string | null | undefined, regionCode: string | null | undefined): Majority {
  const country = (countryCode ?? "").trim().toUpperCase();
  const region = (regionCode ?? "").trim().toUpperCase();
  if (!country) return { age: UNKNOWN_PLACE_AGE, known: false };
  const exact = region ? table.find((r) => r.countryCode === country && r.regionCode === region) : undefined;
  if (exact) return { age: exact.age, known: true };
  const whole = table.find((r) => r.countryCode === country && r.regionCode === "");
  /* A US state the table doesn't name is still in the US: the country row
     answers it, and "unknown" is kept for places with no row at all. */
  if (whole) return { age: whole.age, known: true };
  return { age: UNKNOWN_PLACE_AGE, known: false };
}

/** The day someone born on `birthDate` reaches `age` (UTC). */
export function dayOfMajority(birthDate: Date, age: number): Date {
  const d = new Date(birthDate);
  d.setUTCFullYear(d.getUTCFullYear() + age);
  return d;
}

/** Under their place's age of majority on `on`. No birth date → not known to be a minor. */
export function isMinorAt(birthDate: Date | null | undefined, age: number, on: Date = new Date()): boolean {
  if (!birthDate) return false;
  return dayOfMajority(birthDate, age) > on;
}

/** The coming-of-age allowance: 90 days to upload a government ID. */
export const COMING_OF_AGE_DAYS = 90;
/** Reminder emails go out this many days before the allowance ends (90 = when it starts). */
export const COMING_OF_AGE_REMINDERS = [90, 30, 14, 7, 1] as const;

/**
 * Which reminders are due now and not yet sent: every threshold whose day
 * has arrived. Sent in one sweep they collapse to the latest — a sweep that
 * was down for a week sends one reminder, not three.
 */
export function dueReminders(dueAt: Date, sent: readonly number[], now: Date = new Date()): number[] {
  const daysLeft = Math.ceil((dueAt.getTime() - now.getTime()) / 86_400_000);
  const due = COMING_OF_AGE_REMINDERS.filter((d) => daysLeft <= d && !sent.includes(d));
  return due.length ? [Math.min(...due)] : [];
}

/** The allowance is running: started, not completed, not terminated. */
export function comingOfAgeOpen(a: {
  comingOfAgeStartedAt?: Date | null; comingOfAgeCompletedAt?: Date | null; comingOfAgeTerminatedAt?: Date | null;
}): boolean {
  return Boolean(a.comingOfAgeStartedAt && !a.comingOfAgeCompletedAt && !a.comingOfAgeTerminatedAt);
}
