/* --------------------------------------------------------------------------
   The sign-up rules' age-of-majority table, as the Control Panel shows it
   (P1-ART-17, /admin/new-signups/rules). Pure: the country rail, one
   country's split into exceptions and places that follow its default, and
   a search across every country — over GET /signup-rules/age-table's rows.

   BUILT FOR SCALE (owner, 2026-10-05: "what if there are more countries and
   more states / provinces"). The page never renders the whole table: a rail
   lists countries (it scrolls inside its panel), one country shows at a
   time, and inside it only the EXCEPTIONS — places whose age differs from the
   country's own row — are big tiles; places that follow the default are
   small chips, capped (FOLLOWING_SHOWN) behind "Show all". So 20 countries or
   200, 13 provinces or 37, the page stays about the same height.

   The table is still a bounded catalogue (one row per place that has its own
   age), so it is read whole and filtered here — the one kind of list the
   house pagination rule lets stay client-side.
   -------------------------------------------------------------------------- */

import { REGION_NAMES } from "./region-names";

export type AgeRow = { id: string; countryCode: string; regionCode: string; age: number; updatedBy: string | null; updatedAt: string };

/** How many "follow the default" chips a country shows before "Show all". */
export const FOLLOWING_SHOWN = 40;

/** "AL, US", or "All of US" for the whole-country row. */
export function placeLabel(r: Pick<AgeRow, "countryCode" | "regionCode">): string {
  return r.regionCode ? `${r.regionCode}, ${r.countryCode}` : `All of ${r.countryCode}`;
}

export type AgeBand = "young" | "eighteen" | "nineteen" | "older";

/** The colour band: under 18, the common 18, 19, and 20 and up. */
export function ageBand(age: number): AgeBand {
  if (age < 18) return "young";
  if (age === 18) return "eighteen";
  if (age === 19) return "nineteen";
  return "older";
}

let regionNames: Intl.DisplayNames | null | undefined;
/** "United States" for US — the browser's own names; the code if it has none. */
export function countryName(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** "Alabama" for US-AL, or null when the list has no name for it. */
export function regionName(country: string, region: string): string | null {
  return REGION_NAMES[country]?.[region] ?? null;
}

/** "Alabama, United States" · "United States" · "XX, United States" (no name known). */
export function placeName(r: Pick<AgeRow, "countryCode" | "regionCode">): string {
  if (!r.regionCode) return countryName(r.countryCode);
  return `${regionName(r.countryCode, r.regionCode) ?? r.regionCode}, ${countryName(r.countryCode)}`;
}

export type CountryEntry = {
  country: string;
  name: string;
  /** The whole-country row's age — the default its places follow — or null. */
  defaultAge: number | null;
  places: number;
  /** Places whose age differs from the default. */
  exceptions: number;
  /** Any place here not at 18 — what the rail's "Not 18" filter keeps. */
  not18: boolean;
};

/** The rail: one entry per country, the biggest first, then by name. */
export function countryIndex(rows: readonly AgeRow[]): CountryEntry[] {
  const by = new Map<string, AgeRow[]>();
  for (const r of rows) by.set(r.countryCode, [...(by.get(r.countryCode) ?? []), r]);
  return [...by.entries()]
    .map(([country, list]) => {
      const def = list.find((r) => !r.regionCode) ?? null;
      const regions = list.filter((r) => r.regionCode);
      return {
        country,
        name: countryName(country),
        defaultAge: def?.age ?? null,
        places: list.length,
        exceptions: def ? regions.filter((r) => r.age !== def.age).length : 0,
        not18: list.some((r) => r.age !== 18),
      };
    })
    .sort((a, b) => b.places - a.places || a.name.localeCompare(b.name));
}

export type CountryDetail = {
  country: string;
  name: string;
  defaultRow: AgeRow | null;
  /** Big tiles: places that differ from the default (every place, with no default). */
  exceptions: AgeRow[];
  /** Small chips: places at the default age. */
  following: AgeRow[];
};

const byCode = (a: AgeRow, b: AgeRow) => a.regionCode.localeCompare(b.regionCode);

/** One country, split for the detail panel. */
export function countryDetail(rows: readonly AgeRow[], country: string): CountryDetail {
  const list = rows.filter((r) => r.countryCode === country);
  const defaultRow = list.find((r) => !r.regionCode) ?? null;
  const regions = list.filter((r) => r.regionCode).sort(byCode);
  return {
    country,
    name: countryName(country),
    defaultRow,
    exceptions: defaultRow ? regions.filter((r) => r.age !== defaultRow.age) : regions,
    following: defaultRow ? regions.filter((r) => r.age === defaultRow.age) : [],
  };
}

export type SearchHit = { row: AgeRow | null; country: string; title: string; detail: string; exception: boolean };

/**
 * Search every country at once — by code (AL, BC, US) or by name (Alabama,
 * Mexico). A country matches as itself (selecting it, and its whole-country
 * row if it has one); a state or province as a place. Exact code first, then
 * codes and names that start with the text, then names that contain it.
 */
export function searchPlaces(rows: readonly AgeRow[], text: string, limit = 8): SearchHit[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const score = (code: string, name: string | null): number | null => {
    const c = code.toLowerCase();
    const n = name?.toLowerCase() ?? "";
    if (c === q) return 0;
    if (c.startsWith(q)) return 1;
    if (n.startsWith(q)) return 2;
    if (q.length >= 3 && n.includes(q)) return 3;
    return null;
  };
  const defaults = new Map(rows.filter((r) => !r.regionCode).map((r) => [r.countryCode, r]));
  const hits: (SearchHit & { s: number })[] = [];
  for (const c of new Set(rows.map((r) => r.countryCode))) {
    const s = score(c, countryName(c));
    const def = defaults.get(c) ?? null;
    if (s !== null) hits.push({ s, row: def, country: c, title: countryName(c), detail: def ? `whole country · adult at ${def.age}` : "states and provinces", exception: false });
  }
  for (const r of rows) {
    if (!r.regionCode) continue;
    const s = score(r.regionCode, regionName(r.countryCode, r.regionCode));
    if (s === null) continue;
    const def = defaults.get(r.countryCode);
    hits.push({
      s, row: r, country: r.countryCode, title: placeName(r),
      detail: `adult at ${r.age}${def && def.age !== r.age ? " · exception" : ""}`,
      exception: Boolean(def && def.age !== r.age),
    });
  }
  return hits
    .sort((a, b) => a.s - b.s || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((h) => ({ row: h.row, country: h.country, title: h.title, detail: h.detail, exception: h.exception }));
}
