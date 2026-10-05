import { describe, expect, it } from "vitest";

import {
  FOLLOWING_SHOWN, ageBand, countryDetail, countryIndex, countryName, placeLabel, placeName, regionName, searchPlaces, type AgeRow,
} from "../src/lib/age-table";

/* --------------------------------------------------------------------------
   P1-ART-17 — the sign-up rules' Control Panel, built for scale: the country
   rail, a country's exceptions vs the places that follow its default, and
   the search across every country. Pure, from GET /signup-rules/age-table.
   -------------------------------------------------------------------------- */

const row = (countryCode: string, regionCode: string, age: number): AgeRow => ({
  id: `${countryCode}-${regionCode || "all"}`, countryCode, regionCode, age, updatedBy: null, updatedAt: "2026-09-30T00:00:00Z",
});
const rows = [
  row("US", "", 18), row("US", "AL", 19), row("US", "MD", 18), row("US", "MS", 21), row("US", "NY", 18),
  row("CA", "", 18), row("CA", "BC", 19), row("CA", "ON", 18),
  row("GB", "", 18), row("KR", "", 19),
  row("MX", "JAL", 18), row("MX", "CMX", 18),
];

describe("names", () => {
  it("labels and names a place, the whole country included", () => {
    expect(placeLabel(row("US", "AL", 19))).toBe("AL, US");
    expect(placeLabel(row("US", "", 18))).toBe("All of US");
    expect(countryName("US")).toBe("United States");
    expect(regionName("US", "AL")).toBe("Alabama");
    expect(regionName("US", "ZZ")).toBeNull();
    expect(placeName(row("CA", "BC", 19))).toBe("British Columbia, Canada");
    expect(placeName(row("US", "ZZ", 18))).toBe("ZZ, United States");
    expect(placeName(row("GB", "", 18))).toBe("United Kingdom");
  });

  it("bands an age: under 18, 18, 19, 20 and up", () => {
    expect([16, 18, 19, 20, 21].map(ageBand)).toEqual(["young", "eighteen", "nineteen", "older", "older"]);
  });
});

describe("the country rail", () => {
  it("lists each country once — the biggest first, then by name — with its default and exceptions", () => {
    const idx = countryIndex(rows);
    expect(idx.map((c) => c.country)).toEqual(["US", "CA", "MX", "KR", "GB"]);
    expect(idx[0]).toMatchObject({ name: "United States", defaultAge: 18, places: 5, exceptions: 2, not18: true });
    expect(idx.find((c) => c.country === "MX")).toMatchObject({ defaultAge: null, exceptions: 0, not18: false });
    expect(idx.find((c) => c.country === "KR")).toMatchObject({ defaultAge: 19, places: 1, not18: true });
    expect(idx.find((c) => c.country === "GB")?.not18).toBe(false);
  });
});

describe("one country", () => {
  it("splits the exceptions from the places that follow the default", () => {
    const us = countryDetail(rows, "US");
    expect(us.defaultRow?.age).toBe(18);
    expect(us.exceptions.map((r) => r.regionCode)).toEqual(["AL", "MS"]);
    expect(us.following.map((r) => r.regionCode)).toEqual(["MD", "NY"]);
  });

  it("with no whole-country row, every place is shown as itself", () => {
    const mx = countryDetail(rows, "MX");
    expect(mx.defaultRow).toBeNull();
    expect(mx.exceptions.map((r) => r.regionCode)).toEqual(["CMX", "JAL"]);
    expect(mx.following).toEqual([]);
  });

  it("caps the chips it shows before Show all", () => {
    expect(FOLLOWING_SHOWN).toBe(40);
  });
});

describe("search across every country", () => {
  it("puts an exact code first, then codes and names that start with it", () => {
    const hits = searchPlaces(rows, "al");
    expect(hits[0]).toMatchObject({ title: "Alabama, United States", detail: "adult at 19 · exception", exception: true, country: "US" });
  });

  it("finds a place by its name, and a country as itself", () => {
    expect(searchPlaces(rows, "british").map((h) => h.title)).toEqual(["British Columbia, Canada"]);
    const mex = searchPlaces(rows, "mexico");
    expect(mex.map((h) => [h.title, h.row?.regionCode ?? null])).toEqual([
      ["Mexico", null],
      ["Mexico City, Mexico", "CMX"],
    ]);
    expect(searchPlaces(rows, "kr")[0]).toMatchObject({ title: "South Korea", detail: "whole country · adult at 19" });
  });

  it("says nothing for an empty search, and keeps to the limit", () => {
    expect(searchPlaces(rows, "  ")).toEqual([]);
    expect(searchPlaces(rows, "m").length).toBeGreaterThan(3);
    expect(searchPlaces(rows, "m", 3)).toHaveLength(3);
  });
});
