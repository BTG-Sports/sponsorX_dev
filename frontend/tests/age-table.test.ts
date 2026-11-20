import { describe, expect, it } from "vitest";

import {
  OFF_LIST, PLACES_PER_PAGE, citiesIn, countryOptions, filterOptions, onPlaceList, regionOptions, ageBand, changedWords, placeList, placePage, statusWords, countryDetail, countryIndex, countryName, placeLabel, placeName, regionName, searchPlaces, type AgeRow,
} from "../src/lib/age-table";

/* --------------------------------------------------------------------------
   P1-ART-17 — the sign-up rules' Control Panel, built for scale: the country
   rail, a country's exceptions vs the places that follow its default, and
   the search across every country. Pure, from GET /signup-rules/age-table.

   POL-FE-117 (owner, 2026-11-20: "we need to make the age of majority page
   align with the countries, regions, and city that we listed earlier"): the
   countries and regions are the place catalogue's — the same list every
   place picker shows — every region has a card with its city count, and rows
   for places off the list are gathered under one "Not on the place list".
   -------------------------------------------------------------------------- */

const row = (countryCode: string, regionCode: string, age: number, updatedBy: string | null = null): AgeRow => ({
  id: `${countryCode}-${regionCode || "all"}`, countryCode, regionCode, age, updatedBy, updatedAt: "2026-09-30T00:00:00Z",
});
const rows = [
  row("US", "", 18), row("US", "AL", 19), row("US", "MD", 18), row("US", "MS", 21), row("US", "NY", 18),
  row("TZ", "01", 20), row("KE", "", 18),
  /* From before the catalogue: no athlete can pick these any more. */
  row("CA", "", 18), row("CA", "BC", 19), row("US", "PR", 21),
];

describe("names", () => {
  it("names a place from the catalogue first, then the older lists", () => {
    expect(placeLabel(row("US", "AL", 19))).toBe("AL, US");
    expect(placeLabel(row("US", "", 18))).toBe("All of US");
    expect(countryName("US")).toBe("United States");
    expect(countryName("CD")).toBe("DR Congo");
    expect(countryName(OFF_LIST)).toBe("Not on the place list");
    expect(regionName("US", "AL")).toBe("Alabama");
    expect(regionName("TZ", "01")).toBe("Arusha");
    expect(regionName("US", "ZZ")).toBeNull();
    expect(placeName(row("KE", "01", 18))).toBe("Baringo, Kenya");
    expect(placeName(row("CA", "BC", 19))).toBe("British Columbia, Canada");
    expect(placeName(row("US", "ZZ", 18))).toBe("ZZ, United States");
  });

  it("knows a place on the list from one that isn't", () => {
    expect(onPlaceList(row("US", "MD", 18))).toBe(true);
    expect(onPlaceList(row("TZ", "", 18))).toBe(true);
    expect(onPlaceList(row("US", "PR", 21))).toBe(false);
    expect(onPlaceList(row("CA", "", 18))).toBe(false);
  });

  it("bands an age: under 18, 18, 19, 20 and up", () => {
    expect([16, 18, 19, 20, 21].map(ageBand)).toEqual(["young", "eighteen", "nineteen", "older", "older"]);
  });
});

describe("the country rail", () => {
  it("is the place list's countries in the pickers' order, then the older rows", () => {
    const idx = countryIndex(rows);
    expect(idx.map((c) => c.country)).toEqual(["US", "BI", "CD", "ET", "KE", "RW", "SO", "SS", "TZ", "UG", OFF_LIST]);
    expect([...new Set(idx.map((c) => c.group))]).toEqual(["United States", "East Africa", "Older rows"]);
  });

  it("counts every region on the list, and a country nobody has set", () => {
    const idx = countryIndex(rows);
    const at = (c: string) => idx.find((x) => x.country === c);
    /* PR is off the list, so it is no exception of the US's. */
    expect(at("US")).toMatchObject({ name: "United States", defaultAge: 18, places: 51, regionWord: "State", exceptions: 2, not18: true, unset: false });
    expect(at("KE")).toMatchObject({ defaultAge: 18, places: 47, regionWord: "County", unset: false, not18: false });
    expect(at("TZ")).toMatchObject({ defaultAge: null, unset: false, not18: true });
    expect(at("RW")).toMatchObject({ defaultAge: null, unset: true, places: 5, regionWord: "Province" });
    expect(at(OFF_LIST)).toMatchObject({ places: 3, not18: true });
  });

  it("has no older-rows entry when every row is on the list", () => {
    expect(countryIndex([row("US", "", 18)]).some((c) => c.country === OFF_LIST)).toBe(false);
  });
});

describe("one country", () => {
  it("has a card for every region — its own row, or the default it follows", () => {
    const us = countryDetail(rows, "US");
    expect(us).toMatchObject({ name: "United States", regionWord: "State" });
    expect(us.defaultRow?.age).toBe(18);
    expect(us.exceptions.map((r) => r.regionCode)).toEqual(["AL", "MS"]);
    expect(us.exceptions.length + us.following.length).toBe(51);
    expect(us.following.find((r) => r.regionCode === "MD")).toMatchObject({ virtual: false, age: 18 });
    expect(us.following.find((r) => r.regionCode === "AK")).toMatchObject({ virtual: true, age: 18, id: "virtual:US-AK" });
    expect(us.exceptions[0]?.cities).toBe(463);
    expect(us.following.some((r) => r.regionCode === "PR")).toBe(false);
  });

  it("with no whole-country age, a region's own row stands and the rest count as 18", () => {
    const tz = countryDetail(rows, "TZ");
    expect(tz.defaultRow).toBeNull();
    expect(tz.exceptions.map((r) => [r.regionCode, r.age, r.virtual])).toEqual([["01", 20, false]]);
    expect(tz.following).toHaveLength(30);
    expect(tz.following.every((r) => r.virtual && r.age === 18)).toBe(true);
  });

  it("gathers the off-list rows, each as it stands", () => {
    const off = countryDetail(rows, OFF_LIST);
    expect(off.exceptions.map((r) => r.id)).toEqual(["CA-all", "CA-BC", "US-PR"]);
    expect(off.exceptions.every((r) => !r.virtual && r.cities === null)).toBe(true);
    expect(off.following).toEqual([]);
  });

  it("lists every place exceptions first, and narrows by tab", () => {
    const us = countryDetail(rows, "US");
    expect(placeList(us, "all").slice(0, 3).map((r) => r.regionCode)).toEqual(["AL", "MS", "AK"]);
    expect(placeList(us, "exceptions").map((r) => r.regionCode)).toEqual(["AL", "MS"]);
    expect(placeList(us, "following")).toHaveLength(49);
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

  it("says each card's status, and its cities and history", () => {
    const us = countryDetail(rows, "US");
    const card = (d: ReturnType<typeof countryDetail>, region: string) => [...d.exceptions, ...d.following].find((r) => r.regionCode === region)!;
    expect(statusWords(card(us, "AL"), us)).toEqual({ text: "Exception · US default is 18", exception: true, unset: false });
    expect(statusWords(card(us, "MD"), us)).toEqual({ text: "Follows the US default", exception: false, unset: false });
    expect(statusWords(card(us, "AK"), us)).toEqual({ text: "Follows the US default", exception: false, unset: false });
    const tz = countryDetail(rows, "TZ");
    expect(statusWords(card(tz, "01"), tz).text).toBe("Its own age — TZ has no whole-country age");
    expect(statusWords(card(tz, "02"), tz)).toEqual({ text: "No age set · counts as 18", exception: false, unset: true });
    const off = countryDetail(rows, OFF_LIST);
    expect(statusWords(off.exceptions[0]!, off).text).toBe("Older sign-ups only");
    expect(changedWords({ updatedBy: "seed", updatedAt: "2026-09-30T10:00:00Z" })).toBe("Default table · Sep 30, 2026");
    expect(changedWords({ updatedBy: "u_admin", updatedAt: "2026-10-05T10:00:00Z" })).toBe("BTG staff · Oct 5, 2026");
    expect(changedWords({ ...card(us, "AL"), updatedBy: "seed" })).toBe("463 cities · Default table · Sep 30, 2026");
    expect(changedWords(card(tz, "01"))).toBe("1 city · Default table · Sep 30, 2026");
    expect(changedWords(card(us, "AK"))).toBe("149 cities · no age of its own");
  });
});

describe("search across every place on the list", () => {
  it("puts an exact code first, then codes and names that start with it", () => {
    const hits = searchPlaces(rows, "al");
    expect(hits[0]).toMatchObject({ title: "Alabama, United States", detail: "adult at 19 · exception", exception: true, country: "US", regionCode: "AL" });
  });

  it("finds a region with no row of its own, and a country as itself", () => {
    expect(searchPlaces(rows, "dodoma")).toEqual([
      { row: null, country: "TZ", regionCode: "03", title: "Dodoma, Tanzania", detail: "no age set · counts as 18", exception: false },
    ]);
    expect(searchPlaces(rows, "alaska")[0]).toMatchObject({ row: null, regionCode: "AK", detail: "adult at 18 · follows US" });
    expect(searchPlaces(rows, "arusha")[0]).toMatchObject({ row: { id: "TZ-01" }, detail: "adult at 20" });
    expect(searchPlaces(rows, "kenya")[0]).toMatchObject({ row: { id: "KE-all" }, regionCode: null, title: "Kenya", detail: "whole country · adult at 18" });
    expect(searchPlaces(rows, "rwanda")[0]).toMatchObject({ row: null, regionCode: null, detail: "no age set · counts as 18" });
  });

  it("finds an older row under the off-list entry", () => {
    expect(searchPlaces(rows, "british")).toEqual([
      { row: rows[8], country: OFF_LIST, regionCode: "BC", title: "British Columbia, Canada", detail: "adult at 19 · not on the place list", exception: false },
    ]);
  });

  it("says nothing for an empty search, and keeps to the limit", () => {
    expect(searchPlaces(rows, "  ")).toEqual([]);
    expect(searchPlaces(rows, "m").length).toBeGreaterThan(3);
    expect(searchPlaces(rows, "m", 3)).toHaveLength(3);
  });
});

describe("the Add a place dropdowns", () => {
  it("offers the place list's countries, in the pickers' order, and nothing else", () => {
    const all = countryOptions();
    expect(all.map((o) => o.code)).toEqual(["US", "BI", "CD", "ET", "KE", "RW", "SO", "SS", "TZ", "UG"]);
    expect(all[0]).toEqual({ code: "US", name: "United States" });
    expect(all.some((o) => o.code === "CA")).toBe(false);
  });

  it("offers a country's regions on the list by name, and none off it", () => {
    expect(regionOptions("TZ")[0]).toEqual({ code: "01", name: "Arusha" });
    expect(regionOptions("KE")).toHaveLength(47);
    expect(regionOptions("US").map((o) => o.code)).not.toContain("PR");
    expect(regionOptions("CA")).toEqual([]);
  });

  it("says how many of the list's cities a place covers", () => {
    expect(citiesIn("US", "AL")).toBe(463);
    expect(citiesIn("TZ", "")).toBeGreaterThan(1);
    expect(citiesIn("CA", "")).toBeNull();
  });

  it("narrows options as you type — code first, then names", () => {
    const opts = countryOptions();
    expect(filterOptions(opts, "us")[0]?.code).toBe("US");
    expect(filterOptions(opts, "ken").map((o) => o.code)).toEqual(["KE"]);
    expect(filterOptions(opts, "").length).toBe(opts.length);
    expect(filterOptions(opts, "zzzz")).toEqual([]);
  });
});
