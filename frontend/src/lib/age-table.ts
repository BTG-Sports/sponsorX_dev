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

/* POL-FE-117 (owner, 2026-11-20: "we need to make the age of majority page
   align with the countries, regions, and city that we listed earlier"): the
   rail, the cards, the search and "Add a place" all read the place catalogue
   (lib/places) — the same United States · East Africa list, the same regions
   under the name each country uses, as every place picker. Every region has
   a card, with or without a row of its own (one without follows its
   country's age), and each card says how many of the catalogue's cities it
   covers: a city has no age of its own, it follows its region. Rows from
   before the catalogue (Canada, Puerto Rico…) still apply to anyone who
   signed up there, so they stay — gathered under one "Not on the place list"
   entry at the foot of the rail, where they can be changed or removed. */
import { REGION_NAMES } from "./region-names";
import { PLACE_GROUPS, placeCountry, placeRegion, regionLabel as catalogueRegionLabel } from "./places";

export type AgeRow = { id: string; countryCode: string; regionCode: string; age: number; updatedBy: string | null; updatedAt: string };

/** A region's card: its own row, or (`virtual`) the country's age it follows. `cities`: the catalogue's count, null off the list. */
export type PlaceRow = AgeRow & { virtual: boolean; cities: number | null };

/** The rail entry that gathers rows for places no athlete can pick any more. */
export const OFF_LIST = "OFF";

/** Who counts as an adult when a place has no age: 18, flagged for BTG (the API's UNKNOWN_PLACE_AGE). */
export const UNKNOWN_AGE = 18;

/** True when athletes can pick this place: a catalogue country, and a region of it. */
export function onPlaceList(r: Pick<AgeRow, "countryCode" | "regionCode">): boolean {
  return placeCountry(r.countryCode) !== null && (!r.regionCode || placeRegion(r.countryCode, r.regionCode) !== null);
}

/** What the country calls its regions — "State", "Region", "County", "Province". */
export function regionWord(country: string): string {
  return placeCountry(country) ? catalogueRegionLabel(country) : "State or province";
}

/** The catalogue's countries in the pickers' order: the United States, then East Africa A to Z. */
function catalogueCountries(): { code: string; group: string }[] {
  return PLACE_GROUPS.flatMap((g) =>
    [...g.countries].sort((a, b) => countryName(a).localeCompare(countryName(b))).map((code) => ({ code, group: g.label })),
  );
}

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
/** "United States" for US — the catalogue's name, else the browser's; the code if neither has one. */
export function countryName(code: string): string {
  if (code === OFF_LIST) return "Not on the place list";
  const listed = placeCountry(code);
  if (listed) return listed.name;
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

/** "Alabama" for US-AL, "Arusha" for TZ-01 — or null when no list has a name for it. */
export function regionName(country: string, region: string): string | null {
  return placeRegion(country, region)?.name ?? REGION_NAMES[country]?.[region] ?? null;
}

/** "Alabama, United States" · "United States" · "XX, United States" (no name known). */
export function placeName(r: Pick<AgeRow, "countryCode" | "regionCode">): string {
  if (!r.regionCode) return countryName(r.countryCode);
  return `${regionName(r.countryCode, r.regionCode) ?? r.regionCode}, ${countryName(r.countryCode)}`;
}

export type CountryEntry = {
  /** The country code — or OFF_LIST for the rows no athlete can pick any more. */
  country: string;
  name: string;
  /** The rail heading it sits under: "United States", "East Africa", or "Not on the place list". */
  group: string;
  /** The whole-country row's age — the default its places follow — or null. */
  defaultAge: number | null;
  /** Its regions on the place list (every one has a card), or the off-list rows. */
  places: number;
  /** What the country calls its regions, for the rail's words. */
  regionWord: string;
  /** Places whose age differs from the default. */
  exceptions: number;
  /** Any place here not at 18 — what the rail's "Not 18" filter keeps. */
  not18: boolean;
  /** No row at all: every athlete there counts as 18 and is flagged for BTG. */
  unset: boolean;
};

const keyOf = (country: string, region: string) => `${country}-${region}`;

/** The rail: every country on the place list, in the pickers' order, then the off-list rows as one entry when there are any. */
export function countryIndex(rows: readonly AgeRow[]): CountryEntry[] {
  const out: CountryEntry[] = catalogueCountries().map(({ code, group }) => {
    const c = placeCountry(code)!;
    const own = rows.filter((r) => r.countryCode === code && onPlaceList(r));
    const def = own.find((r) => !r.regionCode) ?? null;
    const regions = own.filter((r) => r.regionCode);
    return {
      country: code,
      name: c.name,
      group,
      defaultAge: def?.age ?? null,
      places: c.regions.length,
      regionWord: c.regionLabel,
      exceptions: def ? regions.filter((r) => r.age !== def.age).length : 0,
      not18: own.some((r) => r.age !== 18),
      unset: own.length === 0,
    };
  });
  const off = rows.filter((r) => !onPlaceList(r));
  if (off.length) {
    out.push({
      country: OFF_LIST, name: countryName(OFF_LIST), group: "Older rows", defaultAge: null, places: off.length, regionWord: "place",
      exceptions: 0, not18: off.some((r) => r.age !== 18), unset: false,
    });
  }
  return out;
}

export type CountryDetail = {
  country: string;
  name: string;
  /** What the country calls its regions ("State", "County"…). */
  regionWord: string;
  defaultRow: AgeRow | null;
  /** Big tiles: places that differ from the default (every place, with no default). */
  exceptions: PlaceRow[];
  /** Places at the default age — with their own row or simply following it. */
  following: PlaceRow[];
};

const real = (r: AgeRow, cities: number | null): PlaceRow => ({ ...r, virtual: false, cities });

/**
 * One country, split for the detail panel — every region on the place list,
 * A to Z by name. A region with no row of its own is a `virtual` card at the
 * country's age (or, with none, the unknown-place 18). The off-list entry is
 * its rows as they stand, each its own age.
 */
export function countryDetail(rows: readonly AgeRow[], country: string): CountryDetail {
  if (country === OFF_LIST) {
    const off = rows.filter((r) => !onPlaceList(r)).sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.regionCode.localeCompare(b.regionCode));
    return { country, name: countryName(country), regionWord: "place", defaultRow: null, exceptions: off.map((r) => real(r, null)), following: [] };
  }
  const c = placeCountry(country);
  const own = new Map(rows.filter((r) => r.countryCode === country).map((r) => [keyOf(r.countryCode, r.regionCode), r]));
  const defaultRow = own.get(keyOf(country, "")) ?? null;
  const cards: PlaceRow[] = [...(c?.regions ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((reg) => {
      const row = own.get(keyOf(country, reg.code));
      if (row) return real(row, reg.cities);
      return {
        id: `virtual:${keyOf(country, reg.code)}`, countryCode: country, regionCode: reg.code, age: defaultRow?.age ?? UNKNOWN_AGE,
        updatedBy: null, updatedAt: "", virtual: true, cities: reg.cities,
      };
    });
  const differs = (r: PlaceRow) => !r.virtual && (defaultRow ? r.age !== defaultRow.age : true);
  return {
    country,
    name: countryName(country),
    regionWord: regionWord(country),
    defaultRow,
    exceptions: cards.filter(differs),
    following: cards.filter((r) => !differs(r)),
  };
}

/** A search result: a row to change, or (row null, `regionCode` set) a place on the list with no row yet. */
export type SearchHit = { row: AgeRow | null; country: string; regionCode: string | null; title: string; detail: string; exception: boolean };

/**
 * Search every place at once — by code (AL, US) or by name (Alabama, Arusha,
 * Kenya). Every country and region on the place list matches, with a row of
 * its own or not; so do the off-list rows. Exact code first, then codes and
 * names that start with the text, then names that contain it.
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
  const own = new Map(rows.map((r) => [keyOf(r.countryCode, r.regionCode), r]));
  const hits: (SearchHit & { s: number })[] = [];
  for (const { code } of catalogueCountries()) {
    const c = placeCountry(code)!;
    const def = own.get(keyOf(code, "")) ?? null;
    const s = score(code, c.name);
    if (s !== null) hits.push({ s, row: def, country: code, regionCode: null, title: c.name, detail: def ? `whole country · adult at ${def.age}` : "no age set · counts as 18", exception: false });
    for (const reg of c.regions) {
      const rs = score(reg.code, reg.name);
      if (rs === null) continue;
      const row = own.get(keyOf(code, reg.code)) ?? null;
      const age = row?.age ?? def?.age ?? null;
      const exception = Boolean(row && def && row.age !== def.age);
      hits.push({
        s: rs, row, country: code, regionCode: reg.code, title: `${reg.name}, ${c.name}`,
        detail: age === null ? "no age set · counts as 18" : `adult at ${age}${exception ? " · exception" : row ? "" : ` · follows ${code}`}`,
        exception,
      });
    }
  }
  for (const r of rows) {
    if (onPlaceList(r)) continue;
    const s = r.regionCode ? score(r.regionCode, regionName(r.countryCode, r.regionCode)) : score(r.countryCode, countryName(r.countryCode));
    if (s !== null) hits.push({ s, row: r, country: OFF_LIST, regionCode: r.regionCode || null, title: placeName(r), detail: `adult at ${r.age} · not on the place list`, exception: false });
  }
  return hits
    .sort((a, b) => a.s - b.s || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((h) => ({ row: h.row, country: h.country, regionCode: h.regionCode, title: h.title, detail: h.detail, exception: h.exception }));
}

export type PlaceFilter = "all" | "exceptions" | "following";

/** The country's places as one list — exceptions first, then those that
 *  follow the default — narrowed by the panel's tabs. With no whole-country
 *  row, every place is its own and "exceptions" are all of them. */
export function placeList(d: CountryDetail, filter: PlaceFilter): PlaceRow[] {
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
export function changedWords(r: Pick<AgeRow, "updatedBy" | "updatedAt"> & { virtual?: boolean; cities?: number | null }): string {
  /* POL-FE-117 — the catalogue's cities the place covers: a city has no age of its own. */
  const cities = r.cities == null ? null : `${r.cities.toLocaleString("en-US")} ${r.cities === 1 ? "city" : "cities"}`;
  const who = r.virtual ? "no age of its own" : !r.updatedBy || r.updatedBy === "seed" ? `Default table · ${dayOf(r.updatedAt)}` : `BTG staff · ${dayOf(r.updatedAt)}`;
  return cities ? `${cities} · ${who}` : who;
}

/** A card's status line, against its country's default. `unset`: nobody has set an age that reaches it. */
export function statusWords(r: PlaceRow, d: Pick<CountryDetail, "country" | "defaultRow">): { text: string; exception: boolean; unset: boolean } {
  if (d.country === OFF_LIST) return { text: "Older sign-ups only", exception: false, unset: false };
  const def = d.defaultRow;
  if (r.virtual) {
    return def
      ? { text: `Follows the ${r.countryCode} default`, exception: false, unset: false }
      : { text: `No age set · counts as ${UNKNOWN_AGE}`, exception: false, unset: true };
  }
  if (!def) return { text: `Its own age — ${r.countryCode} has no whole-country age`, exception: false, unset: false };
  if (r.age === def.age) return { text: `Follows the ${r.countryCode} default`, exception: false, unset: false };
  return { text: `Exception · ${r.countryCode} default is ${def.age}`, exception: true, unset: false };
}

/* ----------------------------------------------- the Add a place dropdowns */

export type Option = { code: string; name: string };

/** POL-FE-117 — the place list's countries, in the pickers' order: what
 *  "Add a place" offers, so only a place an athlete can pick can be added. */
export function countryOptions(): Option[] {
  return catalogueCountries().map(({ code }) => ({ code, name: countryName(code) }));
}

/** A country's regions on the place list, by name. */
export function regionOptions(country: string): Option[] {
  return [...(placeCountry(country)?.regions ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ code: r.code, name: r.name }));
}

/** How many of the catalogue's cities a place covers — a region's own, or the whole country's. */
export function citiesIn(country: string, region: string): number | null {
  const c = placeCountry(country);
  if (!c) return null;
  if (!region) return c.regions.reduce((n, r) => n + r.cities, 0);
  return placeRegion(country, region)?.cities ?? null;
}

/** Options narrowed by what's typed: code first, then names that start with it, then contain it. */
export function filterOptions(options: readonly Option[], text: string): Option[] {
  const q = text.trim().toLowerCase();
  if (!q) return [...options];
  const rank = (o: Option) => (o.code.toLowerCase() === q ? 0 : o.name.toLowerCase().startsWith(q) ? 1 : o.code.toLowerCase().startsWith(q) ? 2 : o.name.toLowerCase().includes(q) ? 3 : 9);
  return options.map((o) => [rank(o), o] as const).filter(([r]) => r < 9).sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).map(([, o]) => o);
}
