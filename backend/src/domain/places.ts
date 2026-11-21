/**
 * POL-BE-117 — the place catalogue: Country → Region → City.
 *
 * Owner, 2026-11-20: where someone is from is PICKED, never typed — the
 * United States and East Africa (Tanzania, Uganda, Kenya, Rwanda, Burundi,
 * South Sudan, Ethiopia, Somalia, DR Congo), every region of each, and the
 * cities in each region (for the US every incorporated place, 2025 Census).
 * The frontend offers exactly this list as searchable dropdowns; this module
 * is what makes the list a rule rather than a suggestion.
 *
 * The data is `backend/places/places.json`, written by
 * `scripts/places/build-places.mjs` (never by hand) — read once, on first use,
 * the way agreement-text.ts reads its files.
 *
 * WHAT IS CHECKED. Only what a write changes. An athlete whose city was typed
 * before the catalogue existed can still change their display name; the day
 * they move, the new place must be on the list. A country outside the
 * catalogue that is already on a record (an athlete in Canada, say) keeps its
 * old rules — no region list, no city list — but nobody can move INTO one.
 */

import { readFileSync } from "node:fs";

export type PlaceRegion = { code: string; name: string; cities: string[] };
export type PlaceCountry = { name: string; regionLabel: string; sources: string[]; regions: PlaceRegion[] };
export type PlaceCatalogue = {
  asOf: string;
  groups: { label: string; countries: string[] }[];
  countries: Record<string, PlaceCountry>;
};

const FILE = new URL("../../places/places.json", import.meta.url);

let cache: { catalogue: PlaceCatalogue; regions: Map<string, Map<string, { region: PlaceRegion; cities: Map<string, string> | null }>> } | null = null;

function load() {
  if (cache) return cache;
  const catalogue = JSON.parse(readFileSync(FILE, "utf8")) as PlaceCatalogue;
  const regions = new Map<string, Map<string, { region: PlaceRegion; cities: Map<string, string> | null }>>();
  for (const [cc, c] of Object.entries(catalogue.countries)) {
    /* Cities are indexed lazily per region (below): 19,000 US places are not
       worth a Map until someone in that state saves a city. */
    regions.set(cc, new Map(c.regions.map((r) => [r.code, { region: r, cities: null }])));
  }
  cache = { catalogue, regions };
  return cache;
}

const key = (s: string) => s.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");

/** The whole catalogue (tests, and anything that lists it). */
export function placeCatalogue(): PlaceCatalogue {
  return load().catalogue;
}

/** True when the country is one the catalogue lists. */
export function isCatalogueCountry(countryCode: string | null | undefined): boolean {
  return Boolean(countryCode && load().regions.has(countryCode.trim().toUpperCase()));
}

/** The region, or null when the catalogue has no such region in that country. */
export function catalogueRegion(countryCode: string, regionCode: string): PlaceRegion | null {
  return load().regions.get(countryCode.trim().toUpperCase())?.get(regionCode.trim().toUpperCase())?.region ?? null;
}

/** The city as the catalogue spells it ("austin" → "Austin"), or null when it isn't in that region. */
export function catalogueCity(countryCode: string, regionCode: string, city: string): string | null {
  const entry = load().regions.get(countryCode.trim().toUpperCase())?.get(regionCode.trim().toUpperCase());
  if (!entry) return null;
  entry.cities ??= new Map(entry.region.cities.map((c) => [key(c), c]));
  return entry.cities.get(key(city)) ?? null;
}

/** 400 — a place that is not on the list. The message says which part, in words. */
export class PlaceError extends Error {
  readonly status = 400;
  readonly code = "unknown_place";
  constructor(message: string) {
    super(message);
    this.name = "PlaceError";
  }
}

export type PlaceCheck = {
  countryCode: string;
  regionCode: string | null;
  city: string | null;
  /** The country itself is new on this record — it must be a catalogue country. */
  countryChanged: boolean;
  /** The region (or the country) changed — the region must be on the list. */
  regionChanged: boolean;
  /** Check the city: it changed, or the place around it moved. */
  checkCity: boolean;
};

/**
 * Check a place that a write changes, and return the city as the catalogue
 * spells it. Throws PlaceError naming the part that isn't on the list.
 */
export function checkPlace(p: PlaceCheck): { city: string | null } {
  const country = p.countryCode.trim().toUpperCase();
  const listed = isCatalogueCountry(country);
  if (p.countryChanged && !listed) throw new PlaceError("Choose your country from the list.");
  if (!listed) return { city: p.city };
  const c = load().catalogue.countries[country];
  const label = c.regionLabel.toLowerCase();
  if (p.regionChanged) {
    if (!p.regionCode) throw new PlaceError(`Choose your ${label} in ${c.name}.`);
    if (!catalogueRegion(country, p.regionCode)) throw new PlaceError(`Choose your ${label} from the list for ${c.name}.`);
  }
  if (!p.checkCity || p.city === null || p.city.trim() === "") return { city: p.city === null || p.city.trim() === "" ? null : p.city };
  if (!p.regionCode) throw new PlaceError(`Choose your ${label} before your city.`);
  const city = catalogueCity(country, p.regionCode, p.city);
  if (!city) {
    const region = catalogueRegion(country, p.regionCode);
    throw new PlaceError(`Choose your city from the list for ${region?.name ?? p.regionCode}, ${c.name}.`);
  }
  return { city };
}
