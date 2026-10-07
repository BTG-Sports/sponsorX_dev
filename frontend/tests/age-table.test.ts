import { describe, expect, it } from "vitest";

import {
  PLACES_PER_PAGE, countryOptions, filterOptions, regionOptions, ageBand, changedWords, placeList, placePage, statusWords, countryDetail, countryIndex, countryName, placeLabel, placeName, regionName, searchPlaces, type AgeRow,
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

  it("lists every place exceptions first, and narrows by tab", () => {
    const us = countryDetail(rows, "US");
    expect(placeList(us, "all").map((r) => r.regionCode)).toEqual(["AL", "MS", "MD", "NY"]);
    expect(placeList(us, "exceptions").map((r) => r.regionCode)).toEqual(["AL", "MS"]);
    expect(placeList(us, "following").map((r) => r.regionCode)).toEqual(["MD", "NY"]);
  });

  it("pages 20 at a time and clamps a page past the end", () => {
    expect(PLACES_PER_PAGE).toBe(20);
    const list = Array.from({ length: 48 }, (_, i) => i);
    expect(placePage(list, 1)).toMatchObject({ page: 1, pages: 3, start: 1, end: 20, total: 48 });
    expect(placePage(list, 3)).toMatchObject({ page: 3, start: 41, end: 48 });
    expect(placePage(list, 3).rows).toHaveLength(8);
    expect(placePage(list, 9).page).toBe(3);
    expect(placePage([], 1)).toMatchObject({ page: 1, pages: 1, start: 0, end: 0, total: 0, rows: [] });
  });

  it("says each card's status and history", () => {
    const us = countryDetail(rows, "US");
    expect(statusWords(row("US", "AL", 19), us)).toEqual({ text: "Exception · US default is 18", exception: true });
    expect(statusWords(row("US", "MD", 18), us)).toEqual({ text: "Follows the US default", exception: false });
    expect(statusWords(row("MX", "JAL", 18), countryDetail(rows, "MX")).text).toBe("Its own age — MX has no whole-country age");
    expect(changedWords({ updatedBy: "seed", updatedAt: "2026-09-30T10:00:00Z" })).toBe("Default table · Sep 30, 2026");
    expect(changedWords({ updatedBy: "u_admin", updatedAt: "2026-10-05T10:00:00Z" })).toBe("BTG staff · Oct 5, 2026");
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

describe("the Add a place dropdowns", () => {
  it("offers every country in the world by name, and nothing made up", () => {
    const all = countryOptions();
    expect(all.length).toBeGreaterThan(240);
    expect(all.find((o) => o.code === "US")?.name).toBe("United States");
    expect(all.some((o) => o.code === "XY")).toBe(false);
    expect(all.map((o) => o.name)).toEqual([...all.map((o) => o.name)].sort((a, b) => a.localeCompare(b)));
  });

  it("offers a country's states by name, or none when the list has no names", () => {
    expect(regionOptions("CA").map((o) => o.code)).toContain("BC");
    expect(regionOptions("CA")[0]).toEqual({ code: "AB", name: "Alberta" });
    expect(regionOptions("FR")).toEqual([]);
  });

  it("narrows options as you type — code first, then names", () => {
    const opts = countryOptions();
    expect(filterOptions(opts, "us")[0]?.code).toBe("US");
    expect(filterOptions(opts, "germ").map((o) => o.code)).toEqual(["DE"]);
    expect(filterOptions(opts, "").length).toBe(opts.length);
    expect(filterOptions(opts, "zzzz")).toEqual([]);
  });
});
