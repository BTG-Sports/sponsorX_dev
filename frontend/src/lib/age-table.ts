/* --------------------------------------------------------------------------
   The sign-up rules' age-of-majority table, as the Control Panel shows it
   (P1-ART-17, /admin/new-signups/rules). Pure: the country rail, one
   country's split into exceptions and places that follow its default, and
   a search across every country — over GET /signup-rules/age-table's rows.

   BUILT FOR SCALE (owner, 2026-10-05: "what if there are more countries and
   more states / provinces"). The page never renders the whole table: a rail
   lists countries (it scrolls inside its panel), one country shows at a
   time, and inside it only the EXCEPTIONS — places whose age differs from the
   country's own row — come first; every place is a large card with its
   name, status and history, PLACES_PER_PAGE to a page (owner, 2026-10-05:
   "list the items 20 items per page, make the items large, add more detail
   on each items"). So 20 countries or 200, 13 provinces or 37, the page
   stays about the same height.

   The table is still a bounded catalogue (one row per place that has its own
   age), so it is read whole and filtered here — the one kind of list the
   house pagination rule lets stay client-side.
   -------------------------------------------------------------------------- */

import { REGION_NAMES } from "./region-names";

export type AgeRow = { id: string; countryCode: string; regionCode: string; age: number; updatedBy: string | null; updatedAt: string };

/** A country's places, a page at a time (the owner's 20). */
export const PLACES_PER_PAGE = 20;

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

export type PlaceFilter = "all" | "exceptions" | "following";

/** The country's places as one list — exceptions first, then those that
 *  follow the default — narrowed by the panel's tabs. With no whole-country
 *  row, every place is its own and "exceptions" are all of them. */
export function placeList(d: CountryDetail, filter: PlaceFilter): AgeRow[] {
  if (filter === "exceptions") return d.exceptions;
  if (filter === "following") return d.following;
  return [...d.exceptions, ...d.following];
}

/** One page of a list, clamped to the pages that exist, with "Showing x–y of n". */
export function placePage<T>(list: readonly T[], page: number, size = PLACES_PER_PAGE): { rows: T[]; page: number; pages: number; start: number; end: number; total: number } {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const at = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = total === 0 ? 0 : (at - 1) * size + 1;
  const end = Math.min(total, at * size);
  return { rows: list.slice((at - 1) * size, at * size), page: at, pages, start, end, total };
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** A card's history line: who last set the age, and when. "seed" is the
 *  built-in default table; anyone else is a BTG admin (the API's only writer). */
export function changedWords(r: Pick<AgeRow, "updatedBy" | "updatedAt">): string {
  if (!r.updatedBy || r.updatedBy === "seed") return `Default table · ${dayOf(r.updatedAt)}`;
  return `BTG staff · ${dayOf(r.updatedAt)}`;
}

/** A card's status line, against its country's default. */
export function statusWords(r: AgeRow, d: Pick<CountryDetail, "defaultRow">): { text: string; exception: boolean } {
  const def = d.defaultRow;
  if (!def) return { text: `Its own age — ${r.countryCode} has no whole-country age`, exception: false };
  if (r.age === def.age) return { text: `Follows the ${r.countryCode} default`, exception: false };
  return { text: `Exception · ${r.countryCode} default is ${def.age}`, exception: true };
}
