/**
 * POL-BE-107 — the country a campaign brief targets. Pure.
 *
 * A brief names one country (ISO 3166-1 alpha-2, default US). Only athletes
 * whose `countryCode` is that country are matched, staffed or counted for
 * automatic approval (matching.ts `athleteFit`, match-engine.ts). US state
 * codes narrow a US brief; outside the US the brief targets the whole country,
 * so states are refused there rather than silently matching nobody (no athlete
 * abroad has a US state).
 */

export const DEFAULT_BRIEF_COUNTRY = "US";

export class BriefCountryError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "BriefCountryError";
  }
}

/* Intl knows every assigned region code; an unassigned one comes back as
   itself (e.g. "XX" → "XX"), which is how an invented code is refused. A few
   codes it names are not countries: ZZ ("Unknown Region") and the groupings. */
const regionNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "code" });
const NOT_COUNTRIES = new Set(["ZZ", "EU", "EZ", "UN", "QO"]);

/** True for an assigned ISO 3166-1 alpha-2 country code, upper case. */
export function isCountryCode(code: string): boolean {
  if (!/^[A-Z]{2}$/.test(code) || NOT_COUNTRIES.has(code)) return false;
  return regionNames.of(code) !== code;
}

/** The brief's country, upper-cased and checked; absent means US. */
export function briefCountry(input: string | null | undefined): string {
  const code = (input ?? "").trim().toUpperCase() || DEFAULT_BRIEF_COUNTRY;
  if (!isCountryCode(code)) throw new BriefCountryError("Choose a country by its two-letter code, e.g. US or CA.");
  return code;
}

/** States are US states: allowed only on a US brief. */
export function assertCountryStates(countryCode: string, stateCodes: readonly string[]): void {
  if (countryCode !== DEFAULT_BRIEF_COUNTRY && stateCodes.some((s) => s.trim() !== "")) {
    throw new BriefCountryError("States can only be chosen for the United States. Outside the US a campaign covers the whole country.");
  }
}
