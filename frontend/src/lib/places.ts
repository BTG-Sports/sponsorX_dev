/* --------------------------------------------------------------------------
   POL-FE-117 — the place catalogue on the frontend: Country → Region → City.

   Owner, 2026-11-20: "its better if its dropdown that can be selected instead
   of free text … also add a search on the dropdowns". Where someone is from
   is PICKED from the United States and East Africa (Tanzania, Uganda, Kenya,
   Rwanda, Burundi, South Sudan, Ethiopia, Somalia, DR Congo), every region of
   each, and the cities of each region — for the US every incorporated place.

   The countries and regions are bundled (places-data.json, a few KB). A
   region's cities are fetched when it is picked (/places/CC-RC.json — the US
   alone is 19,000 places) and kept for the session. All three files are
   written by scripts/places/build-places.mjs from the same source as the
   backend's copy, which checks every write (backend/src/domain/places.ts).
   -------------------------------------------------------------------------- */

import data from "./places-data.json";

export type PlaceRegion = { code: string; name: string; cities: number };
export type PlaceCountry = { name: string; regionLabel: string; regions: PlaceRegion[] };
export type PlaceGroup = { label: string; countries: string[] };
/** A choice in a searchable dropdown; `group` is the heading it sits under. */
export type PlaceOption = { value: string; label: string; group?: string; hint?: string };
export type Place = { countryCode: string; regionCode: string; city: string };

const CATALOGUE = data as { asOf: string; groups: PlaceGroup[]; countries: Record<string, PlaceCountry> };

export const PLACES_AS_OF = CATALOGUE.asOf;
export const PLACE_GROUPS: readonly PlaceGroup[] = CATALOGUE.groups;

const up = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

export function placeCountry(code: string | null | undefined): PlaceCountry | null {
  return CATALOGUE.countries[up(code)] ?? null;
}

export const isPlaceCountry = (code: string | null | undefined) => placeCountry(code) !== null;

/** What the country calls its regions: State, Region, County, Province… */
export function regionLabel(code: string | null | undefined): string {
  return placeCountry(code)?.regionLabel ?? "Region";
}

export function placeRegion(country: string | null | undefined, region: string | null | undefined): PlaceRegion | null {
  return placeCountry(country)?.regions.find((r) => r.code === up(region)) ?? null;
}

/** The Country dropdown: grouped (United States · East Africa), A to Z within a group. */
export function countryChoices(only?: readonly string[]): PlaceOption[] {
  return PLACE_GROUPS.flatMap((g) =>
    g.countries
      .filter((c) => !only || only.includes(c))
      .map((c) => ({ value: c, label: CATALOGUE.countries[c]!.name, group: PLACE_GROUPS.length > 1 && !only ? g.label : undefined })),
  );
}

/** One country's regions, by name. */
export function regionChoices(country: string | null | undefined): PlaceOption[] {
  return (placeCountry(country)?.regions ?? []).map((r) => ({ value: r.code, label: r.name }));
}

/** "Austin, TX" in the US (house style); "Arusha, Tanzania" elsewhere; the region when there's no city. */
export function placeWords(p: { countryCode?: string | null; stateCode?: string | null; city?: string | null }): string {
  const country = up(p.countryCode) || "US";
  const city = (p.city ?? "").trim();
  if (country === "US") return [city, up(p.stateCode)].filter(Boolean).join(", ");
  const c = placeCountry(country);
  const region = placeRegion(country, p.stateCode)?.name ?? up(p.stateCode);
  return [city || region, c?.name ?? country].filter(Boolean).join(", ");
}

/* ------------------------------------------------------------------ cities */

const cities = new Map<string, Promise<string[]>>();

/** A region's cities, A to Z — fetched once per session. Rejects when the file can't be read. */
export function loadCities(country: string, region: string): Promise<string[]> {
  const key = `${up(country)}-${up(region)}`;
  let p = cities.get(key);
  if (!p) {
    p = fetch(`/places/${encodeURIComponent(key)}.json`).then((r) => {
      if (!r.ok) throw new Error(`cities ${key}: ${r.status}`);
      return r.json() as Promise<string[]>;
    });
    /* A failed read is not cached: the next pick tries again. */
    p.catch(() => cities.delete(key));
    cities.set(key, p);
  }
  return p;
}

export { filterChoices } from "./choice-filter";
