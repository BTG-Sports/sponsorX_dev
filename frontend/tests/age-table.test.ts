import { describe, expect, it } from "vitest";

import { ageBand, ageChips, groupPlaces, placeLabel, placeSections, type AgeRow } from "../src/lib/age-table";

/* --------------------------------------------------------------------------
   P1-ART-17 — the sign-up rules' Control Panel: the age table's grouping,
   filters and bands. Pure, from GET /signup-rules/age-table's rows.
   -------------------------------------------------------------------------- */

const row = (countryCode: string, regionCode: string, age: number): AgeRow => ({
  id: `${countryCode}-${regionCode || "all"}`, countryCode, regionCode, age, updatedBy: null, updatedAt: "2026-09-30T00:00:00Z",
});
const rows = [row("US", "MS", 21), row("US", "", 18), row("CA", "BC", 19), row("US", "AL", 19), row("US", "MD", 18), row("CA", "", 18)];

describe("the age table", () => {
  it("names a place, the whole country included", () => {
    expect(placeLabel(row("US", "AL", 19))).toBe("AL, US");
    expect(placeLabel(row("US", "", 18))).toBe("All of US");
  });

  it("bands an age: under 18, 18, 19, 20 and up", () => {
    expect([16, 18, 19, 20, 21].map(ageBand)).toEqual(["young", "eighteen", "nineteen", "older", "older"]);
  });

  it("offers a chip per age that exists, with counts, after All", () => {
    expect(ageChips(rows)).toEqual([
      { age: null, label: "All", count: 6 },
      { age: 18, label: "18", count: 3 },
      { age: 19, label: "19", count: 2 },
      { age: 21, label: "21", count: 1 },
    ]);
  });

  it("groups by country in table order, the whole country first, then regions A–Z", () => {
    expect(groupPlaces(rows, { age: null, q: "" }).map((g) => [g.country, g.places.map((p) => p.regionCode || "*")])).toEqual([
      ["US", ["*", "AL", "MD", "MS"]],
      ["CA", ["*", "BC"]],
    ]);
  });

  it("filters by age and by a search on the code, dropping empty countries", () => {
    expect(groupPlaces(rows, { age: 19, q: "" }).map((g) => [g.country, g.places.map((p) => p.regionCode)])).toEqual([
      ["US", ["AL"]],
      ["CA", ["BC"]],
    ]);
    expect(groupPlaces(rows, { age: null, q: "ms" }).map((g) => g.places.map((p) => p.regionCode))).toEqual([["MS"]]);
    expect(groupPlaces(rows, { age: null, q: "ca" }).map((g) => g.country)).toEqual(["CA"]);
    expect(groupPlaces(rows, { age: 25, q: "" })).toEqual([]);
  });

  it("gives countries with states their own section, and puts every whole-country-only place in one", () => {
    const more = [...rows, row("GB", "", 18), row("AU", "", 18), row("PR", "", 21)];
    const s = placeSections(more, { age: null, q: "" });
    expect(s.map((x) => [x.title, x.wholeCountries, x.places.map((p) => p.regionCode || p.countryCode)])).toEqual([
      ["US", false, ["US", "AL", "MD", "MS"]],
      ["CA", false, ["CA", "BC"]],
      ["Countries", true, ["AU", "GB", "PR"]],
    ]);
    expect(placeSections(more, { age: 21, q: "" }).map((x) => x.title)).toEqual(["US", "Countries"]);
    expect(placeSections(rows, { age: null, q: "" }).map((x) => x.title)).toEqual(["US", "CA"]);
  });
});
