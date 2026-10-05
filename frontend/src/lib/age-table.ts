/* --------------------------------------------------------------------------
   The sign-up rules' age-of-majority table, as the Control Panel shows it
   (P1-ART-17, /admin/new-signups/rules). Pure: grouping, filters and bands
   over GET /signup-rules/age-table's rows.

   The table is a bounded catalogue — one row per country or state with its
   own age, tens of rows, never a list that grows with use — so it is the
   one kind of list the house pagination rule lets stay whole and filter in
   the browser.
   -------------------------------------------------------------------------- */

export type AgeRow = { id: string; countryCode: string; regionCode: string; age: number; updatedBy: string | null; updatedAt: string };

/** "AL, US", or "All of US" for the whole-country row. */
export function placeLabel(r: Pick<AgeRow, "countryCode" | "regionCode">): string {
  return r.regionCode ? `${r.regionCode}, ${r.countryCode}` : `All of ${r.countryCode}`;
}

export type AgeBand = "young" | "eighteen" | "nineteen" | "older";

/** The tile's colour: under 18, the common 18, 19, and 20 and up. */
export function ageBand(age: number): AgeBand {
  if (age < 18) return "young";
  if (age === 18) return "eighteen";
  if (age === 19) return "nineteen";
  return "older";
}

/** All, then one chip per age present, youngest first, each with its count. */
export function ageChips(rows: readonly AgeRow[]): { age: number | null; label: string; count: number }[] {
  const by = new Map<number, number>();
  for (const r of rows) by.set(r.age, (by.get(r.age) ?? 0) + 1);
  return [
    { age: null, label: "All", count: rows.length },
    ...[...by.entries()].sort((a, b) => a[0] - b[0]).map(([age, count]) => ({ age, label: String(age), count })),
  ];
}

/**
 * Countries in the order the table first names them; within one, the
 * whole-country row first, then its regions A–Z. `age` and `q` (a code,
 * case-insensitive — the region's or the country's) narrow it; a country
 * left with nothing drops out.
 */
export function groupPlaces(rows: readonly AgeRow[], f: { age: number | null; q: string }): { country: string; places: AgeRow[] }[] {
  const q = f.q.trim().toUpperCase();
  const keep = (r: AgeRow) =>
    (f.age === null || r.age === f.age) && (!q || r.regionCode.includes(q) || r.countryCode.includes(q));
  const order: string[] = [];
  for (const r of rows) if (!order.includes(r.countryCode)) order.push(r.countryCode);
  return order
    .map((country) => ({
      country,
      places: rows
        .filter((r) => r.countryCode === country && keep(r))
        .sort((a, b) => (a.regionCode === "" ? -1 : b.regionCode === "" ? 1 : a.regionCode.localeCompare(b.regionCode))),
    }))
    .filter((g) => g.places.length > 0);
}

export type PlaceSection = { key: string; title: string; places: AgeRow[]; wholeCountries: boolean };

/**
 * The grid's sections. A country with states or provinces keeps its own
 * section (biggest first); every country that is only a whole-country row
 * shares one "Countries" section, so twenty single tiles don't each take a
 * row of the page. Filters as groupPlaces.
 */
export function placeSections(rows: readonly AgeRow[], f: { age: number | null; q: string }): PlaceSection[] {
  const regional = new Set(rows.filter((r) => r.regionCode).map((r) => r.countryCode));
  const groups = groupPlaces(rows, f);
  const own = groups
    .filter((g) => regional.has(g.country))
    .sort((a, b) => rows.filter((r) => r.countryCode === b.country).length - rows.filter((r) => r.countryCode === a.country).length)
    .map((g) => ({ key: g.country, title: g.country, places: g.places, wholeCountries: false }));
  const single = groups.filter((g) => !regional.has(g.country)).flatMap((g) => g.places)
    .sort((a, b) => a.countryCode.localeCompare(b.countryCode));
  return single.length ? [...own, { key: "countries", title: "Countries", places: single, wholeCountries: true }] : own;
}
